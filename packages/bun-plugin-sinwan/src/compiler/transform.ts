/**
 * SinwanJS Compiler — JSX Transform
 *
 * Transforms JSX AST to use template hoisting.
 * Static JSX elements are extracted to module-level template strings
 * and replaced with optimized template creation calls.
 */

import { parse } from "@babel/parser";
import _generate from "@babel/generator";
const generate =
  typeof _generate === "function"
    ? _generate
    : ((_generate as any).default ?? _generate);
import * as t from "@babel/types";
import _traverse from "@babel/traverse";
// Handle CJS/ESM interop — @babel/traverse default may be nested
const traverse =
  typeof _traverse === "function"
    ? _traverse
    : ((_traverse as any).default ?? _traverse);

export interface TransformOptions {
  /** Enable template hoisting (default: true) */
  hoist?: boolean;
  /** Enable dev mode (source maps, etc.) */
  dev?: boolean;
}

interface TemplateSlot {
  path: number[];
  type: string;
  name?: string;
  expr?: t.Expression;
}

interface ExtractedTemplate {
  html: string;
  slots: TemplateSlot[];
}

let slotId = 0;
function nextSlotId(): string {
  return `<!--s:${slotId++}-->`;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function serializeExpr(expr: t.Expression): string {
  const result = generate(t.expressionStatement(expr));
  return result.code.replace(/;\s*$/, "");
}

function extractTemplate(node: any): ExtractedTemplate {
  slotId = 0;
  const slots: TemplateSlot[] = [];
  const html = elementToHtml(node, slots, []);
  return { html, slots };
}

function elementToHtml(
  node: any,
  slots: TemplateSlot[],
  path: number[],
): string {
  const tagName = jsxNameToString(node.openingElement.name);
  if (tagName === "") return "";
  // Component calls (capitalized tags) cannot be hoisted into HTML strings
  const firstChar = tagName.charAt(0);
  if (firstChar && firstChar === firstChar.toUpperCase()) {
    throw new Error("Cannot hoist element containing component calls");
  }
  const isVoid = VOID_ELEMENTS.has(tagName);
  let html = `<${tagName}`;

  for (const attr of node.openingElement.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      throw new Error("Cannot hoist element with spread attributes");
    }
    const attrName = attr.name.name;
    if (attrName === "children") continue;
    if (attrName === "ref") {
      throw new Error("Cannot hoist element with ref");
    }
    if (attr.value?.type === "JSXExpressionContainer") {
      const expr = attr.value.expression;
      if (expr.type !== "JSXEmptyExpression") {
        slots.push({
          path: [...path],
          type: attrName.startsWith("on") ? "event" : "attr",
          name: attrName,
          expr,
        });
      }
      html += ` ${attrName}=""`;
      continue;
    }
    if (
      attr.value?.type === "JSXText" ||
      attr.value?.type === "StringLiteral"
    ) {
      html += ` ${attrName}="${escapeHtml(attr.value.value)}"`;
    } else if (!attr.value) {
      html += ` ${attrName}`;
    }
  }

  html += isVoid ? " />" : ">";
  if (isVoid) return html;

  let childIndex = 0;
  for (const child of node.children) {
    if (child.type === "JSXText") {
      const text = child.value.trim();
      if (text) {
        html += escapeHtml(text);
        childIndex++;
      }
    } else if (child.type === "JSXExpressionContainer") {
      if (child.expression.type === "JSXEmptyExpression") continue;
      const slot = nextSlotId();
      slots.push({
        path: [...path, childIndex],
        type: "child",
        expr: child.expression,
      });
      html += slot;
      childIndex++;
    } else if (child.type === "JSXElement") {
      html += elementToHtml(child, slots, [...path, childIndex]);
      childIndex++;
    }
  }

  html += `</${tagName}>`;
  return html;
}

function jsxNameToString(name: any): string {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXMemberExpression") {
    return jsxNameToString(name.object) + "." + jsxNameToString(name.property);
  }
  return "";
}

export function transformJSX(
  code: string,
  filename: string,
  options: TransformOptions = {},
): { code: string; map?: any } {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
    sourceFilename: filename,
  });

  const hoist = options.hoist !== false;
  const templates: { id: string; template: ExtractedTemplate }[] = [];
  let templateCounter = 0;

  traverse(ast, {
    JSXElement(path: any) {
      if (!hoist) return;
      if (path.findParent((p: any) => p.isJSXElement())) return;

      const opening = path.node.openingElement;
      const tagName = opening.name;
      if (tagName.type !== "JSXIdentifier") return;
      const name = tagName.name;
      if (!name || name[0] !== name[0].toLowerCase()) return;

      try {
        const extracted = extractTemplate(path.node);
        const tmplId = `_$tmpl_${templateCounter++}`;
        templates.push({ id: tmplId, template: extracted });

        const dynamicExprs = extracted.slots
          .filter((s) => s.expr)
          .map((s) => s.expr!);

        const templateExpr = t.callExpression(
          t.identifier("_$createTemplate"),
          [t.identifier(tmplId), t.arrayExpression(dynamicExprs)],
        );

        // If parent is JSX (element or fragment), wrap in {…} so the
        // output stays valid JSX for the next transform pass (esbuild).
        const parentIsJSX =
          path.parentPath?.isJSXElement() || path.parentPath?.isJSXFragment();

        path.replaceWith(
          parentIsJSX ? t.jsxExpressionContainer(templateExpr) : templateExpr,
        );
      } catch {
        /* leave as-is */
      }
    },
  });

  if (templates.length === 0) {
    const result = generate(ast, {
      sourceMaps: true,
      sourceFileName: filename,
    });
    return { code: result.code, map: result.map };
  }

  const templateDecls = templates.map(({ id, template }) =>
    t.variableDeclaration("const", [
      t.variableDeclarator(
        t.identifier(id),
        t.objectExpression([
          t.objectProperty(
            t.identifier("html"),
            t.stringLiteral(template.html),
          ),
          t.objectProperty(
            t.identifier("slots"),
            t.arrayExpression(
              template.slots.map((slot) =>
                t.objectExpression([
                  t.objectProperty(
                    t.identifier("path"),
                    t.arrayExpression(
                      slot.path.map((i) => t.numericLiteral(i)),
                    ),
                  ),
                  t.objectProperty(
                    t.identifier("type"),
                    t.stringLiteral(slot.type),
                  ),
                  ...(slot.name
                    ? [
                        t.objectProperty(
                          t.identifier("name"),
                          t.stringLiteral(slot.name),
                        ),
                      ]
                    : []),
                ]),
              ),
            ),
          ),
        ]),
      ),
    ]),
  );

  const importDecl = t.importDeclaration(
    [
      t.importSpecifier(
        t.identifier("_$createTemplate"),
        t.identifier("_$createTemplate"),
      ),
    ],
    t.stringLiteral("sinwan/renderer"),
  );

  ast.program.body.unshift(importDecl, ...templateDecls);

  const result = generate(ast, { sourceMaps: true, sourceFileName: filename });
  return { code: result.code, map: result.map };
}
