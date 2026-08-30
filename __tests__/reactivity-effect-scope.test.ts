/**
 * Effect scope — auto-registration of effects on an active scope.
 *
 * Bug: `effect()` created directly in a component body returned a dispose
 * function that was never captured, so the effect leaked across HMR hot-swaps
 * (firing once per accumulated version) and across unmounts. The fix
 * introduces an effect scope: when a scope is active, `effect()` auto-pushes
 * its dispose onto `scope.effects` so it is torn down with the scope.
 */

import { describe, it, expect, afterEach } from "bun:test";
import {
  effect,
  setActiveEffectScope,
  getActiveEffectScope,
  type EffectScope,
} from "../src/reactivity/effect.ts";
import { signal } from "../src/reactivity/signal.ts";
import { computed } from "../src/reactivity/computed.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";

describe("effect scope — setActiveEffectScope / getActiveEffectScope", () => {
  afterEach(() => {
    // Always clear the global scope so tests are isolated.
    setActiveEffectScope(null);
  });

  it("returns null when no scope has been set", () => {
    setActiveEffectScope(null);
    expect(getActiveEffectScope()).toBeNull();
  });

  it("setActiveEffectScope stores and returns the scope", () => {
    const scope: EffectScope = { effects: [] };
    const prev = setActiveEffectScope(scope);
    expect(prev).toBeNull();
    expect(getActiveEffectScope()).toBe(scope);
  });

  it("setActiveEffectScope returns the previous scope for restoration", () => {
    const a: EffectScope = { effects: [] };
    const b: EffectScope = { effects: [] };
    setActiveEffectScope(a);
    const prev = setActiveEffectScope(b);
    expect(prev).toBe(a);
    expect(getActiveEffectScope()).toBe(b);
    // restore
    expect(setActiveEffectScope(prev)).toBe(b);
    expect(getActiveEffectScope()).toBe(a);
  });

  it("restoring to null clears the active scope", () => {
    const scope: EffectScope = { effects: [] };
    setActiveEffectScope(scope);
    setActiveEffectScope(null);
    expect(getActiveEffectScope()).toBeNull();
  });
});

describe("effect scope — auto-registration", () => {
  afterEach(() => {
    setActiveEffectScope(null);
  });

  it("auto-registers the dispose on the active scope", async () => {
    const scope: EffectScope = { effects: [] };
    setActiveEffectScope(scope);

    const s = signal(0);
    let runs = 0;
    effect(() => {
      void s.value;
      runs++;
    });

    expect(scope.effects.length).toBe(1);
    expect(runs).toBe(1);

    // Mutating the signal re-runs the effect (still single instance).
    s.value = 1;
    await nextTick();
    expect(runs).toBe(2);

    // Disposing the scope tears down the effect.
    for (const dispose of scope.effects) dispose();
    s.value = 2;
    await nextTick();
    expect(runs).toBe(2); // no further runs after disposal
  });

  it("does NOT auto-register when no scope is active", () => {
    setActiveEffectScope(null);
    const s = signal(0);
    const dispose = effect(() => {
      void s.value;
    });
    // Returned dispose is callable and stops the effect.
    expect(typeof dispose).toBe("function");
    dispose();
    // No throw on double dispose (idempotent).
    expect(() => dispose()).not.toThrow();
  });

  it("manual dispose is idempotent with scope dispose (double-dispose safe)", async () => {
    const scope: EffectScope = { effects: [] };
    setActiveEffectScope(scope);

    const s = signal(0);
    let runs = 0;
    const manualDispose = effect(() => {
      void s.value;
      runs++;
    });

    expect(scope.effects.length).toBe(1);
    // Caller manually disposes first.
    manualDispose();
    s.value = 1;
    await nextTick();
    expect(runs).toBe(1);

    // Scope disposal calls the same dispose again — must be a no-op.
    for (const dispose of scope.effects) dispose();
    s.value = 2;
    await nextTick();
    expect(runs).toBe(1);
  });

  it("multiple effects register independently on the same scope", async () => {
    const scope: EffectScope = { effects: [] };
    setActiveEffectScope(scope);

    const a = signal(0);
    const b = signal(0);
    let aRuns = 0;
    let bRuns = 0;
    effect(() => {
      void a.value;
      aRuns++;
    });
    effect(() => {
      void b.value;
      bRuns++;
    });

    expect(scope.effects.length).toBe(2);
    expect(aRuns).toBe(1);
    expect(bRuns).toBe(1);

    a.value = 10;
    await nextTick();
    expect(aRuns).toBe(2);
    expect(bRuns).toBe(1);

    // Dispose only the first effect via the scope.
    scope.effects[0]!();
    a.value = 20;
    await nextTick();
    expect(aRuns).toBe(2); // disposed, no further runs
    b.value = 20;
    await nextTick();
    expect(bRuns).toBe(2); // still alive
  });

  it("effects created via ReactiveEffect directly (computed) are not affected", () => {
    // computed uses `new ReactiveEffect()` directly, not effect(), so it must
    // not push onto the scope. Verified indirectly: scope stays empty when
    // only a computed is read inside an active scope.
    const scope: EffectScope = { effects: [] };
    setActiveEffectScope(scope);

    // Importing computed here to keep the test self-contained.
    // (computed is not auto-registered because it does not call effect().)
    const s = signal(2);
    const doubled = computed(() => s.value * 2);
    expect(doubled.value).toBe(4);
    expect(scope.effects.length).toBe(0);
  });
});
