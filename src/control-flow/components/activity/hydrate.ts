import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedElement, MountedNode } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve } from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import {
  advance,
  createHydrationReactiveBlock,
  hydrateContent,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { softHideMountedTree } from "../../shared/softHideMountedTree.ts";
import { softShowMountedTree } from "../../shared/softShowMountedTree.ts";

/**
 * Hydrate an `<Activity>` boundary from existing SSR DOM.
 * Attaches reactive mode toggles without remounting children.
 */
export function hydrateActivity(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    mode?: unknown;
    children?: SinwanNode;
  };
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("sinwan-b");
  const endAnchor = document.createComment("/sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    [],
  );

  let initialized = false;
  let wasHidden = false;
  let wrapperMounted: MountedElement | null = null;

  const dispose = effect(() => {
    const currentMode = resolve(props.mode) ?? "visible";
    const hidden = currentMode === "hidden";

    if (initialized) {
      if (hidden !== wasHidden && wrapperMounted) {
        const wrapper = wrapperMounted.node as HTMLElement;
        wrapper.setAttribute(
          "data-sinwan-activity",
          hidden ? "hidden" : "visible",
        );
        if (hidden) {
          wrapper.setAttribute("hidden", "");
          wrapper.style.display = "none";
          softHideMountedTree(wrapperMounted);
        } else {
          wrapper.removeAttribute("hidden");
          wrapper.style.display = "";
          softShowMountedTree(wrapperMounted);
        }
        wasHidden = hidden;
      }
      fireMountedAndQueueUpdated(owner);
      return;
    }

    // Hydrate the wrapper element from DOM
    const wrapper = advance(cursor) as HTMLElement;
    if (wrapper && wrapper.nodeType === 1) {
      const itemCursor: HydrationCursor = {
        parent: wrapper,
        current: wrapper.firstChild,
        adapter: cursor.adapter,
      };
      const child = hydrateContent(props.children, itemCursor);

      wrapperMounted = {
        type: "element",
        node: wrapper,
        children: [child],
        eventCleanups: null,
        attrDisposers: null,
        refCleanup: null,
      };

      block.children = [wrapperMounted];

      if (hidden) {
        wrapper.style.display = "none";
        softHideMountedTree(wrapperMounted);
      }
      wasHidden = hidden;
    }

    parent.insertBefore(endAnchor, cursor.current);
    initialized = true;
  });

  attachDispose(dispose);
  return block;
}
