/**
 * SinwanJS View Module — Streaming SSR
 *
 * Progressive HTML streaming using Bun's native ReadableStream.
 * Streams chunks as they resolve without waiting for full tree.
 */

import type {
  SinwanNode,
  SinwanElement,
  SinwanComponent,
  SinwanSlots,
} from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../escaper.ts";
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
  Match,
  Portal,
  Switch,
  Visible,
  Show,
  isDynamicElement,
  isErrorBoundaryElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
} from "../component/control-flow.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import {
  compId,
  textMarkerOpen,
  textMarkerCloseStr,
  COMP_ID_ATTR,
  EVENT_ATTR,
} from "../hydration/markers.ts";
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

interface HydratableStreamContext {
  componentIndex: number;
  textIndex: number;
  eventIndex: number;
}

function createHydratableStreamContext(): HydratableStreamContext {
  return { componentIndex: 0, textIndex: 0, eventIndex: 0 };
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
        if (prefix) {
          const dummy = createComponentInstance(
            (() => null) as unknown as SinwanComponent<any>,
            {},
            null,
          );
          dummy.identifierPrefix = prefix;
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
        } else {
          await streamHydratableNodeToController(
            node,
            controller,
            encoder,
            ctx,
          );
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
    tag === ErrorBoundary
  ) {
    await streamElement((tag as Function)(props), controller, encoder);
    return;
  }

  if (tag === Visible) {
    await streamElement((tag as Function)(props), controller, encoder);
    return;
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    await streamNode(
      when
        ? resolveShowChildren(element, when)
        : (props.fallback as SinwanNode),
      controller,
      encoder,
    );
    return;
  }

  if (isForElement(element)) {
    await streamForElement(element, controller, encoder);
    return;
  }

  if (isSwitchElement(element)) {
    await streamNode(resolveSwitchContent(element), controller, encoder);
    return;
  }

  if (isMatchElement(element)) {
    const when = readReactive(props.when);
    await streamNode(
      when ? resolveMatchChildren(element, when) : null,
      controller,
      encoder,
    );
    return;
  }

  if (isIndexElement(element)) {
    await streamIndexElement(element, controller, encoder);
    return;
  }

  if (isKeyElement(element)) {
    const key = readReactive(props.when);
    await streamNode(resolveKeyChildren(element, key), controller, encoder);
    return;
  }

  if (isDynamicElement(element)) {
    const dynamicTag = readReactive(props.component);
    const dynamic = createDynamicElement(element, dynamicTag);
    if (dynamic) {
      await streamElement(dynamic, controller, encoder);
    }
    return;
  }

  if (isPortalElement(element)) {
    return;
  }

  if (isErrorBoundaryElement(element)) {
    try {
      await streamNode(props.children as SinwanNode, controller, encoder);
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
      await streamNode(fallbackContent as SinwanNode, controller, encoder);
    }
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

    const resolvedValue = readReactive(value);
    if (resolvedValue == null || resolvedValue === false) continue;

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
      `${textMarkerOpen(idx)}${escapeHtml(String((node as any).value))}${textMarkerCloseStr()}`,
    );
    return;
  }

  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const idx = ctx.textIndex++;
    enqueue(
      controller,
      encoder,
      `${textMarkerOpen(idx)}${escapeHtml(String((node as any)()))}${textMarkerCloseStr()}`,
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

async function streamHydratableElement(
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
    for (const child of children) {
      await streamHydratableNodeToController(child, controller, encoder, ctx);
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
      (tag as Function)(props),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    await streamHydratableNodeToController(
      when
        ? resolveShowChildren(element, when)
        : (props.fallback as SinwanNode),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isForElement(element)) {
    await streamHydratableForElement(element, controller, encoder, ctx);
    return;
  }

  if (isSwitchElement(element)) {
    await streamHydratableNodeToController(
      resolveSwitchContent(element),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isMatchElement(element)) {
    const when = readReactive(props.when);
    await streamHydratableNodeToController(
      when ? resolveMatchChildren(element, when) : null,
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isIndexElement(element)) {
    await streamHydratableIndexElement(element, controller, encoder, ctx);
    return;
  }

  if (isKeyElement(element)) {
    const key = readReactive(props.when);
    await streamHydratableNodeToController(
      resolveKeyChildren(element, key),
      controller,
      encoder,
      ctx,
      isComponentRoot,
    );
    return;
  }

  if (isDynamicElement(element)) {
    const dynamicTag = readReactive(props.component);
    const dynamic = createDynamicElement(element, dynamicTag);
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
    return;
  }

  if (isErrorBoundaryElement(element)) {
    try {
      await streamHydratableNodeToController(
        props.children as SinwanNode,
        controller,
        encoder,
        ctx,
        isComponentRoot,
      );
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
      await streamHydratableNodeToController(
        fallbackContent as SinwanNode,
        controller,
        encoder,
        ctx,
        isComponentRoot,
      );
    }
    return;
  }

  if (typeof tag === "function") {
    await streamHydratableComponent(
      tag as SinwanComponent<any>,
      props,
      controller,
      encoder,
      ctx,
      false,
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

async function streamHydratableForElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
): Promise<void> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    if (props.fallback) {
      await streamHydratableNodeToController(
        props.fallback,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  if (each.length === 0) {
    if (props.fallback) {
      await streamHydratableNodeToController(
        props.fallback,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  for (let index = 0; index < each.length; index++) {
    await streamHydratableNodeToController(
      props.children(each[index], () => index),
      controller,
      encoder,
      ctx,
    );
  }
}

async function streamHydratableIndexElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  ctx: HydratableStreamContext,
): Promise<void> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: () => unknown, index: number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    if (props.fallback) {
      await streamHydratableNodeToController(
        props.fallback,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  if (each.length === 0) {
    if (props.fallback) {
      await streamHydratableNodeToController(
        props.fallback,
        controller,
        encoder,
        ctx,
      );
    }
    return;
  }

  for (let index = 0; index < each.length; index++) {
    await streamHydratableNodeToController(
      props.children(() => each[index], index),
      controller,
      encoder,
      ctx,
    );
  }
}

function renderHydratableAttributes(
  props: Record<string, unknown>,
  ctx: HydratableStreamContext,
  isComponentRoot: boolean,
): string {
  let attrs = "";

  if (isComponentRoot) {
    attrs += ` ${COMP_ID_ATTR}="${compId(ctx.componentIndex++)}"`;
  }

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
      eventParts.push(`${toEventName(key)}:${ctx.eventIndex++}`);
      continue;
    }

    const resolvedValue = readReactive(value);
    if (resolvedValue == null || resolvedValue === false) continue;

    attrs += renderServerAttribute(key, resolvedValue);
  }

  if (eventParts.length > 0) {
    attrs += ` ${EVENT_ATTR}="${eventParts.join(",")}"`;
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

async function streamForElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    if (props.fallback) {
      await streamNode(props.fallback, controller, encoder);
    }
    return;
  }

  if (each.length === 0) {
    if (props.fallback) {
      await streamNode(props.fallback, controller, encoder);
    }
    return;
  }

  for (let index = 0; index < each.length; index++) {
    await streamNode(
      props.children(each[index], () => index),
      controller,
      encoder,
    );
  }
}

async function streamIndexElement(
  element: SinwanElement,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
): Promise<void> {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: () => unknown, index: number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    if (props.fallback) {
      await streamNode(props.fallback, controller, encoder);
    }
    return;
  }

  if (each.length === 0) {
    if (props.fallback) {
      await streamNode(props.fallback, controller, encoder);
    }
    return;
  }

  for (let index = 0; index < each.length; index++) {
    await streamNode(
      props.children(() => each[index], index),
      controller,
      encoder,
    );
  }
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

/**
 * Stream an island element: emit the static wrapper tag with hydration
 * markers inside, plus the embedded props JSON the client needs to hydrate.
 *
 * Islands always render to a single `renderToHydratableString` call so each
 * island has an independent marker counter starting at 0 — this is what
 * makes them safe to hydrate individually on the client.
 */
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
