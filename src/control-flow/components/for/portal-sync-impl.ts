/**
 * Portal-aware For reconcile helpers. Loaded only when Portal's client module
 * is imported (registers via `registerForPortalSync`).
 */

import type { MountedNode } from "../../../renderer/types.ts";
import { getMountedDomNodes } from "../../../renderer/unmount.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import { registerForPortalSync } from "./portal-sync.ts";

function containsPortal(mounted: MountedNode): boolean {
  switch (mounted.type) {
    case "portal":
      return true;
    case "component":
    case "element":
    case "fragment":
    case "reactive-block":
    case "async": {
      const children = mounted.children;
      for (let i = 0; i < children.length; i++) {
        if (containsPortal(children[i]!)) return true;
      }
      return false;
    }
    default:
      return false;
  }
}

function syncPortalOrder(mounted: MountedNode): void {
  if (mounted.type === "portal") {
    if (mounted.target && mounted.targetAnchor) {
      for (const child of mounted.children) {
        for (const node of getMountedDomNodes(child)) {
          domOps.appendChild(mounted.target, node);
        }
      }
      domOps.appendChild(mounted.target, mounted.targetAnchor);
    }
  } else if (
    "children" in mounted &&
    Array.isArray((mounted as { children?: MountedNode[] }).children)
  ) {
    const children = (mounted as { children: MountedNode[] }).children;
    for (let i = 0; i < children.length; i++) {
      syncPortalOrder(children[i]!);
    }
  }
}

/** Install portal walks into For (idempotent; safe to call from tests). */
export function installForPortalSync(): void {
  registerForPortalSync({ containsPortal, syncPortalOrder });
}

installForPortalSync();
