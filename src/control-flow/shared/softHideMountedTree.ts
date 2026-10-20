import { softHideInstance } from "../../component/instance.ts";
import type { MountedNode } from "../../renderer/types.ts";

/** Soft-hide a mounted tree (Activity / Key). Recurses into children. */
export function softHideMountedTree(node: MountedNode): void {
  switch (node.type) {
    case "component":
      if (node.instance) softHideInstance(node.instance);
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "element":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "fragment":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "reactive-block":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "async":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "portal":
      for (const child of node.children) softHideMountedTree(child);
      break;
    default:
      break;
  }
}
