import type { MountedReactiveBlock } from "../../renderer/types.ts";
import { clearMountedBetweenAnchors } from "./clearMountedBetweenAnchors.ts";

/** Clear and reset a reactive block's mounted children. */
export function clearChildren(block: MountedReactiveBlock): void {
  clearMountedBetweenAnchors(block, block.children);
  block.children = [];
}
