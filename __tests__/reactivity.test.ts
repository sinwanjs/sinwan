/**
 * SinwanJS Reactivity Core — Unit Tests
 *
 * Tests: signal, computed, effect, batch, scheduler (nextTick).
 * Run with: bun test src/client/reactivity/__tests__/reactivity.test.ts
 */

import { describe, it, expect, spyOn } from "bun:test";
import { signal, isSignal } from "../src/reactivity/signal.ts";
import { computed, isComputed } from "../src/reactivity/computed.ts";
import { effect, untrack, getActiveEffect } from "../src/reactivity/effect.ts";
import { batch, isBatching } from "../src/reactivity/batch.ts";
import {
  nextTick,
  isFlushingEffects,
} from "../src/reactivity/scheduler.ts";

// ─── Signal ────────────────────────────────────────────────

describe("signal", () => {
  it("holds an initial value", () => {
    const s = signal(42);
    expect(s.value).toBe(42);
  });

  it("updates on write", () => {
    const s = signal("hello");
    s.value = "world";
    expect(s.value).toBe("world");
  });

  it("peek() reads without tracking", () => {
    const s = signal(10);
    let tracked = false;

    effect(() => {
      // Use peek — should NOT re-run when s changes
      s.peek();
      tracked = true;
    });

    tracked = false;
    s.value = 20;

    // Wait for microtask flush
    return nextTick().then(() => {
      expect(tracked).toBe(false);
    });
  });

  it("skips update if value is the same (Object.is)", () => {
    const s = signal(5);
    let runCount = 0;

    effect(() => {
      void s.value;
      runCount++;
    });

    expect(runCount).toBe(1); // initial run

    s.value = 5; // same value — no trigger
    return nextTick().then(() => {
      expect(runCount).toBe(1);
    });
  });

  it("isSignal() type guard works", () => {
    const s = signal(0);
    expect(isSignal(s)).toBe(true);
    expect(isSignal(42)).toBe(false);
    expect(isSignal(null)).toBe(false);
    expect(isSignal({ value: 1 })).toBe(false);
  });

  it("subscribe() for manual callbacks", () => {
    const s = signal(0);
    const values: number[] = [];

    const unsub = s.subscribe((v) => values.push(v));
    s.value = 1;
    s.value = 2;

    expect(values).toEqual([1, 2]);

    unsub();
    s.value = 3;
    expect(values).toEqual([1, 2]); // no more notifications
  });

  it("toString() returns string representation", () => {
    const s = signal(123);
    expect(`${s}`).toBe("123");
  });

  it("valueOf() returns the current value", () => {
    const count = signal(3);
    expect(Number(count)).toBe(3);
  });
});

// ─── Effect ────────────────────────────────────────────────

