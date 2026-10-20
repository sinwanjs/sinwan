import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type { MountedReactiveBlock } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve } from "../../../reactivity/index.ts";
import { DYNAMIC_TYPE } from "../../const.ts";
import { Dynamic as DynamicFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { createDynamicElement } from "./element.ts";

export {
  isDynamicElement,
  type DynamicProps,
  type DynamicTag,
} from "../../identity.ts";
export { createDynamicElement } from "./element.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Dynamic: typeof DynamicFactory = DynamicFactory;

/**
 * Client render path for `<Dynamic>` — remounts when `component` identity changes.
 */
export function renderDynamicBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let hasTag = false;
  let currentTag: unknown;

  return effect(() => {
    const tag = resolve((element.props as { component?: unknown }).component);
    if (hasTag && Object.is(currentTag, tag)) {
      return;
    }

    currentTag = tag;
    hasTag = true;
    clearChildren(block);

    const content = tag ? createDynamicElement(element, tag) : null;
    block.children = renderBlockContent(
      content,
      parent,
      block.endAnchor,
      namespace,
      owner,
    );

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

registerControlFlowBlock(
  DYNAMIC_TYPE,
  renderDynamicBlock,
  Dynamic,
);
