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
import { resolve, type CleanupFn } from "../reactivity/index.ts";
import { isSignal } from "../reactivity/signal.ts";
import { STATE_GETTER_MARKER } from "../integrations/react/_internal/bridge.ts";
import { isComputed } from "../reactivity/computed.ts";
import { effect } from "../reactivity/effect.ts";
import { bindEvents, isEventProp } from "../renderer/events.ts";
import { setSingleAttribute } from "../renderer/attributes.ts";
import {
  renderBlockContent,
  renderControlFlowToDOM,
  renderForBlock,
  type ForRecord,
} from "../renderer/render-control-flow.ts";
import { HtmlEscapedString } from "../jsx/jsx-runtime.ts";
import { signal } from "../reactivity/signal.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
  getActiveSuspenseBoundary,
} from "../renderer/suspense-boundary.ts";
import {
  errorBoundaryStack,
  softHideMountedTree,
  softShowMountedTree,
  fireMountedAndQueueUpdated,
  clearChildren,
} from "../renderer/render-control-flow.ts";
import { renderNodeToDOM } from "../renderer/render-children.ts";
import { applyRef, renderElementToDOM } from "../renderer/render-element.ts";
import { removeMountedNode, getMountedDomNodes } from "../renderer/unmount.ts";
import type {
  MountedElement,
  MountedReactiveBlock,
} from "../renderer/types.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Portal,
  Switch,
  Visible,
  Show,
  Virtual,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
  isVirtualElement,
  isErrorBoundaryElement,
  isSuspenseElement,
  isActivityElement,
  isViewTransitionElement,
  resolveSwitchContent,
  resolveKeyChildren,
  resolveShowChildren,
  createDynamicElement,
  normalizeContent,
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
  handleComponentError,
  queueUpdatedHooks,
  fireMountedHooks,
  withInstance,
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

  // React-compatible state getter → treat as reactive text
  if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
    const sig = (node as any).__signal__;
    if (sig && (isSignal(sig) || isComputed(sig))) {
      return hydrateReactiveText(sig, cursor);
    }
  }

  // Plain function getter (0-arity) — resolve for hydration,
  // attach effect so it stays reactive when dependencies change.
  if (typeof node === "function" && (node as any).length === 0) {
    return hydrateReactiveFunction(node as Function, cursor);
  }

  // Array → hydrate each child
  if (Array.isArray(node)) {
    return hydrateArray(node, cursor);
  }

  // SinwanElement
  if (typeof node === "object" && node !== null && "tag" in node) {
    return hydrateElement(node as SinwanElement, cursor);
  }

  // Promise → throw to Suspense boundary
  if (node instanceof Promise) {
    throw node;
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

/**
 * Hydrate a plain function getter (0-arity) as reactive text.
 * The server renders the resolved value as text without markers.
 * We match the existing text node and attach an effect so updates
 * are reflected when the function's signal dependencies change.
 */
function hydrateReactiveFunction(
  fn: Function,
  cursor: HydrationCursor,
): MountedNode {
  const textNode = advance(cursor) as Text;
  const owner = getCurrentInstance();

  if (textNode) {
    let initialized = false;
    const dispose = effect(() => {
      textNode.data = String(fn());
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
    });
    return { type: "reactive-text", node: textNode, dispose };
  }

  // Last resort — create a new text node and insert it into the DOM
  // at the current cursor position so it isn't orphaned.
  const newText = document.createTextNode(String(fn()));
  const parent = cursor.parent;
  const anchor = cursor.current;
  if (anchor) {
    parent.insertBefore(newText, anchor);
  } else {
    parent.appendChild(newText);
  }

  let initialized = false;
  const dispose = effect(() => {
    newText.data = String(fn());
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
    isVirtualElement(element) ||
    isErrorBoundaryElement(element) ||
    isSuspenseElement(element) ||
    isActivityElement(element) ||
    isViewTransitionElement(element)
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
    } else if (
      typeof value === "function" &&
      (value as any)[STATE_GETTER_MARKER]
    ) {
      const sig = (value as any).__signal__;
      if (sig && (isSignal(sig) || isComputed(sig))) {
        const state = { previousStyleProps: new Set<string>() };
        let initialized = false;
        const dispose = effect(() => {
          setSingleAttribute(el, key, sig.value, state);
          if (initialized) {
            queueUpdatedHooks(owner);
          }
          initialized = true;
        });
        if (!disposers) disposers = [];
        disposers.push(dispose);
      }
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
    const when = resolve((element.props as any).when);
    const content = when
      ? resolveShowChildren(element, when)
      : (element.props as any).fallback;
    const initialMounted = hydrateContent(content, cursor);
    return makeReactiveBlock(
      initialMounted,
      () => {
        const newWhen = resolve((element.props as any).when);
        return newWhen
          ? resolveShowChildren(element, newWhen)
          : (element.props as any).fallback;
      },
      () => resolve((element.props as any).when),
    );
  }

  if (isForElement(element)) {
    const props = element.props as {
      each?: unknown;
      key?: (item: unknown, index: number) => string | number | symbol;
      fallback?: SinwanNode;
      children?: (item: unknown, index: () => number) => SinwanNode;
    };
    const items = resolve(props.each);
    const list = Array.isArray(items) ? items : [];
    const renderChild = props.children;

    // Empty list (or no children fn) at hydration: there is nothing to
    // reconcile, so keep the generic reactive block which correctly handles
    // the empty → non-empty transition. This matches prior <For> behavior.
    if (typeof renderChild !== "function" || list.length === 0) {
      const resolveChildren = () => {
        const its = resolve(props.each);
        if (Array.isArray(its) && typeof props.children === "function") {
          const result: SinwanNode[] = [];
          for (let i = 0; i < its.length; i++) {
            const index = i;
            result.push(props.children!(its[i], () => index));
          }
          return result;
        }
        return props.fallback ? [props.fallback] : [];
      };
      const initialMounted = hydrateArray(resolveChildren(), cursor);
      return makeReactiveBlock(
        initialMounted,
        () => resolveChildren() as unknown as SinwanNode,
      );
    }

    // Non-empty list: hydrate each child into a keyed record, then delegate
    // updates to the same keyed reconciler the client renderer uses. This
    // preserves DOM nodes / component state on update instead of recreating
    // the whole list (parity with client-side <For>).
    const records: ForRecord<unknown>[] = [];
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const key = props.key ? props.key(item, i) : item;
      const record: ForRecord<unknown> = {
        key,
        item,
        index: i,
        mounted: undefined as unknown as MountedNode,
      };
      const childNode = renderChild(item, () => record.index);
      record.mounted = hydrateNode(childNode, cursor);
      records.push(record);
    }

    const domNodes = records.flatMap((r) => getMountedDomNodes(r.mounted));
    const firstNode = domNodes[0]!;
    const parentNode = firstNode.parentNode!;
    const startAnchor = (parentNode.ownerDocument || document).createComment(
      "Sinwan-hyd-for",
    );
    const endAnchor = (parentNode.ownerDocument || document).createComment(
      "/Sinwan-hyd-for",
    );
    parentNode.insertBefore(startAnchor, firstNode);
    const lastNode = domNodes[domNodes.length - 1]!;
    if (lastNode.nextSibling) {
      parentNode.insertBefore(endAnchor, lastNode.nextSibling);
    } else {
      parentNode.appendChild(endAnchor);
    }

    const childrenArr = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
      childrenArr[i] = records[i].mounted;
    }

    const block: MountedReactiveBlock = {
      type: "reactive-block",
      dispose: () => {},
      children: childrenArr,
      startAnchor,
      endAnchor,
    };

    const owner = getCurrentInstance();
    block.dispose = renderForBlock(element, block, parentNode, null, owner, {
      records,
      lastList: list,
    });
    return block;
  }

  if (isSwitchElement(element)) {
    const content = resolveSwitchContent(element);
    const initialMounted = hydrateContent(content, cursor);
    return makeReactiveBlock(initialMounted, () =>
      resolveSwitchContent(element),
    );
  }

  if (isIndexElement(element)) {
    const props = element.props as {
      each?: unknown;
      fallback?: SinwanNode;
      children?: (item: () => unknown, index: number) => SinwanNode;
    };
    const items = resolve(props.each);
    const list = Array.isArray(items) ? items : [];
    const renderChild = props.children;

    if (typeof renderChild !== "function") {
      return hydrateContent(props.fallback ?? null, cursor);
    }

    if (list.length === 0) {
      return hydrateContent(props.fallback ?? null, cursor);
    }

    // Create item signals and hydrate children with reactive getters
    const records: { item: any; mounted: MountedNode }[] = [];
    for (let i = 0; i < list.length; i++) {
      const itemSignal = signal(list[i]);
      const childNode = renderChild(() => itemSignal.value, i);
      records.push({
        item: itemSignal,
        mounted: hydrateNode(childNode, cursor),
      });
    }

    // Build reactive block with anchors
    const domNodes = records.flatMap((r) => getMountedDomNodes(r.mounted));
    const firstNode = domNodes[0]!;
    const parentNode = firstNode.parentNode!;
    const startAnchor = (parentNode.ownerDocument || document).createComment(
      "Sinwan-hyd-idx",
    );
    const endAnchor = (parentNode.ownerDocument || document).createComment(
      "/Sinwan-hyd-idx",
    );
    parentNode.insertBefore(startAnchor, firstNode);
    const lastNode = domNodes[domNodes.length - 1]!;
    if (lastNode.nextSibling) {
      parentNode.insertBefore(endAnchor, lastNode.nextSibling);
    } else {
      parentNode.appendChild(endAnchor);
    }

    const childrenArr = new Array(records.length);
    for (let i = 0; i < records.length; i++) {
      childrenArr[i] = records[i].mounted;
    }

    const block: MountedReactiveBlock = {
      type: "reactive-block",
      dispose: () => {},
      children: childrenArr,
      startAnchor,
      endAnchor,
    };

    const owner = getCurrentInstance();
    let initialized = false;

    const disposeEffect = effect(() => {
      const newItems = resolve(props.each);
      const newList = Array.isArray(newItems) ? newItems : [];
      const currentRenderChild = props.children;

      if (!initialized) {
        initialized = true;
        return;
      }

      if (typeof currentRenderChild !== "function") {
        clearChildren(block);
        while (records.length > 0) {
          removeMountedNode(records.pop()!.mounted);
        }
        block.children = [];
        if (owner) {
          queueUpdatedHooks(owner);
        }
        return;
      }

      if (newList.length === 0) {
        clearChildren(block);
        while (records.length > 0) {
          removeMountedNode(records.pop()!.mounted);
        }
        block.children = renderBlockContent(
          props.fallback ?? null,
          parentNode,
          endAnchor,
          null,
          owner,
        );
        if (owner) {
          fireMountedAndQueueUpdated(owner);
        }
        return;
      }

      if (records.length === 0 && block.children.length > 0) {
        clearChildren(block);
      }

      // Update existing item signals (granular — only changed values trigger DOM updates)
      const minLen = Math.min(records.length, newList.length);
      for (let i = 0; i < minLen; i++) {
        records[i].item.value = newList[i];
      }

      // Remove extra items
      while (records.length > newList.length) {
        const removed = records.pop()!;
        removeMountedNode(removed.mounted);
      }

      // Add new items
      for (let i = records.length; i < newList.length; i++) {
        const itemSignal = signal(newList[i]);
        const childNode = currentRenderChild(() => itemSignal.value, i);
        const mounted = owner
          ? withInstance(owner, () =>
              renderNodeToDOM(childNode, parentNode, endAnchor, null),
            )
          : renderNodeToDOM(childNode, parentNode, endAnchor, null);
        records.push({ item: itemSignal, mounted });
      }

      // Update block children references
      const childrenArr = new Array(records.length);
      for (let i = 0; i < records.length; i++) {
        childrenArr[i] = records[i].mounted;
      }
      block.children = childrenArr;

      if (owner) {
        fireMountedAndQueueUpdated(owner);
      }
    });

    block.dispose = disposeEffect;
    return block;
  }

  if (isKeyElement(element)) {
    return hydrateKey(element, cursor);
  }

  if (isDynamicElement(element)) {
    const tag = resolve((element.props as any).component);
    const dynamic = createDynamicElement(element, tag);
    const initialMounted = dynamic
      ? hydrateElement(dynamic, cursor)
      : hydrateArray([], cursor);
    return makeReactiveBlock(
      initialMounted,
      () => {
        const newTag = resolve((element.props as any).component);
        const newDynamic = createDynamicElement(element, newTag);
        return newDynamic;
      },
      () => resolve((element.props as any).component),
    );
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

    const items = resolve(props.each);
    const list = Array.isArray(items) ? items : [];

    if (list.length === 0) {
      return hydrateContent(props.fallback ?? null, cursor);
    }

    const itemHeight = props.itemHeight;
    const containerHeight = props.containerHeight;
    const overscan = props.overscan ?? 3;
    const minRendered = props.minRendered ?? 0;

    let startIndex: number;
    let endIndex: number;

    const renderChild = props.children;
    if (typeof renderChild !== "function") {
      return hydrateArray([], cursor);
    }

    // Extract shared range calculation logic
    const resolveRange = (
      scrollTop: number,
      length: number,
    ): readonly [number, number] => {
      let s = Math.floor(scrollTop / itemHeight);
      let e = Math.ceil((scrollTop + containerHeight) / itemHeight);
      s = Math.max(0, s - overscan);
      e = Math.min(length, e + overscan);
      if (minRendered > 0) {
        const visibleCount = e - s;
        if (visibleCount < minRendered) {
          const deficit = minRendered - visibleCount;
          const expandStart = Math.min(s, Math.floor(deficit / 2));
          const expandEnd = Math.min(length - e, Math.ceil(deficit / 2));
          const remaining = deficit - expandStart - expandEnd;
          s -= expandStart;
          e += expandEnd;
          if (remaining > 0) {
            if (e < length) {
              e = Math.min(length, e + remaining);
            } else if (s > 0) {
              s = Math.max(0, s - remaining);
            }
          }
        }
      }
      return [s, e] as const;
    };

    const initialRange = resolveRange(0, list.length);
    startIndex = initialRange[0];
    endIndex = initialRange[1];

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
      const index = i;
      const child = renderChild(list[i], () => index);
      children.push(
        hydrateNode(
          {
            tag: "div",
            props: {
              style: `position:absolute;top:${i * itemHeight}px;left:0;right:0`,
            },
            children: normalizeContent(child),
          },
          itemCursor,
        ),
      );
    }

    const keyFn = props.key;
    interface VirtualEntry {
      mounted: MountedNode;
      wrapperEl: HTMLElement;
      currentIndex: number;
    }
    const keyMap = new Map<string | number | symbol, VirtualEntry>();
    for (let i = startIndex; i < endIndex; i++) {
      const key = keyFn ? (keyFn(list[i], i) ?? i) : i;
      const m = children[i - startIndex];
      if (m.type !== "element") continue;
      const wrapperEl = (m as MountedElement).node as HTMLElement;
      if (!wrapperEl) continue;
      keyMap.set(key, { mounted: m, wrapperEl, currentIndex: i });
    }

    const contentMounted: MountedElement = {
      type: "element",
      node: contentDiv,
      children,
      eventCleanups: null,
      attrDisposers: null,
      refCleanup: null,
    };

    const mounted: MountedElement = {
      type: "element",
      node: containerDiv,
      children: [contentMounted],
      eventCleanups: null,
      attrDisposers: null,
      refCleanup: null,
    };

    // Setup scroll reactivity after hydration
    if (typeof window !== "undefined") {
      const scrollSignal = signal(0);
      const scrollHandler = () => {
        scrollSignal.value = containerDiv.scrollTop;
      };
      containerDiv.addEventListener("scroll", scrollHandler, { passive: true });

      // Store cleanup on the mounted element
      const scrollCleanup = () =>
        containerDiv.removeEventListener("scroll", scrollHandler);

      // Effect that updates visible items on scroll
      let initialized = false;
      const disposeScrollEffect = effect(() => {
        const scrollTop = scrollSignal.value;

        // Re-read list to handle signal updates
        const currentList = (() => {
          const items = resolve(props.each);
          return Array.isArray(items) ? items : [];
        })();

        // Skip first run - DOM is already hydrated
        if (!initialized) {
          initialized = true;
          // Just set the total height on first run
          const totalHeight = currentList.length * itemHeight;
          contentDiv.style.height = `${totalHeight}px`;
          return;
        }
        const totalHeight = currentList.length * itemHeight;
        contentDiv.style.height = `${totalHeight}px`;

        const [newStart, newEnd] = resolveRange(scrollTop, currentList.length);

        // Keyed node reuse: keep existing nodes, create only new ones, remove old ones
        const newChildren: MountedNode[] = [];
        const newKeyMap = new Map<string | number | symbol, VirtualEntry>();

        for (let i = newStart; i < newEnd; i++) {
          const key = keyFn ? (keyFn(currentList[i], i) ?? i) : i;
          const entry = keyMap.get(key);
          if (entry) {
            if (entry.currentIndex !== i) {
              entry.wrapperEl.style.top = `${i * itemHeight}px`;
              entry.currentIndex = i;
            }
            newChildren.push(entry.mounted);
            keyMap.delete(key);
            newKeyMap.set(key, entry);
          } else {
            const childNode = renderChild!(currentList[i], () => i);
            const wrapped: SinwanElement = {
              tag: "div",
              props: {
                style: `position:absolute;top:${i * itemHeight}px;left:0;right:0`,
              },
              children: normalizeContent(childNode),
            };
            const rendered = renderElementToDOM(
              wrapped,
              contentDiv,
              null,
              null,
            );
            if (rendered.type !== "element") {
              newChildren.push(rendered);
              continue;
            }
            const wrapperEl = (rendered as MountedElement).node as HTMLElement;
            newChildren.push(rendered);
            newKeyMap.set(key, {
              mounted: rendered,
              wrapperEl,
              currentIndex: i,
            });
          }
        }

        // Remove nodes that are no longer in the visible window
        for (const [, entry] of keyMap) {
          removeMountedNode(entry.mounted);
        }

        contentMounted.children = newChildren;
        // Update keyMap for next scroll effect run
        keyMap.clear();
        for (const [k, v] of newKeyMap) {
          keyMap.set(k, v);
        }
      });

      // Store cleanup on the mounted element
      mounted.eventCleanups = [scrollCleanup, disposeScrollEffect];
    }

    return mounted;
  }

  if (isErrorBoundaryElement(element)) {
    return hydrateErrorBoundary(element, cursor);
  }

  if (isSuspenseElement(element)) {
    return hydrateSuspense(element, cursor);
  }

  if (isActivityElement(element)) {
    return hydrateActivity(element, cursor);
  }

  if (isViewTransitionElement(element)) {
    return hydrateViewTransition(element, cursor);
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

    const boundary = getActiveSuspenseBoundary();
    if (
      boundary &&
      err &&
      typeof err === "object" &&
      typeof (err as any).then === "function"
    ) {
      boundary.promises.add(err as PromiseLike<unknown>);
      throw err;
    }

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

  // Insert the anchor after the last child node of the fragment.
  // After hydrating all children, cursor.current points to the next sibling
  // after the fragment, which is the correct insertion point for the anchor.
  const anchor = document.createComment("Sinwan-f");
  if (cursor.current) {
    cursor.parent.insertBefore(anchor, cursor.current);
  } else {
    cursor.parent.appendChild(anchor);
  }
  return { type: "fragment", children, anchor };
}

