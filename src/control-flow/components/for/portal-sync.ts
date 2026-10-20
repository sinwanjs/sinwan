/**
 * Optional For↔Portal order sync. Portal-free apps never import the real
 * implementations; stubs keep reconcile cheap and tree-shakeable.
 */

import type { MountedNode } from "../../../renderer/types.ts";

export type ForPortalSync = {
  containsPortal: (mounted: MountedNode) => boolean;
  syncPortalOrder: (mounted: MountedNode) => void;
};

function stubContainsPortal(_mounted: MountedNode): boolean {
  return false;
}

function stubSyncPortalOrder(_mounted: MountedNode): void {}

const stub: ForPortalSync = {
  containsPortal: stubContainsPortal,
  syncPortalOrder: stubSyncPortalOrder,
};

let active: ForPortalSync = stub;

/** Register real portal walks (called from portal/client on import). */
export function registerForPortalSync(api: ForPortalSync): () => void {
  const previous = active;
  active = api;
  return () => {
    active = previous;
  };
}

export function containsPortal(mounted: MountedNode): boolean {
  return active.containsPortal(mounted);
}

export function syncPortalOrder(mounted: MountedNode): void {
  active.syncPortalOrder(mounted);
}

/** Test helper: reset to portal-free stubs. */
export function __resetForPortalSyncForTests(): void {
  active = stub;
}
