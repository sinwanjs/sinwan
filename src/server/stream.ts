/**
 * SinwanJS View Module — Streaming SSR
 *
 * Progressive HTML streaming using Bun's native ReadableStream.
 * Streams chunks as they resolve without waiting for full tree.
 */

import type { SinwanNode, SinwanElement, SinwanComponent } from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../common/escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import { isEventProp, toEventName } from "../renderer/events.ts";
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
  isSuspenseElement,
  isActivityElement,
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
import { streamVirtualHtml } from "../control-flow/components/virtual/ssr.ts";
import { resolveVisibleRenderNode } from "../control-flow/components/visible/ssr.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import { DEFAULT_HYDRATION_ADAPTER as adapter } from "../hydration/markers.ts";
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

export interface HydratableStreamContext {
  componentIndex: number;
  textIndex: number;
  eventIndex: number;
}

function createHydratableStreamContext(): HydratableStreamContext {
  return { componentIndex: 0, textIndex: 0, eventIndex: 0 };
}

function ssrReset(): void {
  void 0;
}

function hydrationHostComponent(): null {
  return null;
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
 * Stream a page to a ReadableStream.
 */
export function streamPage<D extends object = {}>(
  page: SinwanComponent<D>,
  data: D,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Resolve the page component
        const element = await page(data);

        // Stream the element tree
        await streamNode(element, controller, encoder);

        // Close the stream
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Stream a component with hydration markers.
 */
export function streamHydratablePage(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
  options?: { identifierPrefix?: string },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ctx = createHydratableStreamContext();
  const prefix = options?.identifierPrefix ?? "";

  return new ReadableStream({
    async start(controller) {
      try {
        await streamHydratableComponent(
          component,
          props ?? {},
          controller,
          encoder,
          ctx,
          true,
          prefix,
        );
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Stream a raw node tree with hydration markers.
 */
export function streamHydratableNode(
  node: SinwanNode,
  options?: { identifierPrefix?: string },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const ctx = createHydratableStreamContext();
  const prefix = options?.identifierPrefix ?? "";

  return new ReadableStream({
    async start(controller) {
      try {
        // Create a temporary root instance so useId works correctly even when
        // the rendered tree is a plain function component, and so child
        // components inherit an identifierPrefix.
        const dummy = createComponentInstance(
          hydrationHostComponent as unknown as SinwanComponent<any>,
          {},
          null,
        );
        dummy.identifierPrefix = prefix;
        hydrationHostComponent();
        const prev = setCurrentInstance(dummy);
        try {
          await streamHydratableNodeToController(
            node,
            controller,
            encoder,
            ctx,
          );
        } finally {
          setCurrentInstance(prev);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * Stream a node tree to a controller.
 */
async function streamNode(
  node: SinwanNode,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  // Handle null/undefined/boolean
  if (node == null || typeof node === "boolean") {
    return;
  }

  // Handle strings (escape them)
  if (typeof node === "string") {
    controller.enqueue(encoder.encode(escapeHtml(node)));
    return;
  }

  // Handle numbers
  if (typeof node === "number") {
    controller.enqueue(encoder.encode(String(node)));
    return;
  }

  // Handle pre-escaped HTML
  if (node instanceof HtmlEscapedString) {
    controller.enqueue(encoder.encode(node.value));
    return;
  }

  // Handle reactive containers — stream the escaped current value
  if (isSignal(node) || isComputed(node)) {
    controller.enqueue(encoder.encode(escapeHtml(String((node as any).value))));
    return;
  }

  // Handle React-compatible state getters (useState / useReducer)
  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    controller.enqueue(encoder.encode(escapeHtml(String((node as any)()))));
    return;
  }

  // Plain function getter (0-arity) — resolve and stream as text
  if (typeof node === "function" && (node as any).length === 0) {
    controller.enqueue(encoder.encode(escapeHtml(String((node as any)()))));
    return;
  }

  // Handle arrays - stream each child
  if (Array.isArray(node)) {
    for (const child of node) {
      await streamNode(child, controller, encoder);
    }
    return;
  }

  // Handle async nodes (Promise<SinwanNode>)
  if (node instanceof Promise) {
    const resolved = await Promise.resolve(node as unknown);
    await streamNode(resolved as SinwanNode, controller, encoder);
    return;
  }

  // Handle elements
  await streamElement(node as SinwanElement, controller, encoder);
}

/**
 * Stream an element to the controller.
 */
async function streamElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const { tag, props, children } = element;

  if (tag === ISLAND_TAG || isIslandElement(element)) {
    await streamIsland(element as IslandElement, controller, encoder);
    return;
  }

  if (tag === "") {
    for (const child of children) {
      await streamNode(child, controller, encoder);
    }
    return;
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
    await streamElement((tag as Function)(props), controller, encoder);
    return;
  }

  if (tag === Visible) {
    await streamElement(resolveVisibleRenderNode(element), controller, encoder);
    return;
  }

  if (isShowElement(element)) {
    await streamNode(resolveShowRenderNode(element), controller, encoder);
    return;
  }

  if (isForElement(element)) {
    for (const node of resolveForRenderNodes(element)) {
      await streamNode(node, controller, encoder);
    }
    return;
  }

  if (isSwitchElement(element)) {
    await streamNode(resolveSwitchRenderNode(element), controller, encoder);
    return;
  }

  if (isMatchElement(element)) {
    await streamNode(resolveMatchRenderNode(element), controller, encoder);
    return;
  }

  if (isIndexElement(element)) {
    for (const node of resolveIndexRenderNodes(element)) {
      await streamNode(node, controller, encoder);
    }
    return;
  }

  if (isKeyElement(element)) {
    await streamNode(resolveKeyRenderNode(element), controller, encoder);
    return;
  }

  if (isDynamicElement(element)) {
    const dynamic = renderDynamicElement(element);
    if (dynamic) {
      await streamElement(dynamic, controller, encoder);
    }
    return;
  }

  if (isPortalElement(element)) {
    enqueue(controller, encoder, renderPortalElement(element));
    return;
  }

  if (isErrorBoundaryElement(element)) {
    await renderErrorBoundaryNode(element, ssrReset, (node) =>
      streamNode(node, controller, encoder),
    );
    return;
  }

  if (isVirtualElement(element)) {
    await streamVirtualHtml(
      element,
      (html) => enqueue(controller, encoder, html),
      (node) => streamNode(node, controller, encoder),
    );
    return;
  }

  if (isSuspenseElement(element)) {
    await streamNode(resolveSuspenseRenderNode(element), controller, encoder);
    return;
  }

  if (isViewTransitionElement(element)) {
    await streamNode(
      resolveViewTransitionRenderNode(element),
      controller,
      encoder,
    );
    return;
  }

  if (isActivityElement(element)) {
    await streamElement(
      renderActivityElement(element),
      controller,
      encoder,
    );
    return;
  }

  // Handle functional components
  if (typeof tag === "function") {
    const result = await tag(props);
    await streamNode(result, controller, encoder);
    return;
  }

  // Handle intrinsic HTML elements
  if (typeof tag === "string") {
    await streamIntrinsicElement(tag, props, children, controller, encoder);
    return;
  }

  // Fallback
  await streamNode(children, controller, encoder);
}

/**
 * Stream an intrinsic HTML element.
 */
async function streamIntrinsicElement(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const attrs = renderAttributes(props);

  // Check for dangerous inner HTML
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;

  // Void elements have no children and no closing tag
  if (VOID_ELEMENTS.has(tag)) {
    const html = attrs ? `<${tag}${attrs}>` : `<${tag}>`;
    controller.enqueue(encoder.encode(html));
    return;
  }

  // Opening tag
  const openTag = attrs ? `<${tag}${attrs}>` : `<${tag}>`;
  controller.enqueue(encoder.encode(openTag));

  // Children or dangerous HTML
  if (dangerous && typeof dangerous.__html === "string") {
    controller.enqueue(encoder.encode(dangerous.__html));
  } else {
    await streamNode(children, controller, encoder);
  }

  // Closing tag
  controller.enqueue(encoder.encode(`</${tag}>`));
}

/**
 * Render HTML attributes from props.
 */
function renderAttributes(props: Record<string, unknown>): string {
  let attrs = "";

  for (const [key, value] of Object.entries(props)) {
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
    if (resolvedValue == null) continue;

    attrs += renderServerAttribute(key, resolvedValue);
  }

  return attrs;
}

async function streamHydratableNodeToController(
  node: SinwanNode,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
  isComponentRoot = false,
): Promise<void> {
  if (node == null || typeof node === "boolean") {
    return;
  }

  if (typeof node === "string") {
    enqueue(controller, encoder, escapeHtml(node));
    return;
  }

  if (typeof node === "number") {
    enqueue(controller, encoder, String(node));
    return;
  }

  if (node instanceof HtmlEscapedString) {
    enqueue(controller, encoder, node.value);
    return;
  }

  if (isSignal(node) || isComputed(node)) {
    const idx = ctx.textIndex++;
    enqueue(
      controller,
      encoder,
      `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String((node as any).value))}${adapter.emitTextCloseMarker()}`,
    );
    return;
  }

  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const idx = ctx.textIndex++;
    enqueue(
      controller,
      encoder,
      `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String((node as any)()))}${adapter.emitTextCloseMarker()}`,
    );
    return;
  }

  // Plain function getter (0-arity) — resolve and stream as text
  if (typeof node === "function" && (node as any).length === 0) {
    const idx = ctx.textIndex++;
    enqueue(
      controller,
      encoder,
      `${adapter.emitTextOpenMarker(idx)}${escapeHtml(String((node as any)()))}${adapter.emitTextCloseMarker()}`,
    );
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      await streamHydratableNodeToController(child, controller, encoder, ctx);
    }
    return;
  }

  if (node instanceof Promise) {
    const resolved = await Promise.resolve(node as unknown);
    await streamHydratableNodeToController(
      resolved as SinwanNode,
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  await streamHydratableElement(
    node as SinwanElement,
    controller,
    encoder,
    ctx,
    isComponentRoot,
  );
}

export async function streamHydratableElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
  isComponentRoot: boolean,
): Promise<void> {
  const { tag, props, children } = element;

  if (tag === ISLAND_TAG || isIslandElement(element)) {
    await streamIsland(element as IslandElement, controller, encoder);
    return;
  }

  if (tag === "") {
    let rootMarked = false;
    for (const child of children) {
      const isRoot =
        isComponentRoot &&
        !rootMarked &&
        child != null &&
        typeof child === "object" &&
        "tag" in child &&
        typeof (child as SinwanElement).tag === "string";
      if (isRoot) rootMarked = true;
      if (child != null && typeof child === "object" && "tag" in child) {
        await streamHydratableElement(
          child as SinwanElement,
          controller,
          encoder,
          ctx,
          isRoot,
        );
      } else {
        await streamHydratableNodeToController(child, controller, encoder, ctx);
      }
    }
    return;
  }

  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal ||
    tag === ErrorBoundary
  ) {
    await streamHydratableElement(
      (tag as Function)(props),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (tag === Visible) {
    await streamHydratableElement(
      resolveVisibleRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isShowElement(element)) {
    await streamHydratableNodeToController(
      resolveShowRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isForElement(element)) {
    for (const node of resolveForRenderNodes(element)) {
      await streamHydratableNodeToController(
        node,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  if (isSwitchElement(element)) {
    await streamHydratableNodeToController(
      resolveSwitchRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isMatchElement(element)) {
    await streamHydratableNodeToController(
      resolveMatchRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isIndexElement(element)) {
    for (const node of resolveIndexRenderNodes(element)) {
      await streamHydratableNodeToController(
        node,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  if (isKeyElement(element)) {
    await streamHydratableNodeToController(
      resolveKeyRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isDynamicElement(element)) {
    const dynamic = renderDynamicElement(element);
    if (dynamic) {
      await streamHydratableElement(
        dynamic,
        controller,
        encoder,
        ctx,
        isComponentRoot,
      );
    }
    return;
  }

  if (isPortalElement(element)) {
    enqueue(controller, encoder, renderPortalElement(element));
    return;
  }

  if (isErrorBoundaryElement(element)) {
    await renderErrorBoundaryNode(element, ssrReset, (node) =>
      streamHydratableNodeToController(
        node,
        controller,
        encoder,
        ctx,
        isComponentRoot,
      ),
    );
    return;
  }

  if (isVirtualElement(element)) {
    await streamVirtualHtml(
      element,
      (html) => controller.enqueue(encoder.encode(html)),
      (node) =>
        streamHydratableNodeToController(node, controller, encoder, ctx),
    );
    return;
  }

  if (isSuspenseElement(element)) {
    await streamHydratableNodeToController(
      resolveSuspenseRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isViewTransitionElement(element)) {
    await streamHydratableNodeToController(
      resolveViewTransitionRenderNode(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isActivityElement(element)) {
    await streamHydratableElement(
      renderActivityElement(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (typeof tag === "function") {
    await streamHydratableComponent(
      tag as SinwanComponent<any>,
      props,
      controller,
      encoder,
      ctx,
      true,
    );
    return;
  }

  if (typeof tag === "string") {
    await streamHydratableIntrinsic(
      tag,
      props,
      children,
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  await streamHydratableNodeToController(children, controller, encoder, ctx);
}

async function streamHydratableComponent(
  component: SinwanComponent<any>,
  props: Record<string, unknown>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
  isComponentRoot: boolean,
  identifierPrefix?: string,
): Promise<void> {
  const parentInstance = getCurrentInstance();
  const instance = createComponentInstance(component, props, parentInstance);
  if (parentInstance) {
    parentInstance.children.push(instance);
  }
  if (identifierPrefix !== undefined) {
    instance.identifierPrefix = identifierPrefix;
  }

  const prev = setCurrentInstance(instance);
  try {
    const result = await component(props);
    await streamHydratableNodeToController(
      result,
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
  } finally {
    setCurrentInstance(prev);
  }
}

async function streamHydratableIntrinsic(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
  isComponentRoot: boolean,
): Promise<void> {
  const attrs = renderHydratableAttributes(props, ctx, isComponentRoot);
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;

  enqueue(controller, encoder, attrs ? `<${tag}${attrs}>` : `<${tag}>`);

  if (VOID_ELEMENTS.has(tag)) {
    return;
  }

  if (dangerous && typeof dangerous.__html === "string") {
    enqueue(controller, encoder, dangerous.__html);
  } else {
    for (const child of children) {
      await streamHydratableNodeToController(child, controller, encoder, ctx);
    }
  }

  enqueue(controller, encoder, `</${tag}>`);
}

function renderHydratableAttributes(
  props: Record<string, unknown>,
  ctx: HydratableStreamContext,
  isComponentRoot: boolean,
): string {
  let attrs = "";

  if (isComponentRoot) {
    attrs += ` ${adapter.emitComponentMarker(ctx.componentIndex++)}`;
  }

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
      eventBindings.push([toEventName(key), ctx.eventIndex++]);
      continue;
    }

    const resolvedValue = resolve(value);
    if (resolvedValue == null) continue;

    attrs += renderServerAttribute(key, resolvedValue);
  }

  if (eventBindings.length > 0) {
    attrs += ` ${adapter.emitEventMarker(eventBindings)}`;
  }

  return attrs;
}

function enqueue(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  html: string,
): void {
  controller.enqueue(encoder.encode(html));
}

async function streamIsland(
  element: IslandElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
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
  controller.enqueue(
    encoder.encode(
      `<${__island.tag} ${ISLAND_ATTR}="${safeName}" ${ISLAND_PROPS_ATTR}="${safeProps}">${inner}</${__island.tag}>`,
    ),
  );
}
