/**
 * SinwanJS Reactivity Utilities — Unit Tests
 *
 * Tests: untrack, on, observable
 */

import { describe, it, expect } from "bun:test";
import { signal } from "../src/reactivity/signal.ts";
import { effect } from "../src/reactivity/effect.ts";
import { untrack } from "../src/reactivity/effect.ts";
import { on } from "../src/reactivity/on.ts";
import { observable } from "../src/reactivity/observable.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";

// ─── untrack ───────────────────────────────────────────────

describe("untrack", () => {
  it("reads a signal without subscribing the active effect", async () => {
    const s = signal(0);
    let runCount = 0;

    effect(() => {
      untrack(() => s.value);
      runCount++;
    });

    expect(runCount).toBe(1);

    s.value = 1;
    await nextTick();
    expect(runCount).toBe(1); // did not re-run
  });

  it("returns the value from the untracked function", () => {
    const s = signal(42);
    const result = untrack(() => s.value);
    expect(result).toBe(42);
  });

  it("restores tracking after untrack block", async () => {
    const a = signal(0);
    const b = signal(0);
    let log: number[] = [];

    effect(() => {
      untrack(() => a.value);
      log.push(b.value);
    });

    log = [];

    a.value = 1;
    await nextTick();
    expect(log).toEqual([]); // a is untracked

    b.value = 1;
    await nextTick();
    expect(log).toEqual([1]); // b is tracked
  });

  it("works with nested effects", async () => {
    const s = signal(0);
    let outerRuns = 0;
    let innerRuns = 0;

    effect(() => {
      outerRuns++;
      untrack(() => {
        effect(() => {
          s.value;
          innerRuns++;
        });
      });
    });

    expect(outerRuns).toBe(1);
    expect(innerRuns).toBe(1);

    s.value = 1;
    await nextTick();
    expect(outerRuns).toBe(1); // outer not subscribed
    expect(innerRuns).toBe(2); // inner subscribed
  });
});

// ─── on ────────────────────────────────────────────────────

describe("on", () => {
  it("runs immediately with single dep by default", () => {
    const count = signal(0);
    const values: number[] = [];

    effect(
      on(
        () => count.value,
        (v) => {
          values.push(v);
        },
      ),
    );

    expect(values).toEqual([0]);
  });

  it("re-runs only when the tracked dep changes", async () => {
    const count = signal(0);
    const other = signal(0);
    const values: number[] = [];

    effect(
      on(
        () => count.value,
        (v) => {
          values.push(v);
        },
      ),
    );

    values.length = 0;

    other.value = 1;
    await nextTick();
    expect(values).toEqual([]); // other is not tracked

    count.value = 1;
    await nextTick();
    expect(values).toEqual([1]);
  });

  it("does not track reads inside the handler", async () => {
    const a = signal(0);
    const b = signal(0);
    const values: number[] = [];

    effect(
      on(
        () => a.value,
        (v) => {
          values.push(v + b.value);
        },
      ),
    );

    values.length = 0;

    b.value = 1;
    await nextTick();
    expect(values).toEqual([]); // b is inside untrack()

    a.value = 1;
    await nextTick();
    expect(values).toEqual([2]); // handler runs, reads b=1
  });

  it("supports array deps", async () => {
    const a = signal(1);
    const b = signal(2);
    const values: number[][] = [];

    effect(
      on([() => a.value, () => b.value], ([av, bv]) => {
        values.push([av, bv]);
      }),
    );

    expect(values).toEqual([[1, 2]]);
    values.length = 0;

    a.value = 10;
    await nextTick();
    expect(values).toEqual([[10, 2]]);

    b.value = 20;
    await nextTick();
    expect(values).toEqual([
      [10, 2],
      [10, 20],
    ]);
  });

  it("does not re-run when any array dep stays the same", async () => {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;

    effect(
      on([() => a.value, () => b.value], () => {
        runs++;
      }),
    );

    runs = 0;

    a.value = 1; // same value
    await nextTick();
    expect(runs).toBe(0);

    b.value = 2; // same value
    await nextTick();
    expect(runs).toBe(0);
  });

  it("defer: true skips initial run", () => {
    const count = signal(0);
    const values: number[] = [];

    effect(
      on(
        () => count.value,
        (v) => {
          values.push(v);
        },
        { defer: true },
      ),
    );

    expect(values).toEqual([]); // skipped initial

    count.value = 1;
    expect(values).toEqual([]); // not yet flushed
  });

  it("defer: true runs only on change", async () => {
    const count = signal(0);
    const values: number[] = [];

    effect(
      on(
        () => count.value,
        (v) => {
          values.push(v);
        },
        { defer: true },
      ),
    );

    count.value = 1;
    await nextTick();
    expect(values).toEqual([1]);

    count.value = 2;
    await nextTick();
    expect(values).toEqual([1, 2]);
  });

  it("passes previous input and previous value to handler", async () => {
    const count = signal(1);
    const log: Array<{ input: number; prevInput: number; prevValue?: number }> =
      [];

    const handler = on<() => number, number>(
      () => count.value,
      (input, prevInput, prevValue) => {
        log.push({ input, prevInput, prevValue });
        return input * 10;
      },
    );

    // Wrap in effect and pass previous value manually
    let prev: number | undefined;
    effect(() => {
      prev = handler(prev);
    });

    expect(log).toEqual([{ input: 1, prevInput: 1, prevValue: undefined }]);

    count.value = 2;
    await nextTick();
    expect(log).toEqual([
      { input: 1, prevInput: 1, prevValue: undefined },
      { input: 2, prevInput: 1, prevValue: 10 },
    ]);
  });

  it("works as a standalone wrapped function", () => {
    const a = signal(1);
    const b = signal(2);

    const wrapped = on(
      () => a.value,
      (av) => av + b.value,
    );
    expect(wrapped()).toBe(3);
  });
});

