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

function ssrReset(): void {
  void 0;
}

function hydrationHostComponent(): null {
  return null;
}

function createDummyHydrationInstance(prefix: string) {
  hydrationHostComponent();
  const dummy = createComponentInstance(
    hydrationHostComponent as unknown as SinwanComponent<any>,
    {},
    null,
  );
  dummy.identifierPrefix = prefix;
  return dummy;
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
  const dummy = createDummyHydrationInstance(prefix);
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
      if (html.includes(placeholder)) {
        html = rendered
          ? html.replace(placeholder, rendered)
          : html.replace(placeholder, "");
      } else if (rendered) {
        html = insertAttributeAtPath(html, slot.path ?? [], rendered);
      }
    } else if (slot.type === "event" && slot.name) {
      const eventName = slot.name.startsWith("on")
        ? slot.name.slice(2).toLowerCase()
        : slot.name;
      const placeholder = ` ${slot.name}=""`;
      const replacement = ` ${adapter.eventAttr}="${eventName}:${ctx.eventIndex++}"`;
      html = html.includes(placeholder)
        ? html.replace(placeholder, replacement)
        : insertAttributeAtPath(html, slot.path ?? [], replacement);
    } else if (slot.type === "ref") {
      // Refs are client-only — no SSR output
      continue;
    }
  }

  // Pass 2: resolve child slots. Marker-based slots replace `<!--s:N-->`.
  // Sole-dynamic parent-fill slots have no marker — inject at `slot.path`.
  let childSlotCount = 0;
  for (let i = 0; i < def.slots.length; i++) {
    const slot = def.slots[i]!;
    if (slot.type !== "child") continue;
    const marker = `<!--s:${childSlotCount}-->`;
    const value = dynamics[i];
    const rendered = await renderServerTemplateChild(value, ctx);
    if (html.includes(marker)) {
      html = html.replace(marker, rendered);
    } else {
      html = injectHtmlAtPath(html, slot.path, rendered);
    }
    childSlotCount++;
  }

  return html;
}

/**
 * Insert an attribute into the opening tag at `path` when the compiler omitted
 * the ` name=""` placeholder (`class` and `on*` slots).
 */
function insertAttributeAtPath(
  html: string,
  path: number[],
  attr: string,
): string {
  const root = findRootElementRange(html);
  if (!root) return html;
  let range: SsrElemRange = root;
  for (let d = 0; d < path.length; d++) {
    const kids = listSsrChildNodes(html, range.openEnd, range.closeStart);
    const child = kids[path[d]!];
    if (!child || child.kind !== "element") return html;
    range = child;
  }
  let insertAt = range.openEnd;
  if (html[insertAt - 1] === ">") {
    insertAt -= html[insertAt - 2] === "/" ? 2 : 1;
  }
  return html.slice(0, insertAt) + attr + html.slice(insertAt);
}

/** Void elements that never carry child content (compiler HTML only). */
const SSR_VOID_ELEMENTS = new Set([
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

interface SsrElemRange {
  kind: "element";
  openEnd: number;
  closeStart: number;
  closeEnd: number;
}

interface SsrLeafRange {
  kind: "text" | "comment";
  start: number;
  end: number;
}

type SsrChildRange = SsrElemRange | SsrLeafRange;

/**
 * Inject `content` as the inner HTML of the element at `path`, using the same
 * path semantics as client `walkToSlot` (root = first element in the fragment).
 */
function injectHtmlAtPath(
  html: string,
  path: number[],
  content: string,
): string {
  const root = findRootElementRange(html);
  if (!root) return html;
  let range: SsrElemRange = root;
  for (let d = 0; d < path.length; d++) {
    const kids = listSsrChildNodes(html, range.openEnd, range.closeStart);
    const child = kids[path[d]!];
    if (!child || child.kind !== "element") return html;
    range = child;
  }
  return html.slice(0, range.openEnd) + content + html.slice(range.closeStart);
}

function findRootElementRange(html: string): SsrElemRange | null {
  let i = 0;
  while (i < html.length && (html[i] === " " || html[i] === "\n" || html[i] === "\t" || html[i] === "\r")) {
    i++;
  }
  if (html[i] !== "<" || html[i + 1] === "!" || html[i + 1] === "/") return null;
  const open = parseSsrOpenTag(html, i);
  if (!open) return null;
  if (open.selfClosing || SSR_VOID_ELEMENTS.has(open.tag)) {
    return {
      kind: "element",
      openEnd: open.end,
      closeStart: open.end,
      closeEnd: open.end,
    };
  }
  const closeStart = findSsrMatchingClose(html, open.end, open.tag);
  if (closeStart < 0) return null;
  return {
    kind: "element",
    openEnd: open.end,
    closeStart,
    closeEnd: closeStart + open.tag.length + 3,
  };
}

function listSsrChildNodes(
  html: string,
  from: number,
  to: number,
): SsrChildRange[] {
  const kids: SsrChildRange[] = [];
  let i = from;
  while (i < to) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      const endPos = end < 0 ? to : Math.min(end + 3, to);
      kids.push({ kind: "comment", start: i, end: endPos });
      i = endPos;
      continue;
    }
    if (html[i] === "<") {
      if (html[i + 1] === "/") break;
      const open = parseSsrOpenTag(html, i);
      if (!open) {
        i++;
        continue;
      }
      if (open.selfClosing || SSR_VOID_ELEMENTS.has(open.tag)) {
        kids.push({
          kind: "element",
          openEnd: open.end,
          closeStart: open.end,
          closeEnd: open.end,
        });
        i = open.end;
        continue;
      }
      const closeStart = findSsrMatchingClose(html, open.end, open.tag);
      if (closeStart < 0 || closeStart > to) break;
      const closeEnd = closeStart + open.tag.length + 3;
      kids.push({
        kind: "element",
        openEnd: open.end,
        closeStart,
        closeEnd,
      });
      i = closeEnd;
      continue;
    }
    let j = i + 1;
    while (j < to && html[j] !== "<") j++;
    kids.push({ kind: "text", start: i, end: j });
    i = j;
  }
  return kids;
}

