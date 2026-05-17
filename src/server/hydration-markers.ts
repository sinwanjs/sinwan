/**
 * SinwanJS Server — Hydration-Aware SSR Renderer
 *
 * Enhanced `renderToString` that injects hydration markers:
 *
 *   data-sinwan-id="c0"             — component boundary
 *   <!--sinwan-t:0-->val<!--/sinwan-t-->  — reactive text boundary
 *   data-sinwan-ev="click:0"        — event binding reference
 *
 * Usage:
 *   const html = await renderToHydratableString(App, { name: "World" });
 *   // → '<div data-sinwan-id="c0"><p>Count: <!--sinwan-t:0-->5<!--/sinwan-t--></p>...</div>'
 */

import type { SinwanElement, SinwanNode, SinwanComponent } from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../common/escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import {
  compId,
  textMarkerOpen,
  textMarkerCloseStr,
  COMP_ID_ATTR,
  EVENT_ATTR,
} from "../hydration/markers.ts";
import { isEventProp, toEventName } from "../renderer/events.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import {
  ISLAND_TAG,
  ISLAND_ATTR,
  ISLAND_PROPS_ATTR,
  isIslandElement,
  escapeIslandPropsJson,
  type IslandElement,
} from "../component/island.ts";
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
} from "../component/control-flow.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

// ─── Hydration context ─────────────────────────────────────

interface HydrationContext {
  componentIndex: number;
  textIndex: number;
  eventIndex: number;
}

function createHydrationContext(): HydrationContext {
  return { componentIndex: 0, textIndex: 0, eventIndex: 0 };
}

// ─── Public API ────────────────────────────────────────────

/**
 * Render a component to an HTML string with hydration markers.
 */
export async function renderToHydratableString(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
  options?: { identifierPrefix?: string },
): Promise<string> {
  const ctx = createHydrationContext();
  const mergedProps = props ?? {};

  // Create a temporary instance so lifecycle hooks register silently
  const instance = createComponentInstance(component, mergedProps, null);
  if (options?.identifierPrefix) {
    instance.identifierPrefix = options.identifierPrefix;
  }
  const prev = setCurrentInstance(instance);

  try {
    // Call the component to get the element tree
    const result = (await Promise.resolve(
      component(mergedProps) as unknown,
    )) as SinwanNode;
    if (result && typeof result === "object" && "tag" in result) {
      return await renderElementH(result, ctx, true /* isComponentRoot */);
    }

    return await renderNodeH(result as SinwanNode, ctx);
  } finally {
    setCurrentInstance(prev);
  }
}

/**
 * Render a raw SinwanNode tree with hydration markers.
 */
export async function renderNodeToHydratableString(
  node: SinwanNode,
  options?: { identifierPrefix?: string },
): Promise<string> {
  const ctx = createHydrationContext();
  const prefix = options?.identifierPrefix ?? "";

  if (!prefix) {
    return await renderNodeH(node, ctx);
  }

  // Create a temporary root instance so child components inherit the prefix
  const dummy = createComponentInstance(
    (() => null) as unknown as SinwanComponent<any>,
    {},
    null,
  );
  dummy.identifierPrefix = prefix;
  const prev = setCurrentInstance(dummy);
  try {
    return await renderNodeH(node, ctx);
  } finally {
    setCurrentInstance(prev);
  }
}

// ─── Internal rendering ────────────────────────────────────

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
 * Render a node with hydration markers.
 */
async function renderNodeH(
  node: SinwanNode,
  ctx: HydrationContext,
): Promise<string> {
  if (node == null || typeof node === "boolean") return "";

  if (typeof node === "string") return escapeHtml(node);
  if (typeof node === "number") return String(node);

  if (node instanceof HtmlEscapedString) return node.value;

  // Signal or Computed → wrap with text markers
  if (isSignal(node) || isComputed(node)) {
    const value = (node as any).value;
    const idx = ctx.textIndex++;
    return `${textMarkerOpen(idx)}${escapeHtml(String(value))}${textMarkerCloseStr()}`;
  }

  // React-compatible state getters (useState / useReducer)
  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const value = (node as any)();
    const idx = ctx.textIndex++;
    return `${textMarkerOpen(idx)}${escapeHtml(String(value))}${textMarkerCloseStr()}`;
  }

  if (Array.isArray(node)) {
    // replace map/Promise.all with for loop to avoid creating an intermediate array
    const promises: Promise<string>[] = [];
    for (let i = 0; i < node.length; i++) {
      promises.push(renderNodeH(node[i], ctx));
    }
    const results = await Promise.all(promises);
    let output = "";
    for (let i = 0; i < results.length; i++) {
      output += results[i];
    }
    return output;
  }

  if (node instanceof Promise) {
    return renderNodeH(await node, ctx);
  }

  if (typeof node === "object" && "tag" in node) {
    return renderElementH(node, ctx, false);
  }

  return escapeHtml(String(node));
}

