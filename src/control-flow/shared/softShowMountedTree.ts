import { softShowInstance } from "../../component/instance.ts";
import type { MountedNode } from "../../renderer/types.ts";

/** Soft-show a mounted tree (Activity / Key). Recurses into children. */
export function softShowMountedTree(node: MountedNode): void {
  switch (node.type) {
    case "component":
      if (node.instance) softShowInstance(node.instance);
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "element":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "fragment":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "reactive-block":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "async":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "portal":
      for (const child of node.children) softShowMountedTree(child);
      break;
    default:
      break;
  }
}