// ─── Control flow hydration helpers ────────────────────────

function hydrateErrorBoundary(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    fallback?: SinwanNode | ((error: Error, reset: () => void) => SinwanNode);
    children?: SinwanNode;
  };
  const resetSignal = signal(0);
  let error: Error | null = null;
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("Sinwan-b");
  const endAnchor = document.createComment("/Sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => {},
    children: [],
    startAnchor,
    endAnchor,
  };

  let initialized = false;
  const dispose = effect(() => {
    void resetSignal.value;

    if (initialized) {
      clearChildren(block);
      errorBoundaryStack.push(block);
      try {
        block.children = renderBlockContent(
          props.children,
          parent,
          endAnchor,
          null,
          owner,
        );
        error = null;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        const fallback = props.fallback;
        const fallbackContent: SinwanNode =
          typeof fallback === "function"
            ? (fallback as any)(error, () => {
                error = null;
                resetSignal.value = resetSignal.value + 1;
              })
            : fallback;
        block.children = renderBlockContent(
          fallbackContent,
          parent,
          endAnchor,
          null,
          owner,
        );
      } finally {
        errorBoundaryStack.pop();
      }
      fireMountedAndQueueUpdated(owner);
      return;
    }

    errorBoundaryStack.push(block);
    try {
      const child = hydrateContent(props.children, cursor);
      block.children = [child];
      initialized = true;
      parent.insertBefore(endAnchor, cursor.current);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      parent.insertBefore(endAnchor, cursor.current);
      clearChildren(block);
      const fallback = props.fallback;
      const fallbackContent: SinwanNode =
        typeof fallback === "function"
          ? (fallback as any)(error, () => {
              error = null;
              resetSignal.value = resetSignal.value + 1;
            })
          : fallback;
      block.children = renderBlockContent(
        fallbackContent,
        parent,
        endAnchor,
        null,
        owner,
      );
      initialized = true;
    } finally {
      errorBoundaryStack.pop();
    }
  });

  block.dispose = dispose;
  return block;
}

