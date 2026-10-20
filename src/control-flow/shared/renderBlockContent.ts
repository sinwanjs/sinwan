import type { SinwanNode } from "../../types.ts";
import type { ComponentInstance } from "../../component/instance.ts";
import type { MountedNode } from "../../renderer/types.ts";
import { renderNodeToDOM } from "../../renderer/render-children.ts";
import { withOptionalInstance } from "./withOptionalInstance.ts";

/** Mount block content (single node or array) under optional owner instance. */
export function renderBlockContent(
  content: SinwanNode,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
  owner: ComponentInstance | null,
): MountedNode[] {
  if (content == null || typeof content === "boolean") return [];

  return withOptionalInstance(owner, () => {
    if (Array.isArray(content)) {
      // replace map with for loop to avoid creating an intermediate array (critical for content rendering)
      const children: MountedNode[] = [];
      for (let i = 0; i < content.length; i++) {
        children.push(renderNodeToDOM(content[i], parent, anchor, namespace));
      }
      return children;
    }

    return [renderNodeToDOM(content, parent, anchor, namespace)];
  });
}
