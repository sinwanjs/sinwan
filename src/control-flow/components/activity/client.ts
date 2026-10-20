import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
    MountedElement,
    MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { renderElementToDOM } from "../../../renderer/render-element.ts";
import { ACTIVITY_TYPE } from "../../const.ts";
import { Activity as ActivityFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import {
    createActivityWrapperElement,
    isActivityHidden,
} from "../../shared/createActivityWrapperElement.ts";
import { softHideMountedTree } from "../../shared/softHideMountedTree.ts";
import { softShowMountedTree } from "../../shared/softShowMountedTree.ts";

export {
    isActivityElement,
    type ActivityMode,
    type ActivityProps,
} from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Activity: typeof ActivityFactory = ActivityFactory;

/**
 * Client render path for `<Activity>` — mounts a wrapper and soft-hides/shows
 * on `mode` changes without remounting children.
 */
export function renderActivityBlock(
    element: SinwanElement,
    block: MountedReactiveBlock,
    parent: Node,
    namespace: string | null,
    _owner: ComponentInstance | null,
): () => void {
    let initialized = false;
    let wrapperMounted: MountedElement | null = null;
    let wasHidden = false;

    return effect(() => {
        const hidden = isActivityHidden(element);

        if (!initialized) {
            const wrapperEl = createActivityWrapperElement(element);

            wrapperMounted = renderElementToDOM(
                wrapperEl,
                parent,
                block.endAnchor,
                namespace,
            ) as MountedElement;

            block.children = [wrapperMounted];

            if (hidden) {
                softHideMountedTree(wrapperMounted);
            }

            initialized = true;
            wasHidden = hidden;
            return;
        }

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
    });
}

registerControlFlowBlock(
    ACTIVITY_TYPE,
    renderActivityBlock,
    Activity,
);