function hydrateSuspense(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    fallback: SinwanNode;
    children?: SinwanNode;
  };
  const retrySignal = signal(0);
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("Sinwan-b");
  const endAnchor = document.createComment("/Sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => {},
    children: [],
    startAnchor,
    endAnchor,
  };

  let initialized = false;
  let disposed = false;
  let fallbackNode: MountedNode | null = null;
  let contentNodes: MountedNode[] = [];
  const asyncComponentResults = new Map<Function, unknown>();

  const dispose = effect(() => {
    void retrySignal.value;

    if (initialized) {
      for (const node of contentNodes) {
        removeMountedNode(node);
      }
      contentNodes = [];

      const boundary = {
        promises: new Set<PromiseLike<unknown>>(),
        onResolved: () => {},
        asyncComponentResults,
      };
      let retryScheduled = false;
      boundary.onResolved = () => {
        if (disposed || retryScheduled) return;
        retryScheduled = true;
        queueMicrotask(() => {
          retryScheduled = false;
          if (!disposed) {
            retrySignal.value = retrySignal.value + 1;
          }
        });
      };

      pushSuspenseBoundary(boundary);

      const children = props.children;
      const childArray =
        children != null
          ? Array.isArray(children)
            ? children
            : [children]
          : [];
      const nodes: MountedNode[] = [];

      try {
        for (const child of childArray) {
          if (child != null) {
            nodes.push(renderNodeToDOM(child, parent, endAnchor, null));
          }
        }
        popSuspenseBoundary();
        if (fallbackNode) {
          removeMountedNode(fallbackNode);
          fallbackNode = null;
        }
        block.children = nodes;
        contentNodes = nodes;
      } catch (err) {
        popSuspenseBoundary();
        for (const node of nodes) {
          removeMountedNode(node);
        }
        if (
          err &&
          typeof err === "object" &&
          typeof (err as any).then === "function"
        ) {
          boundary.promises.add(err as any);
          if (!fallbackNode) {
            fallbackNode = renderNodeToDOM(
              props.fallback,
              parent,
              endAnchor,
              null,
            );
          }
          block.children = fallbackNode ? [fallbackNode] : [];
        } else {
          throw err;
        }
      }

      for (const promise of boundary.promises) {
        promise.then(() => boundary.onResolved());
      }
      boundary.promises.clear();

      fireMountedAndQueueUpdated(owner);
      return;
    }

    const children = props.children;
    const childArray =
      children != null ? (Array.isArray(children) ? children : [children]) : [];
    const nodes: MountedNode[] = [];

    const boundary = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved: () => {},
      asyncComponentResults,
    };
    let retryScheduled = false;
    boundary.onResolved = () => {
      if (disposed || retryScheduled) return;
      retryScheduled = true;
      queueMicrotask(() => {
        retryScheduled = false;
        if (!disposed) {
          retrySignal.value = retrySignal.value + 1;
        }
      });
    };

    pushSuspenseBoundary(boundary);

    try {
      for (const child of childArray) {
        if (child != null) {
          nodes.push(hydrateNode(child, cursor));
        }
      }
      popSuspenseBoundary();
      parent.insertBefore(endAnchor, cursor.current);
      block.children = nodes;
      contentNodes = nodes;
      initialized = true;
    } catch (err) {
      popSuspenseBoundary();
      if (
        err &&
        typeof err === "object" &&
        typeof (err as any).then === "function"
      ) {
        boundary.promises.add(err as any);
        fallbackNode = hydrateNode(props.fallback, cursor);
        parent.insertBefore(endAnchor, cursor.current);
        block.children = fallbackNode ? [fallbackNode] : [];
        contentNodes = block.children;
        initialized = true;
      } else {
        throw err;
      }
    }

    for (const promise of boundary.promises) {
      promise.then(() => boundary.onResolved());
    }
    boundary.promises.clear();
  });

  block.dispose = () => {
    disposed = true;
    dispose();
  };
  return block;
}