// ─── observable ──────────────────────────────────────────

describe("observable", () => {
  it("emits initial value on subscribe", () => {
    const s = signal(42);
    const values: number[] = [];

    const obs = observable(() => s.value);
    obs.subscribe((v) => values.push(v));

    expect(values).toEqual([42]);
  });

  it("emits on signal change", async () => {
    const s = signal(0);
    const values: number[] = [];

    const obs = observable(() => s.value);
    obs.subscribe((v) => values.push(v));

    values.length = 0;

    s.value = 1;
    await nextTick();
    expect(values).toEqual([1]);

    s.value = 2;
    await nextTick();
    expect(values).toEqual([1, 2]);
  });

  it("supports object observer with next", async () => {
    const s = signal(0);
    const values: number[] = [];

    const obs = observable(() => s.value);
    obs.subscribe({
      next(v) {
        values.push(v);
      },
    });

    values.length = 0;

    s.value = 5;
    await nextTick();
    expect(values).toEqual([5]);
  });

  it("supports multiple independent subscriptions", async () => {
    const s = signal(0);
    const a: number[] = [];
    const b: number[] = [];

    const obs = observable(() => s.value);
    obs.subscribe((v) => a.push(v));
    obs.subscribe((v) => b.push(v));

    a.length = 0;
    b.length = 0;

    s.value = 1;
    await nextTick();
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
  });

  it("unsubscribe stops emissions", async () => {
    const s = signal(0);
    const values: number[] = [];

    const obs = observable(() => s.value);
    const sub = obs.subscribe((v) => values.push(v));

    values.length = 0;

    s.value = 1;
    await nextTick();
    expect(values).toEqual([1]);

    sub.unsubscribe();

    s.value = 2;
    await nextTick();
    expect(values).toEqual([1]); // no more updates
  });

  it("returns self from [Symbol.observable]", () => {
    const s = signal(0);
    const obs = observable(() => s.value);

    const symbol =
      (typeof Symbol === "function" && (Symbol as any).observable) ||
      Symbol.for("observable");
    expect((obs as any)[symbol]()).toBe(obs);
  });

  it("emits correctly with computed source", async () => {
    const a = signal(2);
    const values: number[] = [];

    const obs = observable(() => a.value * 3);

    obs.subscribe((v) => values.push(v));
    expect(values).toEqual([6]);

    values.length = 0;
    a.value = 5;
    await nextTick();
    expect(values).toEqual([15]);
  });
});
