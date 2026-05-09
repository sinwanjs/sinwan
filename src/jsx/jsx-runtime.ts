/**
 * SinwanJS View Module — JSX Runtime
 *
 * JSX factory that returns SinwanElement structures for the view renderer.
 * Imported automatically when using JSX syntax.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type { SinwanIntrinsicElements } from "./jsx-types";

export const Fragment = Symbol("Fragment");

/**
 * A string that has been marked as safe HTML (already escaped).
 * Used for raw HTML injection with explicit trust marking.
 */
export class HtmlEscapedString extends String {
  constructor(public readonly value: string) {
    super(value);
  }
  override toString() {
    return this.value;
  }
}

export const raw = (str: string) => new HtmlEscapedString(str);

// Fast path for intrinsic elements
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

/**
 * Normalize children into an array of SinwanNode.
 */
function normalizeChildren(children: any): SinwanNode[] {
  if (children == null || typeof children === "boolean") return [];
  if (Array.isArray(children)) return children.flat(Infinity);
  return [children];
}

/**
 * Build an SinwanElement from a component/tag invocation.
 * Shared logic for jsx, jsxs, and jsxDEV.
 */
function buildElement(
  type: any,
  props: any,
  children: SinwanNode[],
): SinwanElement {
  // Handle Fragment
  if (type === Fragment) {
    return { tag: "", props: {}, children };
  }

  // Functional components and intrinsic HTML elements both pass the type
  // through as `tag`. The renderer (client / server / hydration) is the
  // single owner of component-instance creation and lifecycle dispatch.
  // Calling the function eagerly here would bypass instance management
  // and break `onMounted`, `provide`/`inject`, and the parent/child tree.
  if (typeof type === "function" || typeof type === "string") {
    const finalProps = props ?? {};
    // Mirror children into props.children so component setup can read it.
    if (children.length > 0 && finalProps.children === undefined) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return { tag: type, props: finalProps, children };
  }

  // Fallback
  return { tag: "", props: {}, children };
}

/**
 * JSX factory — called for elements with 0 or 1 child.
 * TypeScript auto-imports this in production mode (`react-jsx`).
 */
export function jsx(type: any, props: any, key?: any): SinwanElement {
  return buildElement(type, props, normalizeChildren(props?.children));
}

/**
 * JSX static factory — called for elements with 2+ children.
 * `props.children` is **already an array**, so we skip normalizeChildren.
 */
export function jsxs(type: any, props: any, key?: any): SinwanElement {
  const children = props?.children;
  // Children is guaranteed to be an array by the compiler
  return buildElement(
    type,
    props,
    Array.isArray(children)
      ? children.flat(Infinity)
      : normalizeChildren(children),
  );
}

/**
 * Source location metadata attached by the compiler in dev mode.
 */
export interface JSXSource {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * JSX dev factory — called in dev mode (`react-jsxdev`).
 * Receives extra source/debug info for better error messages.
 */
export function jsxDEV(
  type: any,
  props: any,
  key: any,
  isStaticChildren: boolean,
  source?: JSXSource,
  self?: unknown,
): SinwanElement {
  const children = isStaticChildren
    ? Array.isArray(props?.children)
      ? props.children.flat(Infinity)
      : normalizeChildren(props?.children)
    : normalizeChildren(props?.children);

  const element = buildElement(type, props, children);

  // Attach debug metadata (useful for dev-tools / error traces)
  if (source) {
    (element as any).__source = source;
  }

  return element;
}

export namespace JSX {
  export type Element = SinwanElement | Promise<SinwanElement>;
  export interface IntrinsicAttributes {
    key?: string | number;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements extends SinwanIntrinsicElements {}
}

declare global {
  namespace JSX {
    type Element = SinwanElement | Promise<SinwanElement>;
    interface IntrinsicAttributes {
      key?: string | number;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements extends SinwanIntrinsicElements {}
  }
}
