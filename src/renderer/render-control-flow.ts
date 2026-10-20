/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Reactive control-flow blocks
 *
 * `<Show>` and `<For>` render between stable comment anchors. Updates remove,
 * move, or insert only the block-owned DOM nodes.
 *
 * Handlers are registered by each primitive's client module when that module
 * is imported — the renderer does not statically pull unused primitives.
 */

import type { SinwanElement } from "../types.ts";
import type { MountedNode, MountedReactiveBlock } from "./types.ts";
import { domOps } from "./dom-ops.ts";
import { type CleanupFn } from "../reactivity/index.ts";
import { getCurrentInstance } from "../component/instance.ts";
import {
  getControlFlowEntry,
  isControlFlowElement,
} from "../control-flow/registry.ts";
import { insertNode } from "../control-flow/shared/insertNode.ts";

export { clearChildren } from "../control-flow/shared/clearChildren.ts";
export { fireMountedAndQueueUpdated } from "../control-flow/shared/fireMountedAndQueueUpdated.ts";
export { renderBlockContent } from "../control-flow/shared/renderBlockContent.ts";
export { softHideMountedTree } from "../control-flow/shared/softHideMountedTree.ts";
export { softShowMountedTree } from "../control-flow/shared/softShowMountedTree.ts";
export {
  errorBoundaryStack,
  hasActiveErrorBoundary,
} from "../control-flow/components/error-boundary/stack.ts";

export { isControlFlowElement };

/** Shared no-op used for dispose stubs. */
function noop(): void {}
noop();

/**
 * Render a built-in reactive helper element via the control-flow registry.
 */
export function renderControlFlowToDOM(
  element: SinwanElement,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedNode {
  const entry = getControlFlowEntry(element.tag);
  if (!entry) {
    return { type: "fragment", children: [], anchor: null };
  }

  if (entry.mode === "direct") {
    return entry.render(element, parent, anchor, namespace);
  }

  const startAnchor = domOps.createComment("sinwan-b");
  const endAnchor = domOps.createComment("/sinwan-b");
  insertNode(parent, startAnchor, anchor);
  insertNode(parent, endAnchor, anchor);

  const owner = getCurrentInstance();
  let disposeEffect: CleanupFn = noop;

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => disposeEffect(),
    children: [],
    startAnchor,
    endAnchor,
  };

  disposeEffect = entry.render(element, block, parent, namespace, owner);
  return block;
}
