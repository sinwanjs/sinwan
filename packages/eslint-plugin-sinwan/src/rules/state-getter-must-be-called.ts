import type { Rule } from "eslint";
import type {
  Node,
  Identifier,
  CallExpression,
  VariableDeclarator,
  ArrayPattern,
} from "estree";

const DEFAULT_SOURCES = ["useState", "useReducer"];

interface RuleOptions {
  sources?: string[];
}

function isUseStateLike(
  init: Node | null | undefined,
  sources: string[],
): init is CallExpression {
  if (!init || init.type !== "CallExpression") return false;
  if (init.callee.type !== "Identifier") return false;
  return sources.includes(init.callee.name);
}

function collectGetterNames(node: Node, sources: string[]): Set<string> {
  const getters = new Set<string>();

  function walk(n: Node | null | undefined) {
    if (!n) return;

    if (n.type === "VariableDeclarator") {
      const decl = n as VariableDeclarator;
      if (isUseStateLike(decl.init, sources)) {
        const id = decl.id;
        if (id.type === "ArrayPattern" && id.elements.length > 0) {
          const first = id.elements[0];
          if (first && first.type === "Identifier") {
            getters.add(first.name);
          }
        }
      }
    }

    // Walk children
    switch (n.type) {
      case "Program":
        (n as any).body.forEach((child: Node) => walk(child));
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        walk((n as any).body);
        break;
      case "BlockStatement":
        (n as any).body.forEach((child: Node) => walk(child));
        break;
      case "VariableDeclaration":
        (n as any).declarations.forEach((child: VariableDeclarator) =>
          walk(child),
        );
        break;
      case "ExpressionStatement":
        walk((n as any).expression);
        break;
      case "ReturnStatement":
        walk((n as any).argument);
        break;
      case "IfStatement":
        walk((n as any).test);
        walk((n as any).consequent);
        walk((n as any).alternate);
        break;
      case "JSXElement":
        walk((n as any).openingElement);
        (n as any).children.forEach((child: Node) => walk(child));
        break;
      case "JSXFragment":
        (n as any).children.forEach((child: Node) => walk(child));
        break;
      case "JSXExpressionContainer":
        walk((n as any).expression);
        break;
    }
  }

  walk(node);
  return getters;
}

function isInsideJSX(node: Node): boolean {
  let current: Node | null | undefined = (node as any).parent;
  while (current) {
    if (
      current.type === "JSXExpressionContainer" ||
      current.type === "JSXSpreadAttribute" ||
      current.type === "JSXOpeningElement"
    ) {
      return true;
    }
    current = (current as any).parent;
  }
  return false;
}

function isCallee(node: Identifier): boolean {
  const parent = (node as any).parent as Node | null | undefined;
  return (
    parent?.type === "CallExpression" &&
    (parent as CallExpression).callee === node
  );
}

/**
 * Returns true if the identifier is part of a declaration pattern
 * (e.g. `const [count] = useState(0)`), or otherwise a definition site.
 * Such occurrences should never be reported.
 */
function isDeclarationIdentifier(node: Identifier): boolean {
  const parent = (node as any).parent as Node | null | undefined;
  if (!parent) return false;
  // const [count] = ...
  if (parent.type === "ArrayPattern") return true;
  // const count = ...
  if (parent.type === "VariableDeclarator" && (parent as any).id === node)
    return true;
  // function f(count) {}
  if (
    parent.type === "FunctionDeclaration" ||
    parent.type === "FunctionExpression" ||
    parent.type === "ArrowFunctionExpression"
  ) {
    const params = (parent as any).params as Node[] | undefined;
    if (params && params.includes(node as any)) return true;
  }
  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce state getters are called explicitly outside JSX",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          sources: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      mustCall:
        "State getter '{{name}}' must be called explicitly outside JSX: '{{name}}()'",
      mustCallLength:
        "State getter '{{name}}' must be called before accessing property: '{{name}}().length'",
    },
  },

  create(context) {
    const options: RuleOptions = context.options[0] || {};
    const sources = options.sources || DEFAULT_SOURCES;

    // Collect getter names from the entire file AST
    const getters = collectGetterNames(context.getSourceCode().ast, sources);

    return {
      Identifier(node: Identifier) {
        if (!getters.has(node.name)) return;

        // Inside JSX — handled by the other rule, skip here
        if (isInsideJSX(node)) return;

        // Definition sites / declarations should not be reported
        if (isDeclarationIdentifier(node)) return;

        // Already called: `count()`
        if (isCallee(node)) return;

        // Is it `items.length` where items is a getter?
        const parent = (node as any).parent as Node | null | undefined;
        if (
          parent &&
          parent.type === "MemberExpression" &&
          (parent as any).object === node
        ) {
          const prop = (parent as any).property;
          const propName =
            prop && prop.type === "Identifier" ? prop.name : undefined;
          // Report with a specific message for `.length`, otherwise fall back to generic mustCall
          if (propName === "length") {
            context.report({
              node: parent,
              messageId: "mustCallLength",
              data: { name: node.name },
            });
          } else {
            context.report({
              node,
              messageId: "mustCall",
              data: { name: node.name },
            });
          }
          return;
        }

        // Any other use without calling
        context.report({
          node,
          messageId: "mustCall",
          data: { name: node.name },
        });
      },
    };
  },
};

export default rule;
