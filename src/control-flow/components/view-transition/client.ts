import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedElement,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { renderElementToDOM } from "../../../renderer/render-element.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import { VIEW_TRANSITION_TYPE } from "../../const.ts";
import { ViewTransition as ViewTransitionFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { createViewTransitionWrapperElement } from "../../shared/createViewTransitionWrapperElement.ts";
import { normalizeContent } from "../../shared/normalizeContent.ts";

export {
  isViewTransitionElement,
  type ViewTransitionProps,
} from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const ViewTransition: typeof ViewTransitionFactory = ViewTransitionFactory;

/**
 * Client render path for `<ViewTransition>`.
 */
export function renderViewTransitionBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  _owner: ComponentInstance | null,
): () => void {
  const props = element.props as {
    name?: string;
    children?: SinwanNode;
  };
  const wrapperEl = createViewTransitionWrapperElement(element);

  if (!wrapperEl) {
    const children = normalizeContent(props.children);
    for (const child of children) {
      block.children.push(
        renderNodeToDOM(child, parent, block.endAnchor, namespace),
      );
    }
    return () => {
      for (const child of block.children) {
        removeMountedNode(child);
      }
    };
  }

  const mounted = renderElementToDOM(
    wrapperEl,
    parent,
    block.endAnchor,
    namespace,
  ) as MountedElement;
  block.children = [mounted];

  return () => removeMountedNode(mounted);
}

registerControlFlowBlock(
  VIEW_TRANSITION_TYPE,
  renderViewTransitionBlock,
  ViewTransition,
);
