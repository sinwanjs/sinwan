/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Child Rendering
 *
 * Renders SinwanNode children to DOM nodes. Handles primitives,
 * elements, arrays, signals, and fragments.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
  MountedAsync,
} from "./types.ts";
import { domOps } from "./dom-ops.ts";
import {
  isReactive,
  resolve,
  effect,
  type Signal,
  type Computed,
} from "../reactivity/index.ts";
import { renderElementToDOM } from "./render-element.ts";
import { HtmlEscapedString } from "../jsx/jsx-runtime.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
  fireMountedHooks,
  withInstance,
} from "../component/instance.ts";
import { removeMountedNode } from "./unmount.ts";
import { isTemplateResult, type SinwanTemplateResult } from "./template.ts";
import { getActiveSuspenseBoundary } from "./suspense-boundary.ts";

type PromiseRecord =
  | { status: "pending"; promise: PromiseLike<unknown> }
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: unknown };

const promiseRecords = new WeakMap<PromiseLike<unknown>, PromiseRecord>();

/**
 * Render a single SinwanNode to DOM and append to parent.
 * Returns the MountedNode descriptor for cleanup/unmount.
 */
export function renderNodeToDOM(
  node: SinwanNode,
  parent: Node,
  anchor: Node | null = null,
  namespace: string | null = null,
): MountedNode {
  // null/undefined/boolean → empty text node (placeholder)
  if (node == null || typeof node === "boolean") {
    const text = domOps.createTextNode("");
    insertNode(parent, text, anchor);
    return { type: "text", node: text };
  }

  // String
  if (typeof node === "string") {
    const text = domOps.createTextNode(node);
    insertNode(parent, text, anchor);
    return { type: "text", node: text };
  }

  // Number
  if (typeof node === "number") {
    const text = domOps.createTextNode(String(node));
    insertNode(parent, text, anchor);
    return { type: "text", node: text };
  }

  // Pre-escaped HTML string
  if (node instanceof HtmlEscapedString) {
    const text = domOps.createTextNode(node.value);
    insertNode(parent, text, anchor);
    return { type: "text", node: text };
  }

  // Compiler-generated template result
  if (isTemplateResult(node)) {
    return renderTemplateResultToDOM(node, parent, anchor);
  }

  // SinwanElement (common case)
  if (typeof node === "object" && node !== null && "tag" in node) {
    return renderElementToDOM(node as SinwanElement, parent, anchor, namespace);
  }

  // Reactive Node (Signal, Computed, or Function Getter)
  if (isReactive(node)) {
    return renderReactiveNodeToDOM(node as any, parent, anchor, namespace);
  }

  // Array → fragment
  if (Array.isArray(node)) {
    return renderArrayToDOM(node, parent, anchor, namespace);
  }

  // Promise → async node (placeholder + swap when resolved)
  if (node instanceof Promise) {
    const boundary = getActiveSuspenseBoundary();
    if (boundary) {
      const record = trackPromise(node);
      if (record.status === "fulfilled") {
        return renderNodeToDOM(
          record.value as SinwanNode,
          parent,
          anchor,
          namespace,
        );
      }
      if (record.status === "rejected") {
        throw record.reason;
      }
      throw record.promise;
    }

    const startAnchor = domOps.createComment("Sinwan-a");
    const endAnchor = domOps.createComment("/Sinwan-a");
    const placeholder = domOps.createTextNode("");
    insertNode(parent, startAnchor, anchor);
    insertNode(parent, placeholder, anchor);
    insertNode(parent, endAnchor, anchor);

    const mounted: MountedAsync = {
      type: "async",
      startAnchor,
      endAnchor,
      placeholder,
      children: [],
      disposed: false,
    };

    const owner = getCurrentInstance();

    node.then((resolved) => {
      if (mounted.disposed) return;
      const resolvedNode = owner
        ? withInstance(owner, () =>
            renderNodeToDOM(resolved, parent, endAnchor, namespace),
          )
        : renderNodeToDOM(resolved, parent, endAnchor, namespace);
      mounted.children = [resolvedNode];
      domOps.remove(placeholder);
      if (owner) fireMountedHooks(owner);
      queueUpdatedHooks(owner);
    });

    return mounted;
  }

  // Fallback — coerce to string
  const text = domOps.createTextNode(String(node));
  insertNode(parent, text, anchor);
  return { type: "text", node: text };
}