function hydrateActivity(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    mode?: any;
    children?: SinwanNode;
  };
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("Sinwan-b");
  const endAnchor = document.createComment("/Sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => {},
    children: [],
    startAnchor,
    endAnchor,
  };

  let initialized = false;
  let wasHidden = false;
  let wrapperMounted: MountedElement | null = null;

  const dispose = effect(() => {
    const currentMode = resolve(props.mode) ?? "visible";
    const hidden = currentMode === "hidden";

    if (initialized) {
      if (hidden !== wasHidden && wrapperMounted) {
        const wrapper = wrapperMounted.node as HTMLElement;
        wrapper.setAttribute(
          "data-sinwan-activity",
          hidden ? "hidden" : "visible",
        );
        if (hidden) {
          wrapper.setAttribute("hidden", "");
          wrapper.style.display = "none";
          softHideMountedTree(wrapperMounted);
        } else {
          wrapper.removeAttribute("hidden");
          wrapper.style.display = "";
          softShowMountedTree(wrapperMounted);
        }
        wasHidden = hidden;
      }
      fireMountedAndQueueUpdated(owner);
      return;
    }

    // Hydrate the wrapper element from DOM
    const wrapper = advance(cursor) as HTMLElement;
    if (wrapper && wrapper.nodeType === 1) {
      const itemCursor: HydrationCursor = {
        parent: wrapper,
        current: wrapper.firstChild,
      };
      const child = hydrateContent(props.children, itemCursor);

      wrapperMounted = {
        type: "element",
        node: wrapper,
        children: [child],
        eventCleanups: null,
        attrDisposers: null,
        refCleanup: null,
      };

      block.children = [wrapperMounted];

      if (hidden) {
        wrapper.style.display = "none";
        softHideMountedTree(wrapperMounted);
      }
      wasHidden = hidden;
    }

    parent.insertBefore(endAnchor, cursor.current);
    initialized = true;
  });

  block.dispose = dispose;
  return block;
}

