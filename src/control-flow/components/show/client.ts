import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type { MountedReactiveBlock } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve, untrack } from "../../../reactivity/index.ts";
import { SHOW_TYPE } from "../../const.ts";
import { Show as ShowFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";
import { resolveShowChildren } from "./resolve.ts";

export { isShowElement, type ShowProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Show: typeof ShowFactory = ShowFactory;
export { resolveShowChildren } from "./resolve.ts";

/**
 * Client render path for `<Show>` — skips re-render when `when` is unchanged.
 */
export function renderShowBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let prevWhen: unknown = undefined;

  return effect(() => {
    const when = resolve((element.props as { when?: unknown }).when);

    // Skip re-rendering if 'when' hasn't changed (optimization for large lists)
    if (initialized && Object.is(when, prevWhen)) {
      return;
    }
    prevWhen = when;

    clearChildren(block);
    const host = hostOf(parent, block.endAnchor);
    block.children = withOptionalInstance(owner, () =>
      untrack(() => {
        const content = when
          ? resolveShowChildren(element, when)
          : (element.props as { fallback?: SinwanNode }).fallback;
        return renderBlockContent(
          content,
          host,
          block.endAnchor,
          namespace,
          owner,
        );
      }),
    );

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

registerControlFlowBlock(
  SHOW_TYPE,
  renderShowBlock,
  Show,
);