describe("effect", () => {
  it("runs immediately on creation", () => {
    let ran = false;
    effect(() => {
      ran = true;
    });
    expect(ran).toBe(true);
  });

  it("re-runs when a tracked signal changes", async () => {
    const count = signal(0);
    const log: number[] = [];

    effect(() => {
      log.push(count.value);
    });

    expect(log).toEqual([0]);

    count.value = 1;
    await nextTick();
    expect(log).toEqual([0, 1]);

    count.value = 2;
    await nextTick();
    expect(log).toEqual([0, 1, 2]);
  });

  it("exposes the currently active effect", () => {
    expect(getActiveEffect()).toBeNull();
    let inner: ReturnType<typeof getActiveEffect> = null;
    effect(() => {
      inner = getActiveEffect();
    });
    expect(inner).not.toBeNull();
    expect(getActiveEffect()).toBeNull();
  });

  it("tracks multiple signals", async () => {
    const a = signal(1);
    const b = signal(2);
    const log: number[] = [];

    effect(() => {
      log.push(a.value + b.value);
    });

    expect(log).toEqual([3]);

    a.value = 10;
    await nextTick();
    expect(log).toEqual([3, 12]);

    b.value = 20;
    await nextTick();
    expect(log).toEqual([3, 12, 30]);
  });

  it("stops tracking after dispose", async () => {
    const s = signal(0);
    let runCount = 0;

    const dispose = effect(() => {
      void s.value;
      runCount++;
    });

    expect(runCount).toBe(1);

    dispose();
    s.value = 1;
    await nextTick();
    expect(runCount).toBe(1); // did not re-run
  });

  it("runs cleanup function on re-run", async () => {
    const s = signal(0);
    let cleanedUp = false;

    effect(() => {
      void s.value;
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);

    s.value = 1;
    await nextTick();
    expect(cleanedUp).toBe(true);
  });

  it("runs cleanup on dispose", () => {
    let cleanedUp = false;

    const dispose = effect(() => {
      return () => {
        cleanedUp = true;
      };
    });

    expect(cleanedUp).toBe(false);
    dispose();
    expect(cleanedUp).toBe(true);
  });

  it("handles dynamic dependencies (conditional branches)", async () => {
    const toggle = signal(true);
    const a = signal("A");
    const b = signal("B");
    const log: string[] = [];

    effect(() => {
      if (toggle.value) {
        log.push(a.value);
      } else {
        log.push(b.value);
      }
    });

    expect(log).toEqual(["A"]);

    // Changing b should NOT trigger (not tracked in current branch)
    b.value = "B2";
    await nextTick();
    expect(log).toEqual(["A"]);

    // Switch branch
    toggle.value = false;
    await nextTick();
    expect(log).toEqual(["A", "B2"]);

    // Now a should NOT trigger
    a.value = "A2";
    await nextTick();
    expect(log).toEqual(["A", "B2"]);

    // b should trigger
    b.value = "B3";
    await nextTick();
    expect(log).toEqual(["A", "B2", "B3"]);
  });
});

// ─── Computed ──────────────────────────────────────────────

describe("computed", () => {
  it("derives from a signal", () => {
    const count = signal(3);
    const doubled = computed(() => count.value * 2);

    expect(doubled.value).toBe(6);
  });

  it("updates when dependency changes", async () => {
    const count = signal(2);
    const doubled = computed(() => count.value * 2);

    expect(doubled.value).toBe(4);

    count.value = 5;
    await nextTick();
    expect(doubled.value).toBe(10);
  });

  it("chains with other computed values", async () => {
    const a = signal(1);
    const b = computed(() => a.value * 2);
    const c = computed(() => b.value + 10);

    expect(c.value).toBe(12);

    a.value = 5;
    await nextTick();
    expect(b.value).toBe(10);
    expect(c.value).toBe(20);
  });

  it("is trackable by effects", async () => {
    const count = signal(0);
    const doubled = computed(() => count.value * 2);
    const log: number[] = [];

    effect(() => {
      log.push(doubled.value);
    });

    expect(log).toEqual([0]);

    count.value = 3;
    await nextTick();
    expect(log).toEqual([0, 6]);
  });

  it("isComputed() type guard works", () => {
    const c = computed(() => 42);
    expect(isComputed(c)).toBe(true);
    expect(isComputed(signal(0))).toBe(false);
    expect(isComputed(null)).toBe(false);
  });

  it("peek() reads without tracking", () => {
    const count = signal(5);
    const doubled = computed(() => count.value * 2);

    expect(doubled.peek()).toBe(10);
  });

  it("toString() returns string representation", () => {
    const count = signal(7);
    const doubled = computed(() => count.value * 2);
    expect(`${doubled}`).toBe("14");
  });

  it("valueOf() returns numeric value", () => {
    const count = signal(3);
    const doubled = computed(() => count.value * 2);
    expect(Number(doubled)).toBe(6);
  });
});

// ─── Batch ─────────────────────────────────────────────────

describe("batch", () => {
  it("coalesces multiple signal writes into one effect run", async () => {
    const a = signal(1);
    const b = signal(2);
    let runCount = 0;

    effect(() => {
      void a.value;
      void b.value;
      runCount++;
    });

    expect(runCount).toBe(1);

    batch(() => {
      a.value = 10;
      b.value = 20;
    });

    // batch flushes synchronously at the end
    expect(runCount).toBe(2); // only ran once more
  });

  it("supports nested batches", async () => {
    const s = signal(0);
    let runCount = 0;

    effect(() => {
      void s.value;
      runCount++;
    });

    expect(runCount).toBe(1);

    batch(() => {
      s.value = 1;
      batch(() => {
        s.value = 2;
      });
      s.value = 3;
    });

    expect(runCount).toBe(2); // only one extra flush at outer batch end
  });

  it("re-throws errors from the callback", () => {
    expect(() =>
      batch(() => {
        throw new Error("batch boom");
      }),
    ).toThrow("batch boom");
  });

  it("isBatching() returns true inside batch", () => {
    let wasBatching = false;
    batch(() => {
      wasBatching = isBatching();
    });
    expect(wasBatching).toBe(true);
    expect(isBatching()).toBe(false);
  });
});

// ─── nextTick ──────────────────────────────────────────────

describe("nextTick", () => {
  it("resolves after pending effects", async () => {
    const s = signal(0);
    let effectRan = false;

    effect(() => {
      if (s.value > 0) effectRan = true;
    });

    s.value = 1;
    expect(effectRan).toBe(false); // not yet — microtask pending

    await nextTick();
    expect(effectRan).toBe(true);
  });

  it("accepts a callback", async () => {
    let called = false;
    await nextTick(() => {
      called = true;
    });
    expect(called).toBe(true);
  });
});

// ─── Integration ───────────────────────────────────────────

describe("integration", () => {
  it("full counter scenario", async () => {
    const count = signal(0);
    const doubled = computed(() => count.value * 2);
    const log: string[] = [];

    effect(() => {
      log.push(`count=${count.value}, doubled=${doubled.value}`);
    });

    expect(log).toEqual(["count=0, doubled=0"]);

    count.value++;
    await nextTick();
    expect(log).toEqual(["count=0, doubled=0", "count=1, doubled=2"]);

    batch(() => {
      count.value = 10;
      count.value = 20;
    });

    expect(log).toEqual([
      "count=0, doubled=0",
      "count=1, doubled=2",
      "count=20, doubled=40",
    ]);
  });
});

describe("reactive failure-mode contracts", () => {
  it("retains every subscription when dependency read order is reversed", async () => {
    const reversed = signal(false);
    const left = signal(1);
    const right = signal(10);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(
        reversed.value ? right.value + left.value : left.value + right.value,
      );
    });

    try {
      reversed.value = true;
      await nextTick();
      right.value = 20;
      await nextTick();
      left.value = 2;
      await nextTick();
      expect(values).toEqual([11, 11, 21, 22]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("keeps a shared computed dependency when an earlier branch dependency is pruned", () => {
    const includeExtra = signal(true);
    const extra = signal(10);
    const shared = signal(1);
    let evaluations = 0;
    const total = computed(() => {
      evaluations++;
      return (includeExtra.value ? extra.value : 0) + shared.value;
    });

    expect(total.value).toBe(11);
    includeExtra.value = false;
    expect(total.value).toBe(1);
    extra.value = 20;
    expect(total.value).toBe(1);
    expect(evaluations).toBe(2);
    shared.value = 2;
    expect(total.value).toBe(2);
    expect(evaluations).toBe(3);
  });

  it("retains a repeatedly read dependency after the number of reads shrinks", async () => {
    const repetitions = signal(3);
    const source = signal(2);
    const tail = signal(10);
    const values: number[] = [];
    const dispose = effect(() => {
      let sum = 0;
      const count = repetitions.value;
      for (let i = 0; i < count; i++) sum += source.value;
      values.push(sum + tail.value);
    });

    try {
      repetitions.value = 1;
      await nextTick();
      source.value = 3;
      await nextTick();
      tail.value = 20;
      await nextTick();
      expect(values).toEqual([16, 12, 13, 23]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("refreshes a computed synchronously and caches between invalidations", () => {
    const source = signal(1);
    let evaluations = 0;
    const doubled = computed(() => {
      evaluations++;
      return source.value * 2;
    });

    expect(doubled.value).toBe(2);
    expect(evaluations).toBe(1);
    source.value = 2;
    source.value = 3;
    expect(evaluations).toBe(1);
    expect(doubled.value).toBe(6);
    expect(doubled.peek()).toBe(6);
    expect(doubled.value).toBe(6);
    expect(evaluations).toBe(2);
    source.value = 4;
    expect(doubled.peek()).toBe(8);
    expect(doubled.value).toBe(8);
    expect(evaluations).toBe(3);
  });

  it("reads a fresh diamond inside nested batches without exposing intermediate values to effects", async () => {
    const source = signal(1);
    const doubled = computed(() => source.value * 2);
    const tripled = computed(() => source.value * 3);
    const total = computed(() => doubled.value + tripled.value);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(total.value);
    });

    try {
      batch(() => {
        source.value = 2;
        expect(total.value).toBe(10);
        batch(() => {
          source.value = 3;
          expect(total.peek()).toBe(15);
        });
        expect(values).toEqual([5]);
        source.value = 4;
        expect(total.value).toBe(20);
      });
      expect(values).toEqual([5, 20]);
      await nextTick();
      expect(values).toEqual([5, 20]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("does not subscribe an effect to a dirty computed read through peek", async () => {
    const source = signal(1);
    const rerun = signal(0);
    const doubled = computed(() => source.value * 2);
    source.value = 2;
    const values: number[] = [];
    const dispose = effect(() => {
      void rerun.value;
      values.push(doubled.peek());
    });

    try {
      source.value = 3;
      await nextTick();
      expect(values).toEqual([4]);
      rerun.value = 1;
      await nextTick();
      expect(values).toEqual([4, 6]);
      source.value = 4;
      await nextTick();
      expect(values).toEqual([4, 6]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("suppresses repeated NaN writes for both reactive and manual subscribers", async () => {
    const source = signal(NaN);
    const reactiveValues: number[] = [];
    const manualValues: number[] = [];
    const dispose = effect(() => {
      reactiveValues.push(source.value);
    });
    const unsubscribe = source.subscribe((value) => {
      manualValues.push(value);
    });

    try {
      source.value = NaN;
      await nextTick();
      expect(reactiveValues).toEqual([NaN]);
      expect(manualValues).toEqual([]);
      source.value = 1;
      await nextTick();
      source.value = NaN;
      await nextTick();
      source.value = NaN;
      await nextTick();
      expect(reactiveValues).toEqual([NaN, 1, NaN]);
      expect(manualValues).toEqual([1, NaN]);
    } finally {
      unsubscribe();
      dispose();
      await nextTick();
    }
  });

  it("distinguishes signed zero through computed values and manual subscriptions", async () => {
    const source = signal(0);
    const reciprocal = computed(() => 1 / source.value);
    const values: number[] = [];
    const manualValues: number[] = [];
    const dispose = effect(() => {
      values.push(reciprocal.value);
    });
    const unsubscribe = source.subscribe((value) => {
      manualValues.push(1 / value);
    });

    try {
      source.value = -0;
      await nextTick();
      expect(Object.is(source.value, -0)).toBe(true);
      source.value = -0;
      await nextTick();
      source.value = 0;
      await nextTick();
      expect(values).toEqual([Infinity, -Infinity, Infinity]);
      expect(manualValues).toEqual([-Infinity, Infinity]);
    } finally {
      unsubscribe();
      dispose();
      await nextTick();
    }
  });

  it("rethrows falsy batch exceptions unchanged while flushing writes and restoring batching", async () => {
    const source = signal(0);
    const values: number[] = [];
    const dispose = effect(() => {
      values.push(source.value);
    });
    const thrownValues: unknown[] = [undefined, null, false, 0, "", NaN];
    const caughtValues: unknown[] = [];

    try {
      for (const thrown of thrownValues) {
        try {
          batch(() => {
            source.value = source.peek() + 1;
            throw thrown;
          });
        } catch (error: unknown) {
          caughtValues.push(error);
        }
        expect(isBatching()).toBe(false);
      }
      expect(values).toEqual([0, 1, 2, 3, 4, 5, 6]);
      source.value = 7;
      await nextTick();
      expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(caughtValues).toEqual(thrownValues);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("defers writes from a caught nested batch error until the outer batch ends", async () => {
    const source = signal(0);
    const values: number[] = [];
    const failure = new Error("nested batch failure");
    const dispose = effect(() => {
      values.push(source.value);
    });

    try {
      const result = batch(() => {
        source.value = 1;
        let caught: unknown;
        try {
          batch(() => {
            source.value = 2;
            throw failure;
          });
        } catch (error: unknown) {
          caught = error;
        }
        expect(caught).toBe(failure);
        expect(isBatching()).toBe(true);
        expect(values).toEqual([0]);
        source.value = 3;
        return "finished";
      });
      expect(result).toBe("finished");
      expect(isBatching()).toBe(false);
      expect(values).toEqual([0, 3]);
      await nextTick();
      expect(values).toEqual([0, 3]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("restores both untrack layers and the enclosing effect after an exception", async () => {
    const ignored = signal(0);
    const alsoIgnored = signal(0);
    const tracked = signal(0);
    const failure = new Error("untrack failure");
    const values: number[] = [];
    const caughtValues: unknown[] = [];
    const dispose = effect(() => {
      untrack(() => {
        try {
          untrack(() => {
            void ignored.value;
            throw failure;
          });
        } catch (error: unknown) {
          caughtValues.push(error);
        }
        void alsoIgnored.value;
      });
      values.push(tracked.value);
    });

    try {
      ignored.value = 1;
      alsoIgnored.value = 1;
      await nextTick();
      expect(values).toEqual([0]);
      tracked.value = 1;
      await nextTick();
      expect(values).toEqual([0, 1]);
      expect(caughtValues).toEqual([failure, failure]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("retries a throwing computed read without caching failure or losing enclosing dependencies", async () => {
    const source = signal(1);
    const tail = signal(0);
    const failure = new Error("computed failure");
    let shouldThrow = false;
    let evaluations = 0;
    const derived = computed(() => {
      evaluations++;
      const value = source.value;
      if (shouldThrow) throw failure;
      return value * 2;
    });
    const values: number[] = [];
    const caughtValues: unknown[] = [];
    const dispose = effect(() => {
      try {
        values.push(derived.value);
      } catch (error: unknown) {
        caughtValues.push(error);
      }
      void tail.value;
    });

    try {
      shouldThrow = true;
      source.value = 2;
      await nextTick();
      expect(caughtValues).toEqual([failure]);
      expect(() => derived.peek()).toThrow(failure);
      shouldThrow = false;
      expect(derived.value).toBe(4);
      expect(evaluations).toBe(4);
      tail.value = 1;
      await nextTick();
      source.value = 3;
      await nextTick();
      expect(values).toEqual([2, 4, 6]);
    } finally {
      shouldThrow = false;
      dispose();
      await nextTick();
    }
  });

  it("continues the flush after an effect throws and reruns it on a later write", async () => {
    const source = signal(0);
    const failure = new Error("scheduled effect failure");
    const values: number[] = [];
    const peerValues: number[] = [];
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const dispose = effect(() => {
      const value = source.value;
      if (value === 1) throw failure;
      values.push(value);
    });
    const disposePeer = effect(() => {
      peerValues.push(source.value);
    });

    try {
      source.value = 1;
      await nextTick();
      expect(peerValues).toEqual([0, 1]);
      expect(errors).toHaveBeenCalledWith(
        "[Sinwan] Effect flush error:",
        failure,
      );
      source.value = 2;
      await nextTick();
      expect(values).toEqual([0, 2]);
      expect(peerValues).toEqual([0, 1, 2]);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
      disposePeer();
      await nextTick();
      errors.mockRestore();
    }
  });

  it("continues a nested drain flush after a newly queued effect throws", async () => {
    const trigger = signal(0);
    const nested = signal(0);
    let throwOnNested = false;
    const failure = new Error("drain effect failure");
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const disposeNested = effect(() => {
      void nested.value;
      if (throwOnNested) throw failure;
    });
    const disposeTrigger = effect(() => {
      void trigger.value;
      if (trigger.value > 0) {
        throwOnNested = true;
        nested.value = 1;
      }
    });

    try {
      trigger.value = 1;
      await nextTick();
      expect(errors).toHaveBeenCalledWith(
        "[Sinwan] Effect flush error:",
        failure,
      );
    } finally {
      throwOnNested = false;
      disposeNested();
      disposeTrigger();
      await nextTick();
      errors.mockRestore();
    }
  });

  it("reports whether the scheduler is flushing effects", async () => {
    expect(isFlushingEffects()).toBe(false);
    const source = signal(0);
    let seenDuringFlush = false;
    const dispose = effect(() => {
      void source.value;
      if (source.value > 0) {
        seenDuringFlush = isFlushingEffects();
      }
    });

    try {
      source.value = 1;
      await nextTick();
      expect(seenDuringFlush).toBe(true);
      expect(isFlushingEffects()).toBe(false);
    } finally {
      dispose();
    }
  });

  it("recovers scheduling after a cleanup throws without blocking peer effects", async () => {
    const source = signal(0);
    const failure = new Error("cleanup failure");
    let shouldThrow = true;
    let observed = -1;
    const peerValues: number[] = [];
    const errors = spyOn(console, "error").mockImplementation(() => {});
    const dispose = effect(() => {
      observed = source.value;
      return () => {
        if (shouldThrow) {
          shouldThrow = false;
          throw failure;
        }
      };
    });
    const disposePeer = effect(() => {
      peerValues.push(source.value);
    });

    try {
      source.value = 1;
      await nextTick();
      expect(peerValues).toEqual([0, 1]);
      expect(errors).toHaveBeenCalledWith(
        "[Sinwan] Effect flush error:",
        failure,
      );
      source.value = 2;
      await nextTick();
      expect(observed).toBe(2);
      expect(peerValues).toEqual([0, 1, 2]);
      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      shouldThrow = false;
      dispose();
      disposePeer();
      await nextTick();
      errors.mockRestore();
    }
  });

  it("cleans up exactly once when disposed after invalidation but before its queued rerun", async () => {
    const source = signal(0);
    const events: string[] = [];
    const dispose = effect(() => {
      const value = source.value;
      events.push(`run:${value}`);
      return () => {
        events.push(`cleanup:${value}`);
      };
    });

    try {
      source.value = 1;
      await nextTick();
      source.value = 2;
      dispose();
      dispose();
      await nextTick();
      source.value = 3;
      await nextTick();
      expect(events).toEqual(["run:0", "cleanup:0", "run:1", "cleanup:1"]);
    } finally {
      dispose();
      await nextTick();
    }
  });

  it("does not run a queued sibling disposed by an earlier effect in the same flush", async () => {
    const source = signal(0);
    const events: string[] = [];
    let disposeSibling = () => {};
    const disposeFirst = effect(() => {
      if (source.value === 1) disposeSibling();
    });
    disposeSibling = effect(() => {
      events.push(`run:${source.value}`);
      return () => {
        events.push("cleanup");
      };
    });

    try {
      source.value = 1;
      await nextTick();
      source.value = 2;
      await nextTick();
      expect(events).toEqual(["run:0", "cleanup"]);
    } finally {
      disposeFirst();
      disposeSibling();
      await nextTick();
    }
  });

  it("restores outer dependency tracking after an effect synchronously flushes a nested batch", async () => {
    const source = signal(0);
    const forwarded = signal(0);
    const tail = signal(0);
    const innerValues: number[] = [];
    const outerValues: number[] = [];
    const disposeInner = effect(() => {
      innerValues.push(forwarded.value);
    });
    const disposeOuter = effect(() => {
      const value = source.value;
      batch(() => {
        forwarded.value = value;
      });
      outerValues.push(tail.value);
    });

    try {
      source.value = 1;
      await nextTick();
      tail.value = 1;
      await nextTick();
      forwarded.value = 2;
      await nextTick();
      expect(innerValues).toEqual([0, 1, 2]);
      expect(outerValues).toEqual([0, 0, 1]);
    } finally {
      disposeOuter();
      disposeInner();
      await nextTick();
    }
  });

  it("drains a finite cascade of newly scheduled effects before nextTick callbacks", async () => {
    const source = signal(0);
    const middle = signal(0);
    const end = signal(0);
    const values: number[] = [];
    const callbackValues: number[] = [];
    const disposeEnd = effect(() => {
      values.push(end.value);
    });
    const disposeMiddle = effect(() => {
      end.value = middle.value * 2;
    });
    const disposeSource = effect(() => {
      middle.value = source.value + 1;
    });

    try {
      await nextTick();
      values.length = 0;
      source.value = 3;
      await nextTick(() => {
        callbackValues.push(end.peek());
      });
      expect(values).toEqual([8]);
      expect(callbackValues).toEqual([8]);
      source.value = 4;
      await nextTick(() => {
        callbackValues.push(end.peek());
      });
      expect(values).toEqual([8, 10]);
      expect(callbackValues).toEqual([8, 10]);
    } finally {
      disposeSource();
      disposeMiddle();
      disposeEnd();
      await nextTick();
    }
  });
});