function hydrateViewTransition(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    name?: string;
    children?: SinwanNode;
  };
  const name = props.name;

  if (!name) {
    return hydrateContent(props.children, cursor);
  }

  const wrapper = advance(cursor) as HTMLElement;
  if (!wrapper || wrapper.nodeType !== 1) {
    return hydrateContent(props.children, cursor);
  }

  const itemCursor: HydrationCursor = {
    parent: wrapper,
    current: wrapper.firstChild,
  };
  const child = hydrateContent(props.children, itemCursor);

  const mounted: MountedElement = {
    type: "element",
    node: wrapper,
    children: [child],
    eventCleanups: null,
    attrDisposers: null,
    refCleanup: null,
  };

  return mounted;
}

interface HydratedKeyCacheEntry {
  key: unknown;
  mounted: MountedNode[];
  fragment: DocumentFragment;
}

function fireMountedForSubtree(node: MountedNode): void {
  if (node.type === "component" && node.instance) {
    fireMountedHooks(node.instance);
    return;
  }
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      fireMountedForSubtree(child);
    }
  }
}

function hydrateKey(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const key = resolve((element.props as any).when);
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("Sinwan-b");
  const endAnchor = document.createComment("/Sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => {},
    children: [],
    startAnchor,
    endAnchor,
  };

  let initialized = false;
  let currentKey: unknown;
  let currentEntry: HydratedKeyCacheEntry | null = null;
  const cache = new Map<unknown, HydratedKeyCacheEntry>();
  const useCache = (element.props as any).cache !== false;

  // Hydrate initial content for the current key
  const initialMounted = hydrateContent(
    resolveKeyChildren(element, key),
    cursor,
  );
  parent.insertBefore(endAnchor, cursor.current);
  block.children = [initialMounted];

  const entry: HydratedKeyCacheEntry = {
    key,
    mounted: [initialMounted],
    fragment: document.createDocumentFragment(),
  };
  cache.set(key, entry);
  currentEntry = entry;
  currentKey = key;

  const disposeEffect = effect(() => {
    const newKey = resolve((element.props as any).when);
    if (initialized && Object.is(currentKey, newKey)) {
      return;
    }

    // When cache=false, fully unmount old content (React-style key behavior)
    if (!useCache && currentEntry) {
      for (const child of currentEntry.mounted) {
        removeMountedNode(child);
      }
      currentEntry = null;
    }

    // Soft-hide and detach current entry (keep-alive path)
    if (useCache && currentEntry) {
      for (const child of currentEntry.mounted) {
        softHideMountedTree(child);
      }
      for (const child of currentEntry.mounted) {
        for (const node of getMountedDomNodes(child)) {
          currentEntry.fragment.appendChild(node);
        }
      }
    }

    currentKey = newKey;
    initialized = true;

    if (!useCache) {
      // React-style: always render fresh, never cache
      const content = resolveKeyChildren(element, newKey);
      const mounted = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        null,
        owner,
      );
      const nextEntry: HydratedKeyCacheEntry = {
        key: newKey,
        mounted,
        fragment: document.createDocumentFragment(),
      };
      currentEntry = nextEntry;
      block.children = nextEntry.mounted;

      for (const child of nextEntry.mounted) {
        fireMountedForSubtree(child);
      }
      if (owner) {
        queueUpdatedHooks(owner);
      }
      return;
    }

    // Look up or create cache entry for this key
    let nextEntry = cache.get(newKey);
    if (!nextEntry) {
      const content = resolveKeyChildren(element, newKey);
      const mounted = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        null,
        owner,
      );
      nextEntry = {
        key: newKey,
        mounted,
        fragment: document.createDocumentFragment(),
      };
      cache.set(newKey, nextEntry);

      // Fire mounted hooks for newly created components
      for (const child of nextEntry.mounted) {
        fireMountedForSubtree(child);
      }
    } else {
      // Reattach DOM nodes from the cached fragment
      for (const child of nextEntry.mounted) {
        for (const node of getMountedDomNodes(child)) {
          parent.insertBefore(node, block.endAnchor);
        }
      }
      // Soft-show to restore state and fire mounted hooks
      for (const child of nextEntry.mounted) {
        softShowMountedTree(child);
      }
    }

    currentEntry = nextEntry;
    block.children = nextEntry.mounted;

    if (owner) {
      queueUpdatedHooks(owner);
    }
  });

  block.dispose = disposeEffect;
  return block;
}

