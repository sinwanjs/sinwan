/**
 * SinwanJS View Module — Renderer & Component Registry
 *
 * Renders Sinwan component trees to HTML strings.
 * Supports async components, caching, and streaming.
 */

import type {
  SinwanNode,
  SinwanElement,
  SinwanComponent,
  SinwanPage,
  SinwanSlots,
} from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import { isEventProp } from "../renderer/events.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Match,
  Portal,
  Switch,
  Visible,
  Show,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
} from "../component/control-flow.ts";

// Component cache - maps component identity to render function
const componentCache = new WeakMap<SinwanComponent<any>, boolean>();

// Page registry
const pageRegistry = new Map<string, SinwanPage<any>>();

/**
 * Register a page renderer by name.
 */
export function registerPage<D extends object = {}>(
  name: string,
  page: SinwanPage<D>,
): void {
  pageRegistry.set(name, page);
}

/**
 * Get a registered page by name.
 */
export function getPage<D extends object = {}>(
  name: string,
): SinwanPage<D> | undefined {
  return pageRegistry.get(name);
}

/**
 * Check if a page is registered.
 */
export function hasPage(name: string): boolean {
  return pageRegistry.has(name);
}

/**
 * Render a registered page to an HTML string.
 */
export async function renderPage<D extends object = {}>(
  name: string,
  data: D,
): Promise<string> {
  const page = getPage<D>(name);
  if (!page) {
    throw new Error(`Page "${name}" not found in registry`);
  }

  const element = await page(data);
  return renderToString(element);
}

/**
 * Render a node tree to an HTML string.
 * Handles primitives, elements, components, and arrays.
 */
export async function renderToString(node: SinwanNode): Promise<string> {
  // Handle null/undefined/boolean
  if (node == null || typeof node === "boolean") {
    return "";
  }

  // Handle strings (escape them)
  if (typeof node === "string") {
    return escapeHtml(node);
  }

  // Handle numbers
  if (typeof node === "number") {
    return String(node);
  }

  // Handle pre-escaped HTML
  if (node instanceof HtmlEscapedString) {
    return node.value;
  }

  // Handle reactive containers — read current value and render as text
  if (isSignal(node) || isComputed(node)) {
    return escapeHtml(String((node as any).value));
  }

  // Handle arrays - render each child and concatenate
  if (Array.isArray(node)) {
    const results = await Promise.all(
      node.map((child) => renderToString(child)),
    );
    return results.join("");
  }

  // Handle promises (async components)
  if (node instanceof Promise) {
    return renderElement(await node);
  }

  // Handle elements
  return renderElement(node as SinwanElement);
}

/**
 * Render an element to HTML string.
 */
async function renderElement(element: SinwanElement): Promise<string> {
  const { tag, props, children } = element;

  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal
  ) {
    return renderElement((tag as Function)(props));
  }

  if (tag === Visible) {
    return renderElement((tag as Function)(props));
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    return renderToString(
      when ? resolveShowChildren(element, when) : props.fallback as SinwanNode,
    );
  }

  if (isForElement(element)) {
    return renderForElement(element);
  }

  if (isSwitchElement(element)) {
    return renderToString(resolveSwitchContent(element));
  }

  if (isMatchElement(element)) {
    const when = readReactive(props.when);
    return renderToString(when ? resolveMatchChildren(element, when) : null);
  }

  if (isIndexElement(element)) {
    return renderIndexElement(element);
  }

  if (isKeyElement(element)) {
    const key = readReactive(props.when);
    return renderToString(resolveKeyChildren(element, key));
  }

  if (isDynamicElement(element)) {
    const tag = readReactive(props.component);
    const dynamic = createDynamicElement(element, tag);
    return dynamic ? renderElement(dynamic) : "";
  }

  if (isPortalElement(element)) {
    return "";
  }

  // Handle functional components
  if (typeof tag === "function") {
    const result = await tag(props);
    return renderToString(result);
  }

  // Handle intrinsic HTML elements
  if (typeof tag === "string") {
    return renderIntrinsicElement(tag, props, children);
  }

  // Fallback - shouldn't happen with valid JSX
  return renderToString(children);
}

