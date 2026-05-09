/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Child Rendering
 *
 * Renders SinwanNode children to DOM nodes. Handles primitives,
 * elements, arrays, signals, and fragments.
 */

import type { SinwanNode } from "../types.ts";
import type { MountedNode, MountedReactiveBlock } from "./types.ts";
import { domOps } from "./dom-ops.ts";
import { isReactive, resolve, effect, type Signal, type Computed } from "../reactivity/index.ts";
import { renderElementToDOM } from "./render-element.ts";
import { HtmlEscapedString } from "../jsx/jsx-runtime.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
  fireMountedHooks,
} from "../component/instance.ts";
import { removeMountedNode } from "./unmount.ts";

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

  // Reactive Node (Signal, Computed, or Function Getter)
  if (isReactive(node)) {
    return renderReactiveNodeToDOM(node as any, parent, anchor, namespace);
  }

  // Array → fragment
  if (Array.isArray(node)) {
    return renderArrayToDOM(node, parent, anchor, namespace);
  }

  // Promise → placeholder (resolved async)
  if (node instanceof Promise) {
    const placeholder = domOps.createTextNode("");
    insertNode(parent, placeholder, anchor);
    // TODO: async component support (Phase 3+)
    node.then((resolved) => {
      const mounted = renderNodeToDOM(resolved, parent, placeholder, namespace);
      domOps.remove(placeholder);
    });
    return { type: "text", node: placeholder };
  }

  // SinwanElement
  if (typeof node === "object" && "tag" in node) {
    return renderElementToDOM(node, parent, anchor, namespace);
  }

  // Fallback — coerce to string
  const text = domOps.createTextNode(String(node));
  insertNode(parent, text, anchor);
  return { type: "text", node: text };
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
  const anchorComment = domOps.createComment("Sinwan-f");
  insertNode(parent, anchorComment, anchor);

  const children: MountedNode[] = [];
  for (const child of nodes) {
    children.push(renderNodeToDOM(child, parent, anchor, namespace));
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
  const mounted: MountedNode[] = [];
  for (const child of children) {
    mounted.push(renderNodeToDOM(child, parent, null, namespace));
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
    mountedContent = renderNodeToDOM(value as SinwanNode, parent, endAnchor, namespace);
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
