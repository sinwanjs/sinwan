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
  Match,
  Portal,
  Switch,
  Visible,
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
  resolveKeyChildren,
  resolveMatchChildren,
  resolveShowChildren,
  resolveSwitchContent,
} from "../component/control-flow.ts";
import {
  ISLAND_TAG,
  ISLAND_ATTR,
  ISLAND_PROPS_ATTR,
  isIslandElement,
  escapeIslandPropsJson,
  type IslandElement,
} from "../component/island.ts";
import { renderToHydratableString as renderHydratableComponent } from "./hydration-markers.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

// Component cache - maps component identity to render function
const componentCache = new WeakMap<SinwanComponent<any>, boolean>();

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
    return escapeHtml(String((node as any)()));
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
async function renderElement(element: SinwanElement): Promise<string> {
  const { tag, props, children } = element;

  if (tag === ISLAND_TAG || isIslandElement(element)) {
    return renderIsland(element as IslandElement);
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
    return renderElement((tag as Function)(props));
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    return renderToString(
      when
        ? resolveShowChildren(element, when)
        : (props.fallback as SinwanNode),
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

  if (isErrorBoundaryElement(element)) {
    try {
      return await renderToString(props.children as SinwanNode);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const fallback = props.fallback;
      const fallbackContent =
        typeof fallback === "function"
          ? (fallback as (error: Error, reset: () => void) => SinwanNode)(
              error,
              () => {},
            )
          : fallback;
      return renderToString(fallbackContent as SinwanNode);
    }
  }

  if (isVirtualElement(element)) {
    return renderVirtualElement(element);
  }

  if (isSuspenseElement(element)) {
    return renderToString((props as any).children as SinwanNode);
  }

  if (isViewTransitionElement(element)) {
    const name = props.name;
    const viewChildren = (props as any).children as SinwanNode;
    if (!name) {
      return renderToString(viewChildren);
    }
    const wrapperTag = (props as any).as ?? "div";
    const wrapperElement: SinwanElement = {
      tag: wrapperTag,
      props: {
        style: { viewTransitionName: name },
        children: viewChildren,
      },
      children: normalizeContent(viewChildren),
    };
    return renderElement(wrapperElement);
  }

  if (isActivityElement(element)) {
    const mode = readReactive(props.mode) ?? "visible";
    const activityChildren = (props as any).children as SinwanNode;
    const tag = (element.props as any).as ?? "div";
    const hidden = mode === "hidden";

    return renderElement({
      tag,
      props: {
        "data-sinwan-activity": hidden ? "hidden" : "visible",
        ...(hidden ? { hidden: true } : {}),
        children: activityChildren,
      },
      children: normalizeContent(activityChildren),
    });
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

  // replace map/Promise.all with for loop to avoid creating an intermediate array (critical for large lists)
  const promises: Promise<string>[] = [];
  for (let i = 0; i < each.length; i++) {
    const index = i;
    promises.push(renderToString(props.children!(each[i], () => index)));
  }
  const rendered = await Promise.all(promises);
  let output = "";
  for (let i = 0; i < rendered.length; i++) {
    output += rendered[i];
  }
  return output;
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

  // replace map/Promise.all with for loop to avoid creating an intermediate array (critical for large lists)
  const promises: Promise<string>[] = [];
  for (let i = 0; i < each.length; i++) {
    const item = each[i];
    promises.push(renderToString(props.children!(() => item, i)));
  }
  const rendered = await Promise.all(promises);
  let output = "";
  for (let i = 0; i < rendered.length; i++) {
    output += rendered[i];
  }
  return output;
}

async function renderVirtualElement(element: SinwanElement): Promise<string> {
  const props = element.props as {
    each?: unknown;
    key?: (item: unknown, index: number) => string | number | symbol;
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
    minRendered?: number;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };

  const items = readReactive(props.each);
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    return props.fallback ? renderToString(props.fallback) : "";
  }

  const itemHeight = props.itemHeight;
  const containerHeight = props.containerHeight;
  const overscan = props.overscan ?? 3;
  const minRendered = props.minRendered ?? 0;

  // Compute initial visible window at scrollTop=0
  let startIndex = 0;
  let endIndex = Math.ceil(containerHeight / itemHeight);
  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(list.length, endIndex + overscan);

  if (minRendered > 0) {
    const visibleCount = endIndex - startIndex;
    if (visibleCount < minRendered) {
      const deficit = minRendered - visibleCount;
      const expandStart = Math.min(startIndex, Math.floor(deficit / 2));
      const expandEnd = Math.min(
        list.length - endIndex,
        Math.ceil(deficit / 2),
      );
      let remaining = deficit - expandStart - expandEnd;
      startIndex -= expandStart;
      endIndex += expandEnd;
      if (remaining > 0) {
        if (endIndex < list.length) {
          endIndex = Math.min(list.length, endIndex + remaining);
        } else if (startIndex > 0) {
          startIndex = Math.max(0, startIndex - remaining);
        }
      }
    }
  }

  const totalHeight = list.length * itemHeight;
  const renderChild = props.children;

  let itemsHtml = "";
  if (typeof renderChild === "function") {
    const promises: Promise<string>[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const index = i;
      const top = i * itemHeight;
      // Wrap each item in a div with absolute positioning at the correct top
      const itemPromise = renderToString(
        renderChild(list[i], () => index),
      ).then(
        (html) =>
          `<div style="position:absolute;top:${top}px;left:0;right:0">${html}</div>`,
      );
      promises.push(itemPromise);
    }
    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      itemsHtml += results[i];
    }
  }

  return `<div style="overflow:auto;height:${containerHeight}px"><div style="position:relative;height:${totalHeight}px">${itemsHtml}</div></div>`;
}

function createDynamicElement(
  element: SinwanElement,
  tag: unknown,
): SinwanElement | null {
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

/**
 * Render an island element: produce a static wrapper with hydration markers
 * inside, plus the embedded props JSON the client needs to hydrate it.
 */
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

function readReactive(value: unknown): unknown {
  if (isSignal(value) || isComputed(value)) {
    return (value as any).value;
  }
  if (typeof value === "function" && (value as any)[STATE_GETTER_MARKER]) {
    return (value as any)();
  }
  return value;
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
