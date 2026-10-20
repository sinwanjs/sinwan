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
import { resolve, type CleanupFn, type Signal } from "../reactivity/index.ts";
import { isSignal } from "../reactivity/signal.ts";
import { STATE_GETTER_MARKER } from "../react/_internal/bridge.ts";
import { isComputed } from "../reactivity/computed.ts";
import { effect } from "../reactivity/effect.ts";
import { bindEvents, isEventProp } from "../renderer/events.ts";
import { setSingleAttribute } from "../renderer/attributes.ts";
import { HtmlEscapedString } from "../jsx/jsx-runtime.ts";
import {
  getActiveSuspenseBoundary,
} from "../renderer/suspense-boundary.ts";
import { clearChildren } from "../control-flow/shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../control-flow/shared/fireMountedAndQueueUpdated.ts";
import { renderBlockContent } from "../control-flow/shared/renderBlockContent.ts";
import { renderNodeToDOM } from "../renderer/render-children.ts";
import {
  isTemplateResult,
  isServerTemplateResult,
  isBindingDescriptor,
  setHydrationMode,
  _$createTemplate,
  walkToSlot,
  type SinwanTemplateResult,
  type SinwanServerTemplateResult,
} from "../renderer/template.ts";
import { applyRef } from "../renderer/render-element.ts";
import {
  removeMountedNode,
  getMountedDomNodes,
} from "../renderer/unmount.ts";
import type {
  MountedElement,
  MountedReactiveBlock,
} from "../renderer/types.ts";
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
  isErrorBoundaryElement,
  isSuspenseElement,
  isActivityElement,
  isViewTransitionElement,
  normalizeContent,
} from "../component/control-flow.ts";
import { hydrateActivity } from "../control-flow/components/activity/hydrate.ts";
import { hydrateDynamic } from "../control-flow/components/dynamic/hydrate.ts";
import { hydrateErrorBoundary } from "../control-flow/components/error-boundary/hydrate.ts";
import { hydrateFor } from "../control-flow/components/for/hydrate.ts";
import { hydrateIndex } from "../control-flow/components/index/hydrate.ts";
import { hydrateKey } from "../control-flow/components/key/hydrate.ts";
import { hydrateMatch } from "../control-flow/components/match/hydrate.ts";
import { hydratePortal } from "../control-flow/components/portal/hydrate.ts";
import { hydrateShow } from "../control-flow/components/show/hydrate.ts";
import { hydrateSuspense } from "../control-flow/components/suspense/hydrate.ts";
import { hydrateSwitch } from "../control-flow/components/switch/hydrate.ts";
import { hydrateViewTransition } from "../control-flow/components/view-transition/hydrate.ts";
import { hydrateVirtual } from "../control-flow/components/virtual/hydrate.ts";
import { expandVisibleForHydrate } from "../control-flow/components/visible/hydrate.ts";
import {
  DEFAULT_HYDRATION_ADAPTER,
  FUNCTION_MARKER_OPEN,
  FUNCTION_MARKER_CLOSE,
  type HydrationAdapter,
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
  /** Adapter used to parse hydration markers. */
  adapter: HydrationAdapter;
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

  // Binding descriptor (from explicitBindings mode in non-hoisted JSX).
  // Unwrap to the getter function — the function-getter path below handles it.
  if (isBindingDescriptor(node)) {
    return hydrateReactiveFunction((node as any).getter, cursor);
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

  // Compiler-generated template result — replace SSR nodes with live template
  // Compiler-generated template result (live fragment from CSR).
  if (isTemplateResult(node as unknown)) {
    return hydrateTemplateResult(
      node as unknown as SinwanTemplateResult,
      cursor,
    );
  }

  // Server template result (from hydration mode or SSR). Bind in-place to
  // the existing server-rendered DOM instead of creating + swapping.
  if (isServerTemplateResult(node as unknown)) {
    return hydrateServerTemplateResult(
      node as unknown as SinwanServerTemplateResult,
      cursor,
    );
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
    cursor.adapter.parseTextOpenMarker(openComment as Comment) >= 0
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
      cursor.adapter.isTextCloseMarker(closeComment as Comment)
    ) {
      advance(cursor);
      // Remove the SSR close marker now that the text node is bound.
      // The reactive effect below updates textNode.data directly, so the
      // marker is no longer needed as a DOM anchor.
      (closeComment as Comment).remove();
    }

    // Remove the SSR open marker too. The cursor has already advanced past
    // it and the text node is the only runtime anchor for this slot, so
    // removing the comment is safe and keeps the DOM clean post-hydration.
    (openComment as Comment).remove();

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

  // Last resort — create a new text node. `advance()` above already
  // consumed `cursor.current`, so this path only runs when the cursor is
  // exhausted and the new node must be appended.
  const newText = document.createTextNode(String(reactive.value));
  cursor.parent.appendChild(newText);

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
 * Hydrate a plain function getter (0-arity) that may return any SinwanNode.
 *
 * The server renders the resolved value directly. We hydrate the existing
 * DOM nodes, insert boundary anchors, and attach an effect so the whole
 * block is re-rendered when the function's signal dependencies change.
 */
function hydrateReactiveFunction(
  fn: Function,
  cursor: HydrationCursor,
): MountedNode {
  const owner = getCurrentInstance();
  const parent = cursor.parent;
  const firstNode = cursor.current;

  // If the server rendered function block markers, reuse them instead of
  // inserting our own. This avoids collapsing scalar function values into
  // adjacent text nodes during SSR.
  //
  // NOTE: The SSR <!--sinwan-r-->/<!--/sinwan-r--> markers are NOT removed
  // after hydration. They are reused as the startAnchor/endAnchor of the
  // MountedReactiveBlock, and the update effect relies on endAnchor to
  // insert replacement content (renderNodeToDOM(newValue, parent, endAnchor))
  // while removeMountedNode uses the anchors to find the node range. Removing
  // them would break the reactive update system. They stay as runtime anchors.
  const hasServerMarkers =
    firstNode &&
    firstNode.nodeType === 8 /* COMMENT_NODE */ &&
    cursor.adapter.isFunctionOpenMarker(firstNode as Comment);

  let startAnchor: Comment;
  if (hasServerMarkers) {
    startAnchor = firstNode as Comment;
    advance(cursor);
  } else {
    startAnchor = document.createComment(FUNCTION_MARKER_OPEN);
    if (firstNode) {
      parent.insertBefore(startAnchor, firstNode);
    } else {
      parent.appendChild(startAnchor);
    }
  }

  const initialValue = fn();

  // Hydrate the resolved content. Boolean/null values have no SSR nodes,
  // so create a placeholder text node that will be replaced on update.
  let mountedContent: MountedNode;
  if (initialValue == null || typeof initialValue === "boolean") {
    const placeholder = document.createTextNode("");
    if (!hasServerMarkers) {
      parent.insertBefore(placeholder, cursor.current);
    }
    mountedContent = { type: "text", node: placeholder };
  } else {
    mountedContent = hydrateNode(initialValue as SinwanNode, cursor);
  }

  // Resolve or insert the end anchor after the hydrated content.
  let endAnchor: Comment;
  if (hasServerMarkers) {
    const endMarker = cursor.current;
    if (
      endMarker &&
      endMarker.nodeType === 8 &&
      cursor.adapter.isFunctionCloseMarker(endMarker as Comment)
    ) {
      endAnchor = endMarker as Comment;
      advance(cursor);
    } else {
      // Fallback if the close marker is missing.
      endAnchor = document.createComment(FUNCTION_MARKER_CLOSE);
      const contentNodes = getMountedDomNodes(mountedContent);
      const lastNode = contentNodes[contentNodes.length - 1];
      if (lastNode && lastNode.nextSibling) {
        parent.insertBefore(endAnchor, lastNode.nextSibling);
      } else {
        parent.appendChild(endAnchor);
      }
    }
  } else {
    endAnchor = document.createComment(FUNCTION_MARKER_CLOSE);
    const contentNodes = getMountedDomNodes(mountedContent);
    const lastNode = contentNodes[contentNodes.length - 1];
    if (lastNode && lastNode.nextSibling) {
      parent.insertBefore(endAnchor, lastNode.nextSibling);
    } else {
      parent.appendChild(endAnchor);
    }
  }

  let currentMounted = mountedContent;

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    [mountedContent],
  );

  let initialized = false;
  attachDispose(
    effect(() => {
      const newValue = fn();
      if (!initialized) {
        initialized = true;
        return;
      }
      if (currentMounted) {
        removeMountedNode(currentMounted);
      }
      currentMounted = renderNodeToDOM(
        newValue as SinwanNode,
        parent,
        endAnchor,
        null,
      );
      block.children = [currentMounted];
      if (owner) fireMountedHooks(owner);
      queueUpdatedHooks(owner);
    }),
  );

  return block;
}

// ─── Template result hydration ────────────────────────────

/**
 * Hydrate a compiler-generated template result.
 *
 * `_$createTemplate` already built a live DOM fragment with events and
 * reactive effects bound. During hydration we simply swap the SSR-rendered
 * subtree for the live fragment so the component is immediately interactive.
 * The number of top-level nodes in the fragment determines how many SSR
 * nodes we consume from the cursor.
 */
function hydrateTemplateResult(
  result: SinwanTemplateResult,
  cursor: HydrationCursor,
): MountedNode {
  const parent = cursor.parent;
  const fragment = result.fragment;

  // Count top-level nodes in the template fragment
  const liveNodes: Node[] = [];
  let child = fragment.firstChild;
  while (child) {
    liveNodes.push(child);
    child = child.nextSibling;
  }

  // Insert a positioning anchor comment (mirrors renderTemplateResultToDOM)
  // so getMountedDomNodes / removeMountedNode track this fragment correctly.
  const anchorComment = document.createComment("sinwan-t");
  const insertBefore = cursor.current;
  if (insertBefore) {
    parent.insertBefore(anchorComment, insertBefore);
  } else {
    parent.appendChild(anchorComment);
  }

  // Replace SSR-rendered nodes 1-for-1 with live template nodes
  // (which already have events and reactive effects bound).
  for (let i = 0; i < liveNodes.length; i++) {
    const ssrNode = cursor.current;
    if (ssrNode) {
      advance(cursor);
      parent.replaceChild(liveNodes[i]!, ssrNode);
    } else {
      parent.insertBefore(liveNodes[i]!, null);
    }
  }

  const mountedChildren: MountedNode[] = liveNodes.map((n) => {
    if (n.nodeType === 1) {
      return {
        type: "element" as const,
        node: n as Element,
        children: [],
        eventCleanups: null,
        attrDisposers: null,
        refCleanup: null,
      };
    }
    return { type: "text" as const, node: n as Text };
  });

  return {
    type: "fragment" as const,
    children: mountedChildren,
    anchor: anchorComment,
    disposers: result.disposers,
  };
}

/**
 * Hydrate a server template result by binding effects/events to the EXISTING
 * server-rendered DOM (Phase B — true in-place hydration).
 *
 * For the common case of templates with only reactive text child slots (the
 * `Counter` pattern: `<div><p>Count: {count}</p></div>`), this finds the
 * `<!--sinwan-t:N-->` markers in the existing DOM and binds effects to the
 * text nodes between them — no DOM swap needed.
 *
 * For templates with attr/event slots or non-scalar child slots (components,
 * elements, arrays), the path-based slot resolution would require index
 * adjustment for expanded child markers, which is fragile. These cases fall
 * back to the swap-based `hydrateTemplateResult` approach.
 */
function hydrateServerTemplateResult(
  result: SinwanServerTemplateResult,
  cursor: HydrationCursor,
): MountedNode {
  const { def, dynamics } = result;
  const owner = getCurrentInstance();
  const root = cursor.current;

  // Phase B only handles the common case: all slots are child slots with
  // reactive scalar dynamics (signals/computed/getters/binding descriptors),
  // or ref slots (which don't affect DOM structure).
  // Anything else (attr, event, component children, element children) falls
  // back to the swap approach.
  const canInPlace = def.slots.every((slot) => {
    if (slot.type === "ref") return true;
    if (slot.type !== "child") return false;
    const value = dynamics[def.slots.indexOf(slot)];
    return (
      isSignal(value) ||
      isComputed(value) ||
      isBindingDescriptor(value) ||
      (typeof value === "function" && (value as any).length === 0) ||
      value == null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  });

  if (!canInPlace || !root || root.nodeType !== 1 /* ELEMENT_NODE */) {
    // Fall back: build a live fragment and swap. This requires temporarily
    // disabling hydration mode so _$createTemplate creates a real fragment.
    return swapHydrateTemplate(def, dynamics, cursor);
  }

  // In-place binding: find all <!--sinwan-t:N--> open markers in the root
  // element's subtree, in document order. Match them 1:1 with the child slots
  // (also in order, since SSR renders them sequentially).
  const disposers: CleanupFn[] = [];
  const textMarkers: Comment[] = [];
  collectTextOpenMarkers(root as Element, cursor.adapter, textMarkers);

  // If the SSR DOM doesn't have sinwan-t markers (e.g. plain pre-rendered HTML
  // without the SSR template serializer), fall back to swap.
  if (textMarkers.length === 0) {
    return swapHydrateTemplate(def, dynamics, cursor);
  }

  let markerIdx = 0;
  for (let i = 0; i < def.slots.length; i++) {
    const slot = def.slots[i]!;
    if (slot.type !== "child") continue;
    const value = dynamics[i];
    const marker = textMarkers[markerIdx++];

    if (!marker) continue;
    // The text node is the next sibling after the open marker.
    const textNode = marker.nextSibling;
    if (!textNode || textNode.nodeType !== 3 /* TEXT_NODE */) continue;

    // Create the effect that updates the text node when the reactive value
    // changes. This binds to the EXISTING text node — no swap.
    const getter = resolveChildGetter(value);
    if (typeof getter === "function") {
      const dispose = effect(() => {
        const resolved = getter();
        (textNode as Text).textContent =
          resolved == null ? "" : String(resolved);
      });
      disposers.push(dispose);
    }

    // Remove the SSR text markers now that the text node is bound. The
    // reactive effect above updates textNode.textContent directly, so the
    // open/close markers are no longer needed as DOM anchors. Only the
    // text node itself is retained as the runtime anchor.
    const closeMarker = textNode.nextSibling;
    if (
      closeMarker &&
      closeMarker.nodeType === 8 /* COMMENT_NODE */ &&
      cursor.adapter.isTextCloseMarker(closeMarker as Comment)
    ) {
      (closeMarker as Comment).remove();
    }
    marker.remove();
  }

  // Bind refs to the existing DOM elements (no DOM swap needed).
  let refCleanup: CleanupFn | null = null;
  for (let i = 0; i < def.slots.length; i++) {
    const slot = def.slots[i]!;
    if (slot.type !== "ref") continue;
    const value = dynamics[i];
    const target = walkToSlot(root as Node, slot.path, def);
    if (target instanceof Element) {
      refCleanup = applyRef(target, value);
    }
  }

  // Advance the cursor past the root element (single top-level node).
  advance(cursor);

  return {
    type: "element" as const,
    node: root as Element,
    children: [],
    eventCleanups: null,
    attrDisposers: disposers,
    refCleanup,
  };
}

/**
 * Fallback for templates that can't be hydrated in-place: temporarily disable
 * hydration mode, build a live fragment via _$createTemplate, and swap the SSR
 * nodes for the live fragment (the original Phase A behavior).
 */
function swapHydrateTemplate(
  def: import("../renderer/template-protocol.ts").TemplateDef,
  dynamics: unknown[],
  cursor: HydrationCursor,
): MountedNode {
  // Temporarily disable hydration mode so _$createTemplate builds a real
  // fragment, then swap the SSR nodes for the live fragment.
  setHydrationMode(false);
  try {
    const liveResult = _$createTemplate(def, dynamics);
    return hydrateTemplateResult(liveResult as SinwanTemplateResult, cursor);
  } finally {
    setHydrationMode(true);
  }
}

/** Resolve a child slot dynamic to a getter function, or null if not reactive. */
type UnknownGetter = { (): unknown };
function resolveChildGetter(value: unknown): UnknownGetter | null {
  if (isBindingDescriptor(value)) {
    return (value as { getter: UnknownGetter }).getter;
  }
  if (isSignal(value) || isComputed(value)) {
    return function readReactiveValue(): unknown {
      return (value as { value: unknown }).value;
    };
  }
  if (typeof value === "function" && (value as { length: number }).length === 0) {
    return value as UnknownGetter;
  }
  return null;
}

/** Collect all <!--sinwan-t:N--> open markers in an element's subtree, in order. */
function collectTextOpenMarkers(
  element: Element,
  adapter: HydrationCursor["adapter"],
  out: Comment[],
): void {
  for (const child of element.childNodes) {
    if (child.nodeType === 8 /* COMMENT_NODE */) {
      if (adapter.parseTextOpenMarker(child as Comment) >= 0) {
        out.push(child as Comment);
      }
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      collectTextOpenMarkers(child as Element, adapter, out);
    }
  }
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
    tag === Match ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal ||
    tag === Virtual
  ) {
    return hydrateElement((tag as Function)(props), cursor);
  }

  if (tag === Visible) {
    return hydrateElement(
      expandVisibleForHydrate({ tag, props, children: element.children }),
      cursor,
    );
  }

  if (isPortalElement(element)) {
    return hydratePortal(element, cursor);
  }

  if (
    isShowElement(element) ||
    isForElement(element) ||
    isSwitchElement(element) ||
    isMatchElement(element) ||
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
  el.removeAttribute(cursor.adapter.componentAttr);
  el.removeAttribute(cursor.adapter.eventAttr);

  // Attach reactive attributes (signals in props)
  const attrDisposers = hydrateAttributes(el, props);

  // Attach event handlers
  const eventCleanups = bindEvents(el, props);
  const refCleanup = applyRef(el, props.ref);

  // Hydrate children
  const childCursor: HydrationCursor = {
    parent: el,
    current: el.firstChild,
    adapter: cursor.adapter,
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

    if (
      isSignal(value) ||
      isComputed(value) ||
      (typeof value === "function" &&
        value.length === 0 &&
        !(STATE_GETTER_MARKER in value))
    ) {
      // Reactive attribute — needs an effect
      const state = { previousStyleProps: new Set<string>() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, resolve(value), state);
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
      });
      if (!disposers) disposers = [];
      disposers.push(dispose);
    } else if (isBindingDescriptor(value)) {
      // Binding descriptor (from explicitBindings mode) — unwrap to getter
      // and attach an effect, same as a reactive function attribute.
      const getter = (value as any).getter;
      const state = { previousStyleProps: new Set<string>() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, resolve(getter), state);
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

export function createHydrationReactiveBlock(
  startAnchor: Comment,
  endAnchor: Comment,
  children: MountedNode[],
): {
  block: MountedReactiveBlock;
  attachDispose: { (dispose: CleanupFn): void };
} {
  let disposeFn: CleanupFn | undefined;
  const block: MountedReactiveBlock = {
    type: "reactive-block",
    startAnchor,
    endAnchor,
    children,
    dispose: function disposeHydrationBlock() {
      if (disposeFn) {
        disposeFn();
      }
    },
  };
  return {
    block,
    attachDispose: function attachDispose(dispose: CleanupFn) {
      disposeFn = dispose;
    },
  };
}

function hydrateControlFlow(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  if (isShowElement(element)) {
    return hydrateShow(element, cursor);
  }

  if (isForElement(element)) {
    return hydrateFor(element, cursor);
  }

  if (isSwitchElement(element)) {
    return hydrateSwitch(element, cursor);
  }

  if (isMatchElement(element)) {
    return hydrateMatch(element, cursor);
  }

  if (isIndexElement(element)) {
    return hydrateIndex(element, cursor);
  }

  if (isKeyElement(element)) {
    return hydrateKey(element, cursor);
  }

  if (isDynamicElement(element)) {
    return hydrateDynamic(element, cursor);
  }

  if (isVirtualElement(element)) {
    return hydrateVirtual(element, cursor);
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

  return hydrateViewTransition(element, cursor);
}

export function hydrateContent(
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
  const anchor = document.createComment("sinwan-f");
  if (cursor.current) {
    cursor.parent.insertBefore(anchor, cursor.current);
  } else {
    cursor.parent.appendChild(anchor);
  }
  return { type: "fragment", children, anchor };
}

// ─── Control flow hydration helpers ────────────────────────

export function makeReactiveBlock(
  initialMounted: MountedNode,
  getContent: { (): SinwanNode | null },
  getCompareValue?: { (): unknown },
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

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    [initialMounted],
  );

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

  attachDispose(disposeEffect);
  return block;
}
