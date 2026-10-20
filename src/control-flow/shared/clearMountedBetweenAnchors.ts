import type { MountedNode, MountedReactiveBlock } from "../../renderer/types.ts";
import { removeMountedNode, unmountNode } from "../../renderer/unmount.ts";

/**
 * Batch-clear mounted children between a reactive block's anchors.
 * Small lists keep per-node remove; large lists use Range.deleteContents
 * then logical unmount only (no second DOM remove).
 */
export function clearMountedBetweenAnchors(
  block: MountedReactiveBlock,
  children: MountedNode[],
): void {
  if (children.length === 0) return;
  if (children.length <= 4) {
    for (const child of children) {
      removeMountedNode(child);
    }
    return;
  }

  const parent = block.startAnchor.parentNode;
  if (parent && block.startAnchor.nextSibling !== block.endAnchor) {
    const range = document.createRange();
    range.setStartAfter(block.startAnchor);
    range.setEndBefore(block.endAnchor);
    range.deleteContents();
  }
  for (const child of children) {
    unmountNode(child);
  }
}
