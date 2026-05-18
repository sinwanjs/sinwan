/// <reference lib="dom" />

/**
 * SinwanJS Hydration — DOM Walker
 *
 * Walks existing server-rendered DOM and matches it against the
 * virtual SinwanElement tree. Instead of creating new nodes, it
 * discovers existing ones and attaches reactivity to them.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type { MountedNode } from "../renderer/types.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import { effect } from "../reactivity/effect.ts";
import { bindEvents, isEventProp } from "../renderer/events.ts";
import { setSingleAttribute } from "../renderer/attributes.ts";
import { renderControlFlowToDOM } from "../renderer/render-control-flow.ts";
import { HtmlEscapedString } from "../jsx/jsx-runtime.ts";
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
  Virtual,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
  isVirtualElement,
} from "../component/control-flow.ts";
import {
  parseTextOpenMarker,
  isTextCloseMarker,
  COMP_ID_ATTR,
} from "./markers.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
  fireMountedHooks,
  handleComponentError,
  queueUpdatedHooks,
} from "../component/instance.ts";

/**
 * Hydration cursor — tracks our position in the DOM tree walk.
 */
export interface HydrationCursor {
  /** The parent node we are walking inside. */
  parent: Node;
  /** The next child node to process (null = exhausted). */
  current: Node | null;
}

/**
 * Advance the cursor to the next sibling.
 */
export function advance(cursor: HydrationCursor): Node | null {
  const node = cursor.current;
  if (node) {
    cursor.current = node.nextSibling;
  }
  return node;
}

// ─── Hydrate node ──────────────────────────────────────────

/**
 * Hydrate a single SinwanNode by walking existing DOM.
 * Does NOT create new nodes — reuses server-rendered ones.
 */
export function hydrateNode(
  node: SinwanNode,
  cursor: HydrationCursor,
): MountedNode {
  // null/undefined/boolean → skip empty text node
  if (node == null || typeof node === "boolean") {
    const textNode = advance(cursor) as Text;
    return { type: "text", node: textNode ?? document.createTextNode("") };
  }

  // String
  if (typeof node === "string") {
    const textNode = advance(cursor) as Text;
    return { type: "text", node: textNode };
  }

  // Number
  if (typeof node === "number") {
    const textNode = advance(cursor) as Text;
    return { type: "text", node: textNode };
  }

  // Pre-escaped HTML
  if (node instanceof HtmlEscapedString) {
    const textNode = advance(cursor) as Text;
    return { type: "text", node: textNode };
  }

  // Signal / Computed → reactive text with marker comments
  if (isSignal(node) || isComputed(node)) {
    return hydrateReactiveText(node as any, cursor);
  }

  // Array → hydrate each child
  if (Array.isArray(node)) {
    return hydrateArray(node, cursor);
  }

  // SinwanElement
  if (typeof node === "object" && node !== null && "tag" in node) {
    return hydrateElement(node as SinwanElement, cursor);
  }

  // Fallback — skip a text node
  const textNode = advance(cursor) as Text;
  return { type: "text", node: textNode };
}

// ─── Reactive text hydration ──────────────────────────────

/**
 * Hydrate a reactive text slot.
 * Expects: <!--sinwan-t:N-->{text}<!--/sinwan-t--> in the DOM.
 * Attaches an effect to update the text node when the signal changes.
 */
function hydrateReactiveText(
  reactive: { value: unknown },
  cursor: HydrationCursor,
): MountedNode {
  const openComment = cursor.current;
  const owner = getCurrentInstance();

  // Try to find marker pattern: open comment → text → close comment
  if (
    openComment &&
    openComment.nodeType === 8 /* COMMENT_NODE */ &&
    parseTextOpenMarker(openComment as Comment) >= 0
  ) {
    // Skip the opening marker
    advance(cursor);

    // The text node
    const textNode = advance(cursor) as Text;

    // Skip the closing marker
    const closeComment = cursor.current;
    if (
      closeComment &&
      closeComment.nodeType === 8 &&
      isTextCloseMarker(closeComment as Comment)
    ) {
      advance(cursor);
    }

    // Attach reactive effect
    let initialized = false;
    const dispose = effect(() => {
      textNode.data = String(reactive.value);
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
    });

    return { type: "reactive-text", node: textNode, dispose };
  }

  // Fallback: no markers — just treat as a regular text node
  const textNode = advance(cursor) as Text;
  if (textNode) {
    let initialized = false;
    const dispose = effect(() => {
      textNode.data = String(reactive.value);
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
    });
    return { type: "reactive-text", node: textNode, dispose };
  }

  // Last resort — create a new text node and insert it into the DOM
  // at the current cursor position so it isn't orphaned.
  const newText = document.createTextNode(String(reactive.value));
  const parent = cursor.parent;
  const anchor = cursor.current;
  if (anchor) {
    parent.insertBefore(newText, anchor);
  } else {
    parent.appendChild(newText);
  }

  let initialized = false;
  const dispose = effect(() => {
    newText.data = String(reactive.value);
    if (initialized) {
      queueUpdatedHooks(owner);
    }
    initialized = true;
  });
  return { type: "reactive-text", node: newText, dispose };
}