/**
 * Render a compiler-generated template result to DOM.
 */
function renderTemplateResultToDOM(
  result: SinwanTemplateResult,
  parent: Node,
  anchor: Node | null,
): MountedNode {
  const anchorComment = domOps.createComment("Sinwan-t");
  insertNode(parent, anchorComment, anchor);

  const children: MountedNode[] = [];
  const fragment = result.fragment;
  // Move all child nodes from fragment into parent (fragment is empty after this)
  while (fragment.firstChild) {
    const child = fragment.firstChild;
    parent.insertBefore(child, anchor);
    if (child instanceof Element) {
      children.push({
        type: "element",
        node: child,
        children: [],
        eventCleanups: null,
        attrDisposers: null,
        refCleanup: null,
      });
    } else {
      children.push({ type: "text", node: child as any });
    }
  }

  return {
    type: "fragment",
    children,
    anchor: anchorComment,
    disposers: result.disposers,
  };
}

/**
 * Render an array of children to DOM as a fragment.
 */
function renderArrayToDOM(
  nodes: SinwanNode[],
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedNode {
  const anchorComment = anchor ? domOps.createComment("Sinwan-f") : null;
  if (anchorComment) {
    insertNode(parent, anchorComment, anchor);
  }

  const children: MountedNode[] = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    children[i] = renderNodeToDOM(nodes[i]!, parent, anchor, namespace);
  }

  return { type: "fragment", children, anchor: anchorComment };
}

/**
 * Render multiple children into a parent element.
 * Returns array of MountedNode descriptors.
 */
export function renderChildrenToDOM(
  children: SinwanNode[],
  parent: Node,
  namespace: string | null = null,
): MountedNode[] {
  const mounted: MountedNode[] = new Array(children.length);
  for (let i = 0; i < children.length; i++) {
    mounted[i] = renderNodeToDOM(children[i]!, parent, null, namespace);
  }
  return mounted;
}

/**
 * Render a reactive node (Signal, Computed, or Function) that can resolve to any SinwanNode.
 * Uses comment anchors to allow swapping between different types of content (text, elements, etc.).
 */
function renderReactiveNodeToDOM(
  reactive: Signal<any> | Computed<any> | Function,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedNode {
  const startAnchor = domOps.createComment("Sinwan-r");
  const endAnchor = domOps.createComment("/Sinwan-r");
  insertNode(parent, startAnchor, anchor);
  insertNode(parent, endAnchor, anchor);

  const owner = getCurrentInstance();
  let mountedContent: MountedNode | null = null;
  let initialized = false;

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    startAnchor,
    endAnchor,
    children: [],
    dispose: () => {}, // placeholder
  };

  block.dispose = effect(() => {
    // 1. Cleanup previous content
    if (mountedContent) {
      removeMountedNode(mountedContent);
    }

    // 2. Resolve and render new content
    const value = resolve(reactive);
    mountedContent = renderNodeToDOM(
      value as SinwanNode,
      parent,
      endAnchor,
      namespace,
    );
    block.children = [mountedContent];

    // 3. Trigger lifecycle hooks
    if (initialized) {
      if (owner) fireMountedHooks(owner);
      queueUpdatedHooks(owner);
    }
    initialized = true;
  });

  return block;
}

function trackPromise(promise: PromiseLike<unknown>): PromiseRecord {
  const existing = promiseRecords.get(promise);
  if (existing) {
    return existing;
  }

  const record: PromiseRecord = { status: "pending", promise };
  promiseRecords.set(promise, record);

  promise.then(
    (value) => {
      promiseRecords.set(promise, { status: "fulfilled", value });
    },
    (reason) => {
      promiseRecords.set(promise, { status: "rejected", reason });
    },
  );

  return record;
}

/**
 * Insert a node into parent, optionally before an anchor.
 */
function insertNode(parent: Node, child: Node, anchor: Node | null): void {
  if (anchor) {
    domOps.insertBefore(parent, child, anchor);
  } else {
    domOps.appendChild(parent, child);
  }
}