function parseSsrOpenTag(
  html: string,
  start: number,
): { tag: string; end: number; selfClosing: boolean } | null {
  if (html[start] !== "<") return null;
  let i = start + 1;
  if (i >= html.length || html[i] === "/" || html[i] === "!") return null;
  const tagStart = i;
  while (i < html.length && /[A-Za-z0-9:-]/.test(html[i]!)) i++;
  if (i === tagStart) return null;
  const tag = html.slice(tagStart, i).toLowerCase();
  let selfClosing = false;
  while (i < html.length) {
    if (html[i] === ">") {
      i++;
      break;
    }
    if (html[i] === "/" && html[i + 1] === ">") {
      selfClosing = true;
      i += 2;
      break;
    }
    if (html[i] === '"' || html[i] === "'") {
      const q = html[i]!;
      i++;
      while (i < html.length && html[i] !== q) i++;
      i++;
      continue;
    }
    i++;
  }
  return { tag, end: i, selfClosing };
}

function findSsrMatchingClose(html: string, from: number, tag: string): number {
  const openRe = new RegExp(`<${tag}\\b`, "gi");
  const closeStr = `</${tag}>`;
  let depth = 1;
  let i = from;
  while (i < html.length) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    openRe.lastIndex = i;
    const openMatch = openRe.exec(html);
    const closeIdx = html.toLowerCase().indexOf(closeStr, i);
    if (closeIdx < 0) return -1;
    if (openMatch && openMatch.index < closeIdx) {
      // Nested same-tag open — advance past this open tag.
      // openRe already matched `<tag\b`, so parseSsrOpenTag cannot fail here.
      const open = parseSsrOpenTag(html, openMatch.index)!;
      if (!(open.selfClosing || SSR_VOID_ELEMENTS.has(open.tag))) depth++;
      i = open.end;
      continue;
    }
    depth--;
    if (depth === 0) return closeIdx;
    i = closeIdx + closeStr.length;
  }
  return -1;
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
    return await renderElementH(
      resolveVisibleRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isShowElement(element)) {
    return await renderNodeMaybeRoot(
      resolveShowRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isForElement(element)) {
    // sequential render to avoid race on mutable context indices
    let output = "";
    for (const node of resolveForRenderNodes(element)) {
      output += await renderNodeH(node, ctx);
    }
    return output;
  }

  if (isSwitchElement(element)) {
    return await renderNodeMaybeRoot(
      resolveSwitchRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isMatchElement(element)) {
    return await renderNodeMaybeRoot(
      resolveMatchRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isIndexElement(element)) {
    // sequential render to avoid race on mutable context indices
    let output = "";
    for (const node of resolveIndexRenderNodes(element)) {
      output += await renderNodeH(node, ctx);
    }
    return output;
  }

  if (isKeyElement(element)) {
    return await renderNodeMaybeRoot(
      resolveKeyRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isDynamicElement(element)) {
    const dynamic = renderDynamicElement(element);
    return dynamic ? await renderElementH(dynamic, ctx, isComponentRoot) : "";
  }

  if (isPortalElement(element)) {
    return renderPortalElement(element);
  }

  if (isErrorBoundaryElement(element)) {
    return await renderErrorBoundaryNode(element, ssrReset, (node) =>
      renderNodeH(node, ctx),
    );
  }

  if (isVirtualElement(element)) {
    return await renderVirtualHtml(
      element,
      (node) => renderNodeH(node, ctx),
      { sequential: true },
    );
  }

  if (isSuspenseElement(element)) {
    return await renderNodeH(resolveSuspenseRenderNode(element), ctx);
  }

  if (isViewTransitionElement(element)) {
    return await renderNodeMaybeRoot(
      resolveViewTransitionRenderNode(element),
      ctx,
      isComponentRoot,
    );
  }

  if (isActivityElement(element)) {
    return await renderElementH(
      renderActivityElement(element),
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

