import { describe, it, expect, afterAll } from "bun:test";
import {
  containsPortal,
  syncPortalOrder,
  registerForPortalSync,
  __resetForPortalSyncForTests,
} from "../src/control-flow/components/for/portal-sync.ts";
import { installForPortalSync } from "../src/control-flow/components/for/portal-sync-impl.ts";
import type { MountedNode } from "../src/renderer/types.ts";

afterAll(() => {
  // Re-install real Portal walks for any later suites in the same process.
  installForPortalSync();
});

describe("For portal-sync stubs", () => {
  it("defaults to portal-free no-ops", () => {
    __resetForPortalSyncForTests();
    const node = {
      type: "element",
      node: {} as Element,
      children: [],
      eventCleanups: null,
      attrDisposers: null,
      refCleanup: null,
    } as MountedNode;
    expect(containsPortal(node)).toBe(false);
    syncPortalOrder(node);
  });

  it("registerForPortalSync swaps implementations and disposer restores", () => {
    __resetForPortalSyncForTests();
    let seen = false;
    const restore = registerForPortalSync({
      containsPortal: () => {
        seen = true;
        return true;
      },
      syncPortalOrder: () => {
        seen = true;
      },
    });
    const node = {
      type: "text",
      node: {} as Text,
    } as MountedNode;
    expect(containsPortal(node)).toBe(true);
    syncPortalOrder(node);
    expect(seen).toBe(true);
    restore();
    expect(containsPortal(node)).toBe(false);
  });
});
