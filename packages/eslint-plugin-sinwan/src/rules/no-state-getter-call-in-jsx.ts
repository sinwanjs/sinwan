import type { Rule } from "eslint";
import type {
  Node,
  Identifier,
  CallExpression,
  VariableDeclarator,
} from "estree-jsx";

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

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calling state getters inside JSX expressions",
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
      noCallInJsx:
        "Pass getter '{{name}}' directly in JSX, no need to call '{{name}}()'",
    },
  },

  create(context) {
    const options: RuleOptions = context.options[0] || {};
    const sources = options.sources || DEFAULT_SOURCES;
    const getters = collectGetterNames(context.getSourceCode().ast, sources);

    return {
      JSXExpressionContainer(node: Node) {
        const expr = (node as any).expression;
        if (!expr || expr.type !== "CallExpression") return;

        const callee = (expr as CallExpression).callee;
        if (callee.type === "Identifier" && getters.has(callee.name)) {
          context.report({
            node: expr,
            messageId: "noCallInJsx",
            data: { name: callee.name },
          });
        }
      },
    };
  },
};

export default rule;
