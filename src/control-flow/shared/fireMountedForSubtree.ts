import { fireMountedHooks } from "../../component/instance.ts";
import type { MountedNode } from "../../renderer/types.ts";

/** Fire `onMounted` for a mounted subtree (components and nested children). */
export function fireMountedForSubtree(node: MountedNode): void {
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