// ─── Element hydration ────────────────────────────────────

/**
 * Hydrate an SinwanElement against existing DOM.
 */
export function hydrateElement(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const { tag, props, children } = element;

  // Fragment — hydrate children in place
  if (tag === "") {
    return hydrateArray(children, cursor);
  }

  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal ||
    tag === Virtual
  ) {
    return hydrateElement((tag as Function)(props), cursor);
  }

  if (tag === Visible) {
    return hydrateElement((tag as Function)(props), cursor);
  }

  if (isPortalElement(element)) {
    return renderControlFlowToDOM(element, cursor.parent, cursor.current, null);
  }

  if (
    isShowElement(element) ||
    isForElement(element) ||
    isSwitchElement(element) ||
    isIndexElement(element) ||
    isKeyElement(element) ||
    isDynamicElement(element) ||
    isVirtualElement(element)
  ) {
    return hydrateControlFlow(element, cursor);
  }

  // Functional component
  if (typeof tag === "function") {
    return hydrateComponent(tag, props, cursor);
  }

  // Intrinsic HTML element
  if (typeof tag === "string") {
    return hydrateIntrinsic(tag, props, children, cursor);
  }

  return hydrateArray(children, cursor);
}

/**
 * Hydrate an intrinsic HTML element.
 * Reuses the existing DOM element, attaches events and reactive attributes.
 */
function hydrateIntrinsic(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  cursor: HydrationCursor,
): MountedNode {
  const el = advance(cursor) as Element;

  if (!el || el.nodeType !== 1 /* ELEMENT_NODE */) {
    // Mismatch — remove the wrong node from the DOM so it doesn't stay
    // orphaned, then fall back to an empty text node.
    console.warn(`[Sinwan hydration] expected <${tag}> but found`, el);
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
    return { type: "text", node: document.createTextNode("") };
  }

  // Remove hydration-specific attributes
  el.removeAttribute(COMP_ID_ATTR);
  el.removeAttribute("data-sinwan-ev");

  // Attach reactive attributes (signals in props)
  const attrDisposers = hydrateAttributes(el, props);

  // Attach event handlers
  const eventCleanups = bindEvents(el, props);
  const refCleanup = applyRef(el, props.ref);

  // Hydrate children
  const childCursor: HydrationCursor = {
    parent: el,
    current: el.firstChild,
  };

  const mountedChildren: MountedNode[] = [];
  for (const child of children) {
    mountedChildren.push(hydrateNode(child, childCursor));
  }

  return {
    type: "element",
    node: el,
    children: mountedChildren,
    eventCleanups,
    attrDisposers,
    refCleanup,
  };
}

/**
 * Hydrate attributes — only attach effects for reactive (signal/computed) props.
 * Static attributes are already correct from SSR.
 */
function hydrateAttributes(
  el: Element,
  props: Record<string, unknown>,
): CleanupFn[] | null {
  let disposers: CleanupFn[] | null = null;
  const owner = getCurrentInstance();

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML" ||
      isEventProp(key)
    )
      continue;

    if (isSignal(value) || isComputed(value)) {
      // Reactive attribute — needs an effect
      const state = { previousStyleProps: new Set<string>() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, (value as any).value, state);
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
      });
      if (!disposers) disposers = [];
      disposers.push(dispose);
    }
    // Static attributes: already rendered by SSR — skip
  }

  return disposers;
}

