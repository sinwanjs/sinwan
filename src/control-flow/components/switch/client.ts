import type { SinwanElement } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type { MountedReactiveBlock } from "../../../renderer/types.ts";
import { effect, untrack } from "../../../reactivity/effect.ts";
import { SWITCH_TYPE } from "../../const.ts";
import { Switch as SwitchFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";
import {
  isControlFlowResult,
  selectSwitchBranch,
  type ExpandComponent,
  type SwitchBranch,
} from "./resolve.ts";
import { setupComponentElement } from "../../../renderer/render-element.ts";
import { warnObjectWhenRebuild } from "../../shared/warnObjectWhenRebuild.ts";

export { isSwitchElement, type SwitchProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Switch: typeof SwitchFactory = SwitchFactory;
export { resolveSwitchContent, findTruthyMatch } from "./resolve.ts";

/** A probed component child that is not a Match wrapper. */
const PLAIN: unique symbol = Symbol("switch-plain-component");

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
  let previous: SwitchBranch | null = null;
  // Component children, probed once: the Match a wrapper returned, or PLAIN
  // for a component that is a branch itself (rendered normally from then on).
  const probed = new WeakMap<SinwanElement, SinwanElement | typeof PLAIN>();
  const expand: ExpandComponent = (child) => {
    const known = probed.get(child);
    if (known === PLAIN) return child;
    if (known) return known;
    const setup = setupComponentElement(child);
    if (!setup) return child;
    if (isControlFlowResult(setup.result)) {
      setup.discard();
      probed.set(child, setup.result);
      return setup.result;
    }
    probed.set(child, PLAIN);
    return setup.element;
  };

  return effect(() => {
    // Select tracked (the `when` reads), then build untracked: reads inside
    // the selected content must not re-run the Switch.
    const branch = withOptionalInstance(owner, () =>
      selectSwitchBranch(element, expand),
    );
    if (
      previous &&
      Object.is(previous.key, branch.key) &&
      Object.is(previous.value, branch.value)
    ) {
      return;
    }
    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      previous &&
      Object.is(previous.key, branch.key)
    ) {
      warnObjectWhenRebuild(
        "Match",
        previous.value,
        branch.value,
        branch.usesValue,
        owner,
      );
    }
    previous = branch;

    clearChildren(block);

    const host = hostOf(parent, block.endAnchor);
    const content = untrack(() => withOptionalInstance(owner, branch.build));
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
