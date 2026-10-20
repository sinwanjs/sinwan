import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedPortal } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import {
  resolve,
  untrack,
  type CleanupFn,
} from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import { PORTAL_TYPE } from "../../const.ts";
import { Portal as PortalFactory } from "../../identity.ts";
import { registerControlFlowDirect } from "../../registry.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { insertNode } from "../../shared/insertNode.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
// Register For portal-order sync when Portal is loaded (tree-shaken otherwise).
import "../for/portal-sync-impl.ts";

export { isPortalElement, type PortalProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Portal: typeof PortalFactory = PortalFactory;

function noop(): void {}
noop();

/**
 * Resolve a portal mount target from a reactive `mount` value.
 */
export function resolvePortalTarget(value: unknown): Node | null {
  const target = resolve(value);

  if (target == null) {
    return typeof document === "undefined" ? null : document.body;
  }

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (typeof target === "function") {
    return target() as Node | null;
  }

  if (typeof target === "object" && "nodeType" in target) {
    return target as Node;
  }

  return null;
}

function clearPortalChildren(portal: MountedPortal): void {
  for (const child of portal.children) {
    removeMountedNode(child);
  }
  portal.children = [];
}

/**
 * Client render path for `<Portal>` — placeholder in tree, children in target.
 */
export function renderPortal(
  element: SinwanElement,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedPortal {
  const placeholder = domOps.createComment("Sinwan-p");
  insertNode(parent, placeholder, anchor);

  const owner = getCurrentInstance();
  let disposeEffect: CleanupFn = noop;

  const targetAnchor = domOps.createComment("Sinwan-pa");
  let lastTarget: Node | null | undefined;

  const portal: MountedPortal = {
    type: "portal",
    anchor: placeholder,
    children: [],
    dispose: () => disposeEffect(),
    targetAnchor,
  };
  let initialized = false;

  disposeEffect = effect(() => {
    const target = resolvePortalTarget(
      (element.props as { mount?: unknown }).mount,
    );
    const targetChanged = target !== lastTarget;

    if (targetChanged) {
      if (lastTarget) {
        domOps.remove(targetAnchor);
      }
      if (target) {
        domOps.appendChild(target, targetAnchor);
      }
      lastTarget = target;
      portal.target = target as Node;
      clearPortalChildren(portal);
      if (target) {
        portal.children = untrack(() =>
          renderBlockContent(
            (element.props as { children?: SinwanNode }).children ??
              (element.children as SinwanNode),
            target,
            targetAnchor,
            namespace,
            owner,
          ),
        );
      }
    }

    if (initialized && targetChanged) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });

  return portal;
}

registerControlFlowDirect(
  PORTAL_TYPE,
  renderPortal,
  Portal,
);
