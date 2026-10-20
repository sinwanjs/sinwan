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
  SinwanSlots,
} from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../common/escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import { isEventProp } from "../renderer/events.ts";
import {
  Dynamic,
  ErrorBoundary,
  For,
  Index,
  Key,
  Portal,
  Switch,
  Show,
  Virtual,
  isDynamicElement,
  isErrorBoundaryElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
  isVirtualElement,
  isActivityElement,
  isSuspenseElement,
  isViewTransitionElement,
} from "../control-flow/identity.ts";
import { Visible } from "../control-flow/components/visible/factory.ts";
import { renderActivityElement } from "../control-flow/components/activity/ssr.ts";
import { renderDynamicElement } from "../control-flow/components/dynamic/ssr.ts";
import { renderErrorBoundaryNode } from "../control-flow/components/error-boundary/ssr.ts";
import { resolveForRenderNodes } from "../control-flow/components/for/ssr.ts";
import { resolveIndexRenderNodes } from "../control-flow/components/index/ssr.ts";
import { resolveKeyRenderNode } from "../control-flow/components/key/ssr.ts";
import { resolveMatchRenderNode } from "../control-flow/components/match/ssr.ts";
import { renderPortalElement } from "../control-flow/components/portal/ssr.ts";
import { resolveShowRenderNode } from "../control-flow/components/show/ssr.ts";
import { resolveSuspenseRenderNode } from "../control-flow/components/suspense/ssr.ts";
import { resolveSwitchRenderNode } from "../control-flow/components/switch/ssr.ts";
import { resolveViewTransitionRenderNode } from "../control-flow/components/view-transition/ssr.ts";
import { renderVirtualHtml } from "../control-flow/components/virtual/ssr.ts";
import { resolveVisibleRenderNode } from "../control-flow/components/visible/ssr.ts";
import {
  ISLAND_TAG,
  ISLAND_ATTR,
  ISLAND_PROPS_ATTR,
  isIslandElement,
  escapeIslandPropsJson,
  type IslandElement,
} from "../component/island.ts";
import { renderToHydratableString as renderHydratableComponent } from "./hydration-markers.ts";
import { resolve } from "../reactivity/index.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

function ssrReset(): void {
  void 0;
}

// Page registry
const pageRegistry = new Map<string, SinwanComponent<any>>();

/**
 * Register a page renderer by name.
 */
export function registerPage<D extends object = {}>(
  name: string,
  page: SinwanComponent<D>,
): void {
  pageRegistry.set(name, page);
}

/**
 * Get a page renderer by name.
 */
export function getPage<D extends object = {}>(
  name: string,
): SinwanComponent<D> | undefined {
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
 * Render a registered page to an HTML string with hydration markers.
 */
export async function renderToHydratablePage<D extends object = {}>(
  name: string,
  data: D,
  options?: { identifierPrefix?: string },
): Promise<string> {
  const page = getPage<D>(name);
  if (!page) {
    throw new Error(`Page "${name}" not found in registry`);
  }

  return renderHydratableComponent(
    page,
    data as Record<string, unknown>,
    options,
  );
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

  // Handle React-compatible state getters (useState / useReducer)
  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const value = (node as any)();
    if (value == null || typeof value === "boolean") return "";
    if (typeof value === "string" || typeof value === "number") {
      return escapeHtml(String(value));
    }
    return await renderToString(value);
  }

  // Plain function getter (0-arity) — resolve and render
  if (typeof node === "function" && (node as any).length === 0) {
    const value = (node as any)();
    if (value == null || typeof value === "boolean") return "";
    if (typeof value === "string" || typeof value === "number") {
      return escapeHtml(String(value));
    }
    return await renderToString(value);
  }

  // Handle arrays - render each child and concatenate
  if (Array.isArray(node)) {
    // replace map/Promise.all with for loop to avoid creating an intermediate array
    const promises: Promise<string>[] = [];
    for (let i = 0; i < node.length; i++) {
      promises.push(renderToString(node[i]));
    }
    const results = await Promise.all(promises);
    let output = "";
    for (let i = 0; i < results.length; i++) {
      output += results[i];
    }
    return output;
  }

  // Handle promises (async components)
  if (node instanceof Promise) {
    return renderToString(await node);
  }

  // Handle elements
  return renderElement(node as SinwanElement);
}

/**
 * Render an element to HTML string.
 */
export async function renderElement(element: SinwanElement): Promise<string> {
  const { tag, props, children } = element;

  if (tag === ISLAND_TAG || isIslandElement(element)) {
    return renderIsland(element as IslandElement);
  }

  // Fragments — render children without wrapper
  if (tag === "") {
    return renderToString(children);
  }

  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal ||
    tag === ErrorBoundary ||
    tag === Virtual
  ) {
    return renderElement((tag as Function)(props));
  }

  if (tag === Visible) {
    return renderElement(resolveVisibleRenderNode(element));
  }

  if (isShowElement(element)) {
    return renderToString(resolveShowRenderNode(element));
  }

  if (isForElement(element)) {
    const nodes = resolveForRenderNodes(element);
    if (nodes.length === 0) return "";
    const rendered = await Promise.all(nodes.map((node) => renderToString(node)));
    let output = "";
    for (let i = 0; i < rendered.length; i++) {
      output += rendered[i];
    }
    return output;
  }

  if (isSwitchElement(element)) {
    return renderToString(resolveSwitchRenderNode(element));
  }

  if (isMatchElement(element)) {
    return renderToString(resolveMatchRenderNode(element));
  }

  if (isIndexElement(element)) {
    const nodes = resolveIndexRenderNodes(element);
    if (nodes.length === 0) return "";
    const rendered = await Promise.all(nodes.map((node) => renderToString(node)));
    let output = "";
    for (let i = 0; i < rendered.length; i++) {
      output += rendered[i];
    }
    return output;
  }

  if (isKeyElement(element)) {
    return renderToString(resolveKeyRenderNode(element));
  }

  if (isDynamicElement(element)) {
    const dynamic = renderDynamicElement(element);
    return dynamic ? renderElement(dynamic) : "";
  }

  if (isPortalElement(element)) {
    return renderPortalElement(element);
  }

  if (isErrorBoundaryElement(element)) {
    return await renderErrorBoundaryNode(element, ssrReset, renderToString);
  }

  if (isVirtualElement(element)) {
    return renderVirtualHtml(element, renderToString);
  }

  if (isSuspenseElement(element)) {
    return renderToString(resolveSuspenseRenderNode(element));
  }

  if (isViewTransitionElement(element)) {
    return renderToString(resolveViewTransitionRenderNode(element));
  }

  if (isActivityElement(element)) {
    return renderElement(renderActivityElement(element));
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

    const resolvedValue = resolve(value);

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


async function renderIsland(element: IslandElement): Promise<string> {
  const { __island, __props } = element.props;
  const inner = await renderHydratableComponent(__island.component, __props);

  let json: string;
  try {
    json = __island.serializeProps(__props);
  } catch (err) {
    throw new Error(
      `island(${__island.name}): failed to serialise props — ${(err as Error).message}`,
    );
  }

  const safeName = escapeHtml(__island.name);
  const safeProps = escapeIslandPropsJson(json);
  return `<${__island.tag} ${ISLAND_ATTR}="${safeName}" ${ISLAND_PROPS_ATTR}="${safeProps}">${inner}</${__island.tag}>`;
}
