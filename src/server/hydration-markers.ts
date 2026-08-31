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
import { DEFAULT_HYDRATION_ADAPTER as adapter } from "../hydration/markers.ts";
import { isEventProp, toEventName } from "../renderer/events.ts";
import { type TemplateDef } from "../renderer/template-protocol.ts";
import {
  isServerTemplateResult,
  isBindingDescriptor,
} from "../renderer/template.ts";
import { isReactive, resolve } from "../reactivity/index.ts";
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
  resolveMatchChildren,
  resolveShowChildren,
  resolveKeyChildren,
  resolveSwitchContent,
  createDynamicElement,
  normalizeContent,
} from "../component/control-flow.ts";
import { setSSRContext, createSSRContext } from "../event/ssr-context.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

// ─── Hydration context ─────────────────────────────────────

export interface HydrationContext {
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
  options?: {
    identifierPrefix?: string;
    out?: { fetchData?: Record<string, any> };
    baseUrl?: string;
  },
): Promise<string> {
  const ctx = createHydrationContext();
  const mergedProps = props ?? {};

  // Create a temporary instance so lifecycle hooks register silently
  const instance = createComponentInstance(component, mergedProps, null);
  if (options?.identifierPrefix) {
    instance.identifierPrefix = options.identifierPrefix;
  }
  const prev = setCurrentInstance(instance);

  const ssrCtx = createSSRContext();
  if (options?.baseUrl) {
    ssrCtx.baseUrl = options.baseUrl;
  }
  const prevSSR = setSSRContext(ssrCtx);

  try {
    // First pass: render to HTML to trigger fetches from nested sync components
    let result = (await Promise.resolve(
      component(mergedProps) as unknown,
    )) as SinwanNode;

    let html: string;
    if (result && typeof result === "object" && "tag" in result) {
      html = await renderElementH(result, ctx, true /* isComponentRoot */);
    } else {
      html = await renderNodeH(result as SinwanNode, ctx);
    }

    // Wait for any fetches started during rendering, then re-render
    // with data populated so the HTML includes fetched content.
    if (ssrCtx.pendingFetches.size > 0) {
      const pending = Array.from(ssrCtx.pendingFetches);
      ssrCtx.pendingFetches.clear();
      await Promise.all(pending);

      // Re-create context for second pass to avoid stale state
      const ctx2 = createHydrationContext();
      const result2 = (await Promise.resolve(
        component(mergedProps) as unknown,
      )) as SinwanNode;
      if (result2 && typeof result2 === "object" && "tag" in result2) {
        return await renderElementH(result2, ctx2, true);
      }
      return await renderNodeH(result2 as SinwanNode, ctx2);
    }

    return html;
  } finally {
    if (options?.out && ssrCtx.fetchCache.size) {
      options.out.fetchData = Object.fromEntries(ssrCtx.fetchCache);
    }
    setCurrentInstance(prev);
    setSSRContext(prevSSR);
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

  // Create a temporary root instance so useId works correctly even when the
  // rendered tree is a plain function component (not a cc component), and so
  // child components inherit an identifierPrefix.
  const dummy = createComponentInstance(
    (() => null) as unknown as SinwanComponent<any>,
    {},
    null,
  );
  dummy.identifierPrefix = prefix;
  const prev = setCurrentInstance(dummy);
  const prevSSR = setSSRContext(createSSRContext());

  try {
    return await renderNodeH(node, ctx);
  } finally {
    setCurrentInstance(prev);
    setSSRContext(prevSSR);
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
    return `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String(value))}${adapter.emitTextCloseMarker()}`;
  }

  // React-compatible state getters (useState / useReducer)
  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const value = (node as any)();
    if (typeof value === "string" || typeof value === "number") {
      const idx = ctx.textIndex++;
      return `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String(value))}${adapter.emitTextCloseMarker()}`;
    }
    return await renderNodeH(value, ctx);
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

  // Compiler-generated server template result (no DOM available). Serialize
  // the static shell with hydration markers for each dynamic slot, so the
  // client hydration walker can attach to the resulting DOM.
  if (isServerTemplateResult(node)) {
    return renderServerTemplate(node.def, node.dynamics, ctx);
  }

  if (typeof node === "object" && "tag" in node) {
    return renderElementH(node, ctx, false);
  }

  // Binding descriptor (from explicitBindings mode in non-hoisted JSX).
  // Unwrap to the getter function — the function-getter path below handles it.
  if (isBindingDescriptor(node)) {
    return renderNodeH((node as any).getter as SinwanNode, ctx);
  }

  // Plain function getter (0-arity) — resolve and render. Wrap scalar values
  // with function block markers so they are not collapsed into adjacent text
  // nodes and the client can hydrate them as reactive blocks.
  if (typeof node === "function" && (node as any).length === 0) {
    const value = (node as any)();
    if (value == null || typeof value === "boolean") {
      return `${adapter.emitFunctionOpenMarker()}${adapter.emitFunctionCloseMarker()}`;
    }
    if (typeof value === "string" || typeof value === "number") {
      return `${adapter.emitFunctionOpenMarker()}${escapeHtml(String(value))}${adapter.emitFunctionCloseMarker()}`;
    }
    return await renderNodeH(value, ctx);
  }

  return escapeHtml(String(node));
}

/**
 * Serialize a compiler-hoisted template (server-side) into HTML with hydration
 * markers.
 *
 * The compiler emits two kinds of placeholders in `def.html`:
 * - `<!--s:N-->` comment markers for `child` slots (N is the Nth child slot).
 * - ` name=""` empty-attribute placeholders for `attr` and `event` slots.
 *
 * This function resolves each dynamic value and weaves it into the static HTML:
 * - `child` slots: scalar reactive values (signals/computed/getters) are wrapped
 *   in `<!--sinwan-t:N-->…<!--/sinwan-t-->` so the client can bind them.
 *   Non-scalar values (elements, components, arrays) are rendered recursively.
 * - `attr` slots: the ` name=""` placeholder is replaced with the resolved
 *   attribute value.
 * - `event` slots: the ` onEvent=""` placeholder is replaced with
 *   `data-sinwan-ev="event:N"`.
 */
async function renderServerTemplate(
  def: TemplateDef,
  dynamics: unknown[],
  ctx: HydrationContext,
): Promise<string> {
  let html = def.html;

  // Pass 1: resolve attr/event slots by replacing their ` name=""` placeholders.
  // Slots are in render order (matching document order), so replacing the first
  // remaining occurrence of each placeholder sequentially produces the correct
  // association. The compiler emits ` ${name}=""` for each attr/event slot.
  for (let i = 0; i < def.slots.length; i++) {
    const slot = def.slots[i]!;
    if (slot.type === "attr" && slot.name) {
      const value = dynamics[i];
      const resolved = resolveSlotValue(value);
      // renderServerAttribute returns the full ` name="value"` string (or
      // "" for null/false). Replace the ` name=""` placeholder with it.
      const rendered = renderServerAttribute(slot.name, resolved);
      const placeholder = ` ${slot.name}=""`;
      if (rendered) {
        html = html.replace(placeholder, rendered);
      } else {
        html = html.replace(placeholder, "");
      }
    } else if (slot.type === "event" && slot.name) {
      const eventName = slot.name.startsWith("on")
        ? slot.name.slice(2).toLowerCase()
        : slot.name;
      const placeholder = ` ${slot.name}=""`;
      const replacement = ` ${adapter.eventAttr}="${eventName}:${ctx.eventIndex++}"`;
      html = html.replace(placeholder, replacement);
    } else if (slot.type === "ref") {
      // Refs are client-only — no SSR output
      continue;
    }
  }

  // Pass 2: resolve child slots by replacing `<!--s:N-->` markers.
  // The marker number N is the Nth child slot (not the slots-array index),
  // because only child slots call nextSlotId in the compiler.
  let childSlotCount = 0;
  for (let i = 0; i < def.slots.length; i++) {
    const slot = def.slots[i]!;
    if (slot.type !== "child") continue;
    const marker = `<!--s:${childSlotCount}-->`;
    const value = dynamics[i];
    const rendered = await renderServerTemplateChild(value, ctx);
    html = html.replace(marker, rendered);
    childSlotCount++;
  }

  return html;
}

/**
 * Resolve a slot value to a concrete value for attribute rendering.
 * Binding descriptors and reactive wrappers are unwrapped.
 */
function resolveSlotValue(value: unknown): unknown {
  if (isBindingDescriptor(value)) {
    return (value as any).getter();
  }
  if (isReactive(value)) {
    return resolve(value);
  }
  if (typeof value === "function" && (value as any).length === 0) {
    return (value as any)();
  }
  return value;
}

async function renderServerTemplateChild(
  value: unknown,
  ctx: HydrationContext,
): Promise<string> {
  // Binding descriptor (explicit bindings mode): unwrap the getter, then
  // treat the resolved value as a reactive text slot.
  if (isBindingDescriptor(value)) {
    const getter = (value as any).getter as () => unknown;
    return renderServerTemplateChild(getter, ctx);
  }

  // Signal / Computed → wrap scalar value in sinwan-t text markers.
  if (isSignal(value) || isComputed(value)) {
    const v = (value as any).value;
    const idx = ctx.textIndex++;
    return `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String(v))}${adapter.emitTextCloseMarker()}`;
  }

  // Zero-arity getter (reactive-wrap mode): resolve and wrap scalars.
  if (typeof value === "function" && (value as any).length === 0) {
    const v = (value as any)();
    if (v == null || typeof v === "boolean") return "";
    if (typeof v === "string" || typeof v === "number") {
      const idx = ctx.textIndex++;
      return `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String(v))}${adapter.emitTextCloseMarker()}`;
    }
    return await renderNodeH(v as SinwanNode, ctx);
  }

  // Elements, components, arrays, strings, numbers → recursive render.
  return await renderNodeH(value as SinwanNode, ctx);
}

/**
 * Render an element with hydration markers.
 */
export async function renderElementH(
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
    let rootMarked = false;
    let output = "";
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const isRoot =
        isComponentRoot &&
        !rootMarked &&
        child != null &&
        typeof child === "object" &&
        "tag" in child &&
        typeof (child as SinwanElement).tag === "string";
      if (isRoot) rootMarked = true;
      if (child != null && typeof child === "object" && "tag" in child) {
        output += await renderElementH(child as SinwanElement, ctx, isRoot);
      } else {
        output += await renderNodeH(child, ctx);
      }
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
    const when = resolve(props.when);
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
    const when = resolve(props.when);
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
    const key = resolve(props.when);
    return await renderNodeMaybeRoot(
      resolveKeyChildren(element, key),
      ctx,
      isComponentRoot,
    );
  }

  if (isDynamicElement(element)) {
    const dynamicTag = resolve(props.component);
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
    const mode = resolve(props.mode) ?? "visible";
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

  const results: any[] = new Array(children.length);
  for (let i = 0; i < children.length; i++) {
    results[i] = renderNodeH(children[i], ctx);
  }
  await Promise.all(results);

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
    attrs += ` ${adapter.emitComponentMarker(ctx.componentIndex++)}`;
  }

  // Event markers + regular attributes
  const eventBindings: [event: string, index: number][] = [];

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
      eventBindings.push([eventName, ctx.eventIndex++]);
      continue;
    }

    if (value == null || value === false) continue;

    // Resolve signal/computed values, state getters, and plain 0-arity
    // function getters to current values for SSR.
    let resolvedValue = value;
    if (isSignal(value) || isComputed(value)) {
      resolvedValue = (value as any).value;
    } else if (
      typeof value === "function" &&
      (value as any)[STATE_GETTER_MARKER]
    ) {
      resolvedValue = (value as any)();
    } else if (typeof value === "function" && (value as any).length === 0) {
      resolvedValue = (value as any)();
    }

    attrs += renderServerAttribute(key, resolvedValue);
  }

  // Add event attribute
  if (eventBindings.length > 0) {
    attrs += ` ${adapter.emitEventMarker(eventBindings)}`;
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

async function renderForElementH(
  element: SinwanElement,
  ctx: HydrationContext,
): Promise<string> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = resolve(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  // sequential render to avoid race condition on mutable context indices (textIndex, eventIndex, componentIndex)
  let output = "";
  for (let i = 0; i < each.length; i++) {
    const index = i;
    output += await renderNodeH(
      props.children!(each[i], () => index),
      ctx,
    );
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
  const each = resolve(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? await renderNodeH(props.fallback, ctx) : "";
  }

  // sequential render to avoid race condition on mutable context indices (textIndex, eventIndex, componentIndex)
  let output = "";
  for (let i = 0; i < each.length; i++) {
    const item = each[i];
    output += await renderNodeH(
      props.children!(() => item, i),
      ctx,
    );
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

  const items = resolve(props.each);
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
    // sequential render to avoid race condition on mutable context indices (textIndex, eventIndex, componentIndex)
    for (let i = startIndex; i < endIndex; i++) {
      const index = i;
      const top = i * itemHeight;
      const html = await renderNodeH(
        renderChild(list[i], () => index),
        ctx,
      );
      itemsHtml += `<div style="position:absolute;top:${top}px;left:0;right:0">${html}</div>`;
    }
  }

  return `<div style="overflow:auto;height:${containerHeight}px"><div style="position:relative;height:${totalHeight}px">${itemsHtml}</div></div>`;
}
