/**
 * SinwanJS View Module — JSX Runtime
 *
 * JSX factory that returns SinwanElement structures for the view renderer.
 * Imported automatically when using JSX syntax.
 */

import type { SinwanComponent, SinwanElement, SinwanNode } from "../types.ts";
import type { SinwanIntrinsicElements, SinwanSVGElements } from "./jsx-types";

// ─── Internal JSX types ─────────────────────────────────────

/** Type of the first argument to jsx/jsxs/jsxDEV — tag name, Fragment symbol, or component. */
type JSXElementType = string | symbol | SinwanComponent<any>;

/** Props object passed to jsx/jsxs/jsxDEV. */
type JSXProps = Record<string, unknown>;

/** Enhancer function for enhanced intrinsic elements. */
type EnhancerFn = (props: JSXProps) => JSXProps | SinwanElement;

/**
 * React-compatible `Fragment` — `[SHARED]`.
 *
 * SSR: safe (pure symbol).
 * Reactivity: pass-through — Sinwan's existing Fragment symbol (from the
 * JSX runtime) is the source of truth. Re-exporting it ensures
 * `<>...</>` and `<Fragment>...</Fragment>` resolve to the same node.
 *
 * @example
 * ```tsx
 * import { Fragment } from "sinwan/react";
 *
 * const Group = () => (
 *   <Fragment>
 *     <span>a</span>
 *     <span>b</span>
 *   </Fragment>
 * );
 * ```
 */
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

function isTextNode(node: SinwanNode): node is string | number {
  return node != null && (typeof node === "string" || typeof node === "number");
}

/** Merge adjacent string/number children into a single text node.
 *
 * Browsers parse HTML by collapsing adjacent text runs into one Text node. If
 * the virtual child list keeps them split (e.g. JSXText + {" "} + JSXText), the
 * hydration walker consumes too many DOM nodes and ends up past the element
 * boundaries. Merging them here makes the Sinwan tree match the DOM. */
function mergeAdjacentText(children: SinwanNode[]): SinwanNode[] {
  const merged: SinwanNode[] = [];
  for (const child of children) {
    const last = merged[merged.length - 1];
    if (isTextNode(child) && isTextNode(last)) {
      merged[merged.length - 1] = String(last) + String(child);
    } else {
      merged.push(child);
    }
  }
  return merged;
}

/**
 * Normalize children into an array of SinwanNode.
 */
export function normalizeChildren(children: unknown): SinwanNode[] {
  if (children == null || typeof children === "boolean") return [];
  if (Array.isArray(children))
    return mergeAdjacentText(children.flat(Infinity) as SinwanNode[]);
  return [children as SinwanNode];
}

const EMPTY_PROPS: Record<string, unknown> = {};

/** Registry populated by enhanced-elements.ts (side-effect import at bottom).
 * Declared with `var` because the import is hoisted and runs while this module
 * is still in its temporal dead zone; `var` is hoisted and safe to assign. */
var enhancedRegistry: Record<string, EnhancerFn> | undefined;

/** Register enhanced element wrappers — called once by enhanced-elements.ts.
 * Each enhancer receives props (including `children`) and returns either
 * modified props for the same tag, or a full SinwanElement replacement. */
export function registerEnhancedElements(
  registry: Record<string, EnhancerFn>,
): void {
  enhancedRegistry = registry;
}

/** Build a plain intrinsic element, skipping the enhanced-element interceptor.
 * Used by enhanced element wrappers to avoid infinite recursion. */
export function jsxIntrinsic(
  type: JSXElementType,
  props: JSXProps,
): SinwanElement {
  return buildElement(type, props, normalizeChildren(props?.children), true);
}

function stripChildrenProp(
  props: JSXProps | undefined,
): Record<string, unknown> {
  if (!props) return EMPTY_PROPS;
  if (!Object.prototype.hasOwnProperty.call(props, "children")) return props;
  const next: Record<string, unknown> = {};
  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    if (key === "children") continue;
    next[key] = props[key];
  }
  return next;
}

/**
 * Build an SinwanElement from a component/tag invocation.
 * Shared logic for jsx, jsxs, and jsxDEV.
 */
function buildElement(
  type: JSXElementType,
  props: JSXProps | undefined,
  children: SinwanNode[],
  skipEnhance = false,
): SinwanElement {
  // Handle Fragment
  if (type === Fragment) {
    return { tag: "", props: {}, children };
  }

  // Enhanced intrinsic elements — e.g. <form action={fn}> is intercepted
  // and routed to the Form wrapper so users never need to import it.
  if (!skipEnhance && typeof type === "string" && enhancedRegistry?.[type]) {
    const result = enhancedRegistry[type]({ ...props, children });
    if (result && typeof result === "object" && "tag" in result) {
      return result as SinwanElement;
    }
    const finalProps = stripChildrenProp(result);
    return { tag: type, props: finalProps, children };
  }

  // Functional components and intrinsic HTML elements both pass the type
  // through as `tag`. The renderer (client / server / hydration) is the
  // single owner of component-instance creation and lifecycle dispatch.
  // Calling the function eagerly here would bypass instance management
  // and break `onMounted`, `provide`/`inject`, and the parent/child tree.
  if (typeof type === "function") {
    const finalProps = props ?? {};
    // Only mirror children into props for components (not intrinsic tags).
    if (children.length > 0 && finalProps.children === undefined) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return { tag: type, props: finalProps, children };
  }

  if (typeof type === "string") {
    const finalProps = stripChildrenProp(props);
    return { tag: type, props: finalProps, children };
  }

  // Fallback
  return { tag: "", props: {}, children };
}

/**
 * JSX factory — called for elements with 0 or 1 child.
 * TypeScript auto-imports this in production mode (`react-jsx`).
 */
export function jsx(
  type: JSXElementType,
  props: JSXProps,
  key?: string | number | null,
): SinwanElement {
  return buildElement(type, props, normalizeChildren(props?.children));
}

/**
 * JSX static factory — called for elements with 2+ children.
 */
export function jsxs(
  type: JSXElementType,
  props: JSXProps,
  key?: string | number | null,
): SinwanElement {
  return buildElement(type, props, normalizeChildren(props?.children));
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
  type: JSXElementType,
  props: JSXProps,
  key: string | number | null | undefined,
  isStaticChildren: boolean,
  source?: JSXSource,
  self?: unknown,
): SinwanElement {
  const element = buildElement(type, props, normalizeChildren(props?.children));

  // Attach debug metadata (useful for dev-tools / error traces)
  if (source) {
    (element as any).__source = source;
  }

  return element;
}

export namespace JSX {
  export type Element = SinwanNode;
  export interface IntrinsicAttributes {
    key?: string | number;
    ref?: unknown;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements
    extends SinwanIntrinsicElements, SinwanSVGElements {}
}

// Load enhanced element wrappers (Form, Input, Button, etc.) so the JSX
// factory can intercept matching lowercase tags automatically. This is a
// side-effect import — the module registers itself via registerEnhancedElements.
import "./enhanced-elements.ts";
