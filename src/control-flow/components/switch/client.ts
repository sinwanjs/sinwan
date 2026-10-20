import type { SinwanElement } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type { MountedReactiveBlock } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { SWITCH_TYPE } from "../../const.ts";
import { Switch as SwitchFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";
import { resolveSwitchContent } from "./resolve.ts";

export { isSwitchElement, type SwitchProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Switch: typeof SwitchFactory = SwitchFactory;
export { resolveSwitchContent, findTruthyMatch } from "./resolve.ts";

/**
 * Client render path for `<Switch>`.
 */
export function renderSwitchBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;

  return effect(() => {
    clearChildren(block);

    const host = hostOf(parent, block.endAnchor);
    const content = withOptionalInstance(owner, () =>
      resolveSwitchContent(element),
    );
    block.children = renderBlockContent(
      content,
      host,
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
  SWITCH_TYPE,
  renderSwitchBlock,
  Switch,
);