function hydrateControlFlow(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  if (isShowElement(element)) {
    const when = readReactive((element.props as any).when);
    const content = when
      ? resolveShowChildren(element, when)
      : (element.props as any).fallback;
    return hydrateContent(content, cursor);
  }

  if (isForElement(element)) {
    const props = element.props as {
      each?: unknown;
      fallback?: SinwanNode;
      children?: (item: unknown, index: () => number) => SinwanNode;
    };
    const items = readReactive(props.each);
    // replace map with for loop to avoid creating an intermediate array (critical for hydration)
    const children =
      Array.isArray(items) && typeof props.children === "function"
        ? (() => {
            const result: SinwanNode[] = [];
            for (let i = 0; i < items.length; i++) {
              result.push(props.children!(items[i], () => i));
            }
            return result;
          })()
        : props.fallback
          ? [props.fallback]
          : [];
    return hydrateArray(children, cursor);
  }

  if (isSwitchElement(element)) {
    return hydrateContent(resolveSwitchContent(element), cursor);
  }

  if (isIndexElement(element)) {
    const props = element.props as {
      each?: unknown;
      fallback?: SinwanNode;
      children?: (item: () => unknown, index: number) => SinwanNode;
    };
    const items = readReactive(props.each);
    // replace map with for loop to avoid creating an intermediate array (critical for hydration)
    const children =
      Array.isArray(items) && typeof props.children === "function"
        ? (() => {
            const result: SinwanNode[] = [];
            for (let i = 0; i < items.length; i++) {
              result.push(props.children!(() => items[i], i));
            }
            return result;
          })()
        : props.fallback
          ? [props.fallback]
          : [];
    return hydrateArray(children, cursor);
  }

  if (isKeyElement(element)) {
    const key = readReactive((element.props as any).when);
    return hydrateContent(resolveKeyChildren(element, key), cursor);
  }

  if (isDynamicElement(element)) {
    const tag = readReactive((element.props as any).component);
    const dynamic = createDynamicElement(element, tag);
    return dynamic ? hydrateElement(dynamic, cursor) : hydrateArray([], cursor);
  }

  if (isVirtualElement(element)) {
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
      return hydrateContent(props.fallback ?? null, cursor);
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

    const renderChild = props.children;
    if (typeof renderChild !== "function") {
      return hydrateArray([], cursor);
    }

    // Advance past the container div rendered by the server
    const containerDiv = advance(cursor) as HTMLElement;
    if (!containerDiv || containerDiv.nodeType !== 1) {
      return hydrateArray([], cursor);
    }

    const contentDiv = containerDiv.firstChild as HTMLElement;
    if (!contentDiv || contentDiv.nodeType !== 1) {
      return hydrateArray([], cursor);
    }

    const itemCursor: HydrationCursor = {
      parent: contentDiv,
      current: contentDiv.firstChild,
    };

    const children: MountedNode[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      children.push(
        hydrateNode(
          renderChild(list[i], () => i),
          itemCursor,
        ),
      );
    }

    const anchor = document.createComment("Sinwan-f");
    return { type: "fragment", children, anchor };
  }

  return hydrateArray(element.children, cursor);
}

function hydrateContent(
  content: unknown,
  cursor: HydrationCursor,
): MountedNode {
  if (content == null || typeof content === "boolean") {
    return hydrateArray([], cursor);
  }
  return Array.isArray(content)
    ? hydrateArray(content, cursor)
    : hydrateNode(content as SinwanNode, cursor);
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

type RefValue =
  | ((el: Element | null) => void)
  | { current: Element | null }
  | null
  | undefined;

function applyRef(el: Element, ref: unknown): CleanupFn | null {
  const value = ref as RefValue;
  if (!value) {
    return null;
  }

  if (typeof value === "function") {
    value(el);
    return () => value(null);
  }

  if (typeof value === "object" && "current" in value) {
    value.current = el;
    return () => {
      value.current = null;
    };
  }

  return null;
}

/**
 * Hydrate a functional component.
 * Creates a ComponentInstance, runs setup, then hydrates the returned tree.
 */
function hydrateComponent(
  component: Function,
  props: Record<string, unknown>,
  cursor: HydrationCursor,
): MountedNode {
  const parentInstance = getCurrentInstance();
  const instance = createComponentInstance(
    component as any,
    props,
    parentInstance,
  );

  if (parentInstance) {
    parentInstance.children.push(instance);
  }

  const prevInstance = setCurrentInstance(instance);

  let result: any;
  let child: MountedNode;

  try {
    result = component(props);

    if (result && typeof result === "object" && "tag" in result) {
      child = hydrateElement(result as SinwanElement, cursor);
    } else {
      child = hydrateNode(result as SinwanNode, cursor);
    }
  } catch (err) {
    setCurrentInstance(prevInstance);
    if (!handleComponentError(instance, err as Error)) {
      throw err;
    }
    const textNode = advance(cursor) as Text;
    return {
      type: "component",
      children: [
        { type: "text", node: textNode ?? document.createTextNode("") },
      ],
      disposers: [],
      instance,
    };
  }

  setCurrentInstance(prevInstance);
  instance.element = child;

  return {
    type: "component",
    children: [child],
    disposers: instance.effects,
    instance,
  };
}

// ─── Array hydration ───────────────────────────────────────

/**
 * Hydrate an array of children.
 */
function hydrateArray(
  nodes: SinwanNode[],
  cursor: HydrationCursor,
): MountedNode {
  const children: MountedNode[] = [];
  for (const child of nodes) {
    children.push(hydrateNode(child, cursor));
  }

  // Use a placeholder anchor
  const anchor = document.createComment("Sinwan-f");
  return { type: "fragment", children, anchor };
}
