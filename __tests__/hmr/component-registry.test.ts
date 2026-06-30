/**
 * Unit tests for the Fast Refresh component registry — the WeakMap chain that
 * maps a pre-edit component function to its latest hot-swapped version.
 */

import { describe, it, expect } from "bun:test";
import {
  replaceComponent,
  resolveLatestComponent,
  registerRefreshRoot,
  rerenderRefreshRoots,
} from "../../src/hmr/component-registry.ts";

describe("component-registry — resolveLatestComponent", () => {
  it("returns the same function when never replaced", () => {
    const fn = () => 1;
    expect(resolveLatestComponent(fn)).toBe(fn);
  });

  it("returns non-function values unchanged", () => {
    expect(resolveLatestComponent(42 as any)).toBe(42 as any);
    expect(resolveLatestComponent(null as any)).toBe(null as any);
    expect(resolveLatestComponent("x" as any)).toBe("x" as any);
  });

  it("resolves a single replacement", () => {
    const v1 = () => 1;
    const v2 = () => 2;
    replaceComponent(v1, v2);
    expect(resolveLatestComponent(v1)).toBe(v2);
    expect(resolveLatestComponent(v2)).toBe(v2);
  });

  it("follows a multi-step replacement chain (v1 -> v2 -> v3)", () => {
    const v1 = () => 1;
    const v2 = () => 2;
    const v3 = () => 3;
    replaceComponent(v1, v2);
    replaceComponent(v2, v3);
    expect(resolveLatestComponent(v1)).toBe(v3);
    expect(resolveLatestComponent(v2)).toBe(v3);
    expect(resolveLatestComponent(v3)).toBe(v3);
  });

  it("ignores no-op replacements (identical or non-function)", () => {
    const v1 = () => 1;
    replaceComponent(v1, v1);
    expect(resolveLatestComponent(v1)).toBe(v1);
    replaceComponent(v1, 5 as any);
    expect(resolveLatestComponent(v1)).toBe(v1);
  });

  it("is cycle-guarded (does not infinite-loop on a cycle)", () => {
    const a = () => "a";
    const b = () => "b";
    replaceComponent(a, b);
    replaceComponent(b, a); // introduce a cycle
    // Should terminate and return one of the two without hanging.
    const resolved = resolveLatestComponent(a);
    expect(resolved === a || resolved === b).toBe(true);
  });
});

describe("component-registry — refresh roots", () => {
  it("invokes registered root re-renders on rerenderRefreshRoots()", () => {
    let calls = 0;
    const dispose = registerRefreshRoot(() => {
      calls++;
    });
    rerenderRefreshRoots();
    expect(calls).toBe(1);
    rerenderRefreshRoots();
    expect(calls).toBe(2);
    dispose();
    rerenderRefreshRoots();
    expect(calls).toBe(2); // no longer called after dispose
  });

  it("isolates errors so one failing root does not block others", () => {
    let okCalls = 0;
    const disposeBad = registerRefreshRoot(() => {
      throw new Error("boom");
    });
    const disposeOk = registerRefreshRoot(() => {
      okCalls++;
    });
    expect(() => rerenderRefreshRoots()).not.toThrow();
    expect(okCalls).toBe(1);
    disposeBad();
    disposeOk();
  });
});