// Void elements that don't have closing tags
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
 * Render an intrinsic HTML element.
 */
async function renderIntrinsicElement(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
): Promise<string> {
  const attrs = renderAttributes(props);

  // Void elements have no children and no closing tag
  if (VOID_ELEMENTS.has(tag)) {
    return attrs ? `<${tag}${attrs}>` : `<${tag}>`;
  }

  // Render children (handles dangerouslySetInnerHTML)
  const childrenHtml = await renderChildren(children, props);

  // Build element
  return attrs
    ? `<${tag}${attrs}>${childrenHtml}</${tag}>`
    : `<${tag}>${childrenHtml}</${tag}>`;
}

/**
 * Render HTML attributes from props.
 */
function renderAttributes(props: Record<string, unknown>): string {
  let attrs = "";

  for (const [key, value] of Object.entries(props)) {
    // Skip children and special props
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML" ||
      isEventProp(key)
    ) {
      continue;
    }

    const resolvedValue = readReactive(value);

    // Skip null/undefined/false values
    if (resolvedValue == null || resolvedValue === false) continue;

    attrs += renderServerAttribute(key, resolvedValue);
  }

  return attrs;
}

/**
 * Render children, with special handling for dangerouslySetInnerHTML.
 */
async function renderChildren(
  children: SinwanNode[],
  props: Record<string, unknown>,
): Promise<string> {
  // Check for dangerous inner HTML
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;
  if (dangerous && typeof dangerous.__html === "string") {
    return dangerous.__html; // Trust the HTML (user explicitly marked safe)
  }

  return renderToString(children);
}

// Wire up dangerouslySetInnerHTML handling by patching renderIntrinsicElement
const originalRenderIntrinsic = renderIntrinsicElement;

/**
 * Check if children is a slots object (named slots).
 */
export function isSlots(children: unknown): children is SinwanSlots {
  return (
    children != null &&
    typeof children === "object" &&
    !Array.isArray(children) &&
    !(children instanceof HtmlEscapedString)
  );
}

async function renderForElement(element: SinwanElement): Promise<string> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? renderToString(props.fallback) : "";
  }

  if (each.length === 0) {
    return props.fallback ? renderToString(props.fallback) : "";
  }

  const rendered = await Promise.all(
    each.map((item, index) => renderToString(props.children!(item, () => index))),
  );
  return rendered.join("");
}

async function renderIndexElement(element: SinwanElement): Promise<string> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: () => unknown, index: number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? renderToString(props.fallback) : "";
  }

  if (each.length === 0) {
    return props.fallback ? renderToString(props.fallback) : "";
  }

  const rendered = await Promise.all(
    each.map((item, index) => renderToString(props.children!(() => item, index))),
  );
  return rendered.join("");
}

function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as { fallback?: SinwanNode; children?: SinwanNode };
  const children = normalizeContent(props.children ?? element.children);

  for (const child of children) {
    const match = getMatchElement(child);
    if (!match) {
      continue;
    }

    const when = readReactive((match.props as any).when);
    if (when) {
      return resolveMatchChildren(match, when);
    }
  }

  return props.fallback;
}

function resolveMatchChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function resolveKeyChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function createDynamicElement(element: SinwanElement, tag: unknown): SinwanElement | null {
  if (typeof tag !== "string" && typeof tag !== "function") {
    return null;
  }

  const { component, ...props } = element.props as Record<string, unknown>;
  const children = normalizeContent(props.children ?? element.children);

  return {
    tag: tag as SinwanElement["tag"],
    props,
    children,
  };
}

function resolveShowChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function readReactive(value: unknown): unknown {
  return isSignal(value) || isComputed(value) ? (value as any).value : value;
}

function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}

function isElementLike(value: unknown): value is SinwanElement {
  return value != null && typeof value === "object" && "tag" in value;
}

function getMatchElement(value: unknown): SinwanElement | null {
  if (!isElementLike(value)) {
    return null;
  }
  if (isMatchElement(value)) {
    return value;
  }
  return value.tag === Match ? Match(value.props as any) : null;
}