/**
 * Render an element with hydration markers.
 */
async function renderElementH(
  element: SinwanElement,
  ctx: HydrationContext,
  isComponentRoot: boolean,
): Promise<string> {
  const { tag, props, children } = element;

  if (tag === ISLAND_TAG || isIslandElement(element)) {
    return await renderIslandH(element as IslandElement);
  }

  // Fragment
  if (tag === "") {
    // replace map/Promise.all with for loop to avoid creating an intermediate array
    const promises: Promise<string>[] = [];
    for (let i = 0; i < children.length; i++) {
      promises.push(renderNodeH(children[i], ctx));
    }
    const results = await Promise.all(promises);
    let output = "";
    for (let i = 0; i < results.length; i++) {
      output += results[i];
    }
    return output;
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
    return await renderElementH((tag as Function)(props), ctx, isComponentRoot);
  }

  if (tag === Visible) {
    return await renderElementH((tag as Function)(props), ctx, isComponentRoot);
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    const content = when
      ? resolveShowChildren(element, when)
      : (props.fallback as SinwanNode);
    return await renderNodeMaybeRoot(content, ctx, isComponentRoot);
  }

  if (isForElement(element)) {
    return await renderForElementH(element, ctx);
  }

  if (isSwitchElement(element)) {
    return await renderNodeMaybeRoot(
      resolveSwitchContent(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isMatchElement(element)) {
    const when = readReactive(props.when);
    return await renderNodeMaybeRoot(
      when ? resolveMatchChildren(element, when) : null,
      ctx,
      isComponentRoot,
    );
  }

  if (isIndexElement(element)) {
    return await renderIndexElementH(element, ctx);
  }

  if (isKeyElement(element)) {
    const key = readReactive(props.when);
    return await renderNodeMaybeRoot(
      resolveKeyChildren(element, key),
      ctx,
      isComponentRoot,
    );
  }

  if (isDynamicElement(element)) {
    const dynamicTag = readReactive(props.component);
    const dynamic = createDynamicElement(element, dynamicTag);
    return dynamic ? await renderElementH(dynamic, ctx, isComponentRoot) : "";
  }

  if (isPortalElement(element)) {
    return "";
  }

  if (isErrorBoundaryElement(element)) {
    try {
      return await renderNodeH(props.children as SinwanNode, ctx);
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
      return await renderNodeH(fallbackContent as SinwanNode, ctx);
    }
  }

  if (isVirtualElement(element)) {
    return await renderVirtualElementH(element, ctx);
  }

  if (isSuspenseElement(element)) {
    return await renderNodeH(props.children as SinwanNode, ctx);
  }

  if (isViewTransitionElement(element)) {
    const name = props.name;
    const viewChildren = (props as any).children as SinwanNode;
    if (!name) {
      return await renderNodeMaybeRoot(viewChildren, ctx, isComponentRoot);
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
    return await renderElementH(wrapperElement, ctx, isComponentRoot);
  }

  if (isActivityElement(element)) {
    const mode = readReactive(props.mode) ?? "visible";
    const activityChildren = (props as any).children as SinwanNode;
    const tag = (element.props as any).as ?? "div";
    const hidden = mode === "hidden";
    
    return await renderElementH(
      {
        tag,
        props: {
          "data-sinwan-activity": hidden ? "hidden" : "visible",
          ...(hidden ? { hidden: true } : {}),
          children: activityChildren,
        },
        children: normalizeContent(activityChildren),
      },
      ctx,
      isComponentRoot,
    );
  }

  // Functional component
  if (typeof tag === "function") {
    return await renderComponentH(tag, props, ctx);
  }

  // Intrinsic HTML element
  if (typeof tag === "string") {
    return await renderIntrinsicH(tag, props, children, ctx, isComponentRoot);
  }

  const results = await Promise.all(
    children.map((child) => renderNodeH(child, ctx)),
  );
  return results.join("");
}

/**
 * Render a functional component — calls it and marks the root element.
 */
async function renderComponentH(
  component: Function,
  props: Record<string, unknown>,
  ctx: HydrationContext,
): Promise<string> {
  // Set a temporary instance for lifecycle hooks
  const parentInstance = getCurrentInstance();
  const instance = createComponentInstance(
    component as any,
    props,
    parentInstance,
  );
  if (parentInstance) {
    parentInstance.children.push(instance);
  }
  const prev = setCurrentInstance(instance);

  try {
    const result = component(props);

    if (result instanceof Promise) {
      const awaited = await result;
      if (awaited && typeof awaited === "object" && "tag" in awaited) {
        return await renderElementH(
          awaited as SinwanElement,
          ctx,
          true /* mark as component root */,
        );
      }
      return await renderNodeH(awaited as SinwanNode, ctx);
    }

    if (result && typeof result === "object" && "tag" in result) {
      return await renderElementH(
        result as SinwanElement,
        ctx,
        true /* mark as component root */,
      );
    }

    return await renderNodeH(result as SinwanNode, ctx);
  } finally {
    setCurrentInstance(prev);
  }
}

/**
 * Render an intrinsic element with hydration markers.
 */
async function renderIntrinsicH(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  ctx: HydrationContext,
  isComponentRoot: boolean,
): Promise<string> {
  let attrs = "";

  // Component boundary marker
  if (isComponentRoot) {
    attrs += ` ${COMP_ID_ATTR}="${compId(ctx.componentIndex++)}"`;
  }

  // Event markers + regular attributes
  const eventParts: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML"
    ) {
      continue;
    }

    if (isEventProp(key)) {
      // Collect event markers
      const eventName = toEventName(key);
      eventParts.push(`${eventName}:${ctx.eventIndex++}`);
      continue;
    }

    if (value == null || value === false) continue;

    // Resolve signal/computed values and state getters to current values for SSR
    let resolvedValue = value;
    if (isSignal(value) || isComputed(value)) {
      resolvedValue = (value as any).value;
    } else if (
      typeof value === "function" &&
      (value as any)[STATE_GETTER_MARKER]
    ) {
      resolvedValue = (value as any)();
    }

    attrs += renderServerAttribute(key, resolvedValue);
  }

  // Add event attribute
  if (eventParts.length > 0) {
    attrs += ` ${EVENT_ATTR}="${eventParts.join(",")}"`;
  }

  // Void elements
  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`;
  }

  // Dangerous inner HTML
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;
  if (dangerous && typeof dangerous.__html === "string") {
    return `<${tag}${attrs}>${dangerous.__html}</${tag}>`;
  }

  // Render children with markers
  // replace map/Promise.all with for loop to avoid creating an intermediate array
  const promises: Promise<string>[] = [];
  for (let i = 0; i < children.length; i++) {
    promises.push(renderNodeH(children[i], ctx));
  }
  const childResults = await Promise.all(promises);
  let childrenHtml = "";
  for (let i = 0; i < childResults.length; i++) {
    childrenHtml += childResults[i];
  }

  return `<${tag}${attrs}>${childrenHtml}</${tag}>`;
}

/**
 * Render an island within an already-hydratable document. The island's own
 * subtree gets a fresh hydration context (component / text / event indices
 * restart at 0) so the client can hydrate it independently — the surrounding
 * hydration walk skips over the wrapper element's data attributes.
 */
async function renderIslandH(element: IslandElement): Promise<string> {
  const { __island, __props } = element.props;
  const innerCtx = createHydrationContext();
  const inner = await renderComponentH(
    __island.component as Function,
    __props,
    innerCtx,
  );

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

async function renderNodeMaybeRoot(
  node: SinwanNode,
  ctx: HydrationContext,
  isComponentRoot: boolean,
): Promise<string> {
  if (
    isComponentRoot &&
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    "tag" in node
  ) {
    return await renderElementH(node as SinwanElement, ctx, true);
  }
  return await renderNodeH(node, ctx);
}

async function renderForElementH(
  element: SinwanElement,
  ctx: HydrationContext,
): Promise<string> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  // replace map/Promise.all with for loop to avoid creating an intermediate array (critical for large lists)
  const promises: Promise<string>[] = [];
  for (let i = 0; i < each.length; i++) {
    promises.push(
      renderNodeH(
        props.children!(each[i], () => i),
        ctx,
      ),
    );
  }
  const results = await Promise.all(promises);
  let output = "";
  for (let i = 0; i < results.length; i++) {
    output += results[i];
  }
  return output;
}

async function renderIndexElementH(
  element: SinwanElement,
  ctx: HydrationContext,
): Promise<string> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: () => unknown, index: number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  // replace map/Promise.all with for loop to avoid creating an intermediate array (critical for large lists)
  const promises: Promise<string>[] = [];
  for (let i = 0; i < each.length; i++) {
    promises.push(
      renderNodeH(
        props.children!(() => each[i], i),
        ctx,
      ),
    );
  }
  const results = await Promise.all(promises);
  let output = "";
  for (let i = 0; i < results.length; i++) {
    output += results[i];
  }
  return output;
}

async function renderVirtualElementH(
  element: SinwanElement,
  ctx: HydrationContext,
): Promise<string> {
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
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  const itemHeight = props.itemHeight;
  const containerHeight = props.containerHeight;
  const overscan = props.overscan ?? 3;
  const minRendered = props.minRendered ?? 0;

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
      promises.push(
        renderNodeH(
          renderChild(list[i], () => i),
          ctx,
        ),
      );
    }
    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      itemsHtml += results[i];
    }
  }

  return `<div style="overflow:auto;height:${containerHeight}px"><div style="position:relative;height:${totalHeight}px">${itemsHtml}</div></div>`;
}

function resolveShowChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as {
    fallback?: SinwanNode;
    children?: SinwanNode;
  };
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

function resolveMatchChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function resolveKeyChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
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