/**
 * Wraps an already-hydrated MountedNode in a reactive block that re-renders
 * when the source signal changes. This makes control-flow elements (Show, Key,
 * Dynamic) reactive after hydration.
 *
 * Strategy:
 * 1. Insert anchor comments around the existing hydrated DOM
 * 2. Create a MountedReactiveBlock containing the hydrated content
 * 3. Set up an effect that watches the source signal
 * 4. On change: clear children, render new content between anchors
 */
function makeReactiveBlock(
  initialMounted: MountedNode,
  getContent: () => SinwanNode | null,
  getCompareValue?: () => unknown,
): MountedNode {
  // Get all DOM nodes belonging to the initial hydrated content
  const domNodes = getMountedDomNodes(initialMounted);

  if (domNodes.length === 0) {
    // No DOM to wrap - just return the original mounted node
    return initialMounted;
  }

  const firstNode = domNodes[0];
  const parent = firstNode.parentNode;
  if (!parent) return initialMounted;

  // Insert anchor comments around the hydrated content
  const startAnchor = (parent.ownerDocument || document).createComment(
    "Sinwan-hyd-b",
  );
  const endAnchor = (parent.ownerDocument || document).createComment(
    "/Sinwan-hyd-b",
  );

  parent.insertBefore(startAnchor, firstNode);
  const lastNode = domNodes[domNodes.length - 1];
  if (lastNode.nextSibling) {
    parent.insertBefore(endAnchor, lastNode.nextSibling);
  } else {
    parent.appendChild(endAnchor);
  }

  const owner = getCurrentInstance();
  let isFirstRun = true;
  let prevValue: unknown;

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => {},
    children: [initialMounted],
    startAnchor,
    endAnchor,
  };

  const disposeEffect = effect(() => {
    // When a comparison getter is provided (Show, Dynamic), track only the
    // value that should trigger a re-render. This mirrors the client-side
    // renderShowBlock/renderDynamicBlock optimization and prevents a wrapping
    // block from destroying/recreating its subtree when a computed `when`
    // (or component `tag`) re-evaluates to the same value — e.g. a <Show>
    // wrapping an <Index>/<For> whose `when` depends on the same list.
    if (getCompareValue) {
      const value = getCompareValue();

      // Skip first run - DOM is already hydrated
      if (isFirstRun) {
        isFirstRun = false;
        prevValue = value;
        return;
      }

      // Value unchanged — leave the existing subtree (and its fine-grained
      // reactivity) intact instead of re-rendering.
      if (Object.is(value, prevValue)) {
        return;
      }
      prevValue = value;

      const content = getContent();
      try {
        clearChildren(block);
        if (content != null) {
          block.children = renderBlockContent(
            content as SinwanNode,
            parent,
            endAnchor,
            null,
            owner,
          );
        } else {
          block.children = [];
        }
        fireMountedAndQueueUpdated(owner);
      } catch (e) {
        console.error("[Sinwan hydration reactive block]", e);
      }
      return;
    }

    // Calling getContent() reads reactive values, tracking dependencies
    const content = getContent();

    // Skip first run - DOM is already hydrated
    if (isFirstRun) {
      isFirstRun = false;
      return;
    }

    try {
      // Clear existing children DOM (between anchors)
      clearChildren(block);

      // Render new content between anchors
      if (content != null) {
        const newMounted = renderBlockContent(
          content as SinwanNode,
          parent,
          endAnchor,
          null,
          owner,
        );
        block.children = newMounted;
      } else {
        block.children = [];
      }

      fireMountedAndQueueUpdated(owner);
    } catch (e) {
      console.error("[Sinwan hydration reactive block]", e);
    }
  });

  block.dispose = disposeEffect;
  return block;
}
