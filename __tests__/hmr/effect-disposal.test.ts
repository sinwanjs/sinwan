/**
 * Regression tests for HMR effect disposal — the core bug where `effect()`
 * called directly in a component body leaked across hot-swaps, so each HMR
 * edit added another live effect and a single state change logged N times
 * (once per accumulated version).
 *
 * Root cause: `effect()` returned a dispose function that component code
 * never captured, so the effect was never torn down on hot-swap / unmount.
 * Fix: an effect scope is active during component setup; `effect()` auto-
 * registers its dispose on `instance.effects`, which `softHideInstance`
 * disposes during hot-swap.
 *
 * These tests also guard the inverse: renderer-internal DOM-binding effects
 * (reactive text/attribute expressions) must NOT be auto-registered on
 * `instance.effects`, because they live on `node.disposers` and must survive
 * Activity/Key soft-hide (which disposes `instance.effects` but keeps the DOM).
 */

// Fast Refresh hot-swap is DEV-only; enable before importing modules.
(globalThis as any).__DEV__ = true;

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../../src/component/create.ts";
import { createRoot } from "../../src/react/create-root.ts";
import { mount } from "../../src/renderer/mount.ts";
import { useState } from "../../src/react/use-state.ts";
import { signal } from "../../src/reactivity/signal.ts";
import { effect, getActiveEffectScope } from "../../src/reactivity/effect.ts";
import { nextTick } from "../../src/reactivity/scheduler.ts";
import { Activity, useEffect } from "../../src/react/_client.ts";
import type { SinwanElement } from "../../src/types.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

async function tick() {
  await nextTick();
}

describe("HMR effect disposal — effect() in component body", () => {
  it("does not duplicate effect runs after a hot-swap (the reported bug)", async () => {
    const logs: number[] = [];
    let setCount!: (v: number) => void;

    const App = cc(() => {
      const [count, set] = useState(0);
      setCount = set;
      effect(() => {
        logs.push(count());
      });
      return el("div", {}, () => `count:${count()}`);
    });

    const root = createRoot(container);
    root.render(App as any);

    expect(logs).toEqual([0]);

    setCount(1);
    await tick();
    expect(logs).toEqual([0, 1]);

    // Simulate an HMR edit: re-render the same component → hot-swap path.
    // The new effect re-runs once on swap to re-subscribe (logging the
    // current state), then a single state change must produce exactly ONE
    // new log — NOT one per accumulated version (the reported bug).
    root.render(App as any);
    const swapLen = logs.length;

    setCount(2);
    await tick();
    // Exactly one new entry from the state change (no duplication).
    expect(logs.length).toBe(swapLen + 1);
    expect(logs[logs.length - 1]).toBe(2);

    // A second hot-swap must not accumulate live effects either.
    root.render(App as any);
    const swap2Len = logs.length;
    setCount(3);
    await tick();
    expect(logs.length).toBe(swap2Len + 1);
    expect(logs[logs.length - 1]).toBe(3);

    // A third hot-swap — still exactly one effect alive.
    root.render(App as any);
    const swap3Len = logs.length;
    setCount(4);
    await tick();
    expect(logs.length).toBe(swap3Len + 1);
    expect(logs[logs.length - 1]).toBe(4);
  });

  it("disposes body effects on root.unmount()", async () => {
    const logs: number[] = [];
    let setCount!: (v: number) => void;

    const App = cc(() => {
      const [count, set] = useState(0);
      setCount = set;
      effect(() => {
        logs.push(count());
      });
      return el("div", {}, () => `${count()}`);
    });

    const root = createRoot(container);
    root.render(App as any);
    setCount(5);
    await tick();
    expect(logs).toEqual([0, 5]);

    root.unmount();

    // After unmount, mutating state must not run the disposed effect.
    // (setCount still mutates the preserved signal, but the effect is gone.)
    setCount(6);
    await tick();
    expect(logs).toEqual([0, 5]);
  });

  it("runs the body effect once on initial mount (not on every state change)", async () => {
    let bodyRuns = 0;
    let setCount!: (v: number) => void;

    const App = cc(() => {
      const [count, set] = useState(0);
      setCount = set;
      bodyRuns++;
      effect(() => {
        void count();
      });
      return el("div", {}, () => `${count()}`);
    });

    const root = createRoot(container);
    root.render(App as any);
    expect(bodyRuns).toBe(1);

    setCount(1);
    await tick();
    setCount(2);
    await tick();
    // The component body runs once on mount; fine-grained reactivity updates
    // only the effect/DOM — the body must NOT re-run per state change.
    expect(bodyRuns).toBe(1);
  });
});

describe("HMR effect disposal — DOM-binding effects survive soft-hide", () => {
  it("keeps reactive text bindings reactive after Activity soft-hide/show", async () => {
    const mode = signal<"visible" | "hidden">("visible");
    let inc!: () => void;

    const Child = cc(() => {
      const s = signal(0);
      inc = () => {
        s.value = s.value + 1;
      };
      return el("div", { "data-testid": "val" }, () => `val:${s.value}`);
    });

    const App = cc(() =>
      Activity({ mode: mode as any, children: el(Child as any, {}) }),
    );

    mount(App, container);
    expect(container.textContent).toContain("val:0");

    inc();
    await tick();
    expect(container.textContent).toContain("val:1");

    // Soft-hide: disposes instance.effects (body effects) but preserves DOM
    // and node.disposers (the reactive text binding must survive).
    mode.value = "hidden";
    await tick();

    // Soft-show: the reactive binding must still work.
    mode.value = "visible";
    await tick();

    inc();
    await tick();
    expect(container.textContent).toContain("val:2");
  });
});

describe("HMR effect disposal — effects inside useEffect callbacks", () => {
  it("auto-registers effects created inside a useEffect callback", async () => {
    const inner: number[] = [];
    let setCount!: (v: number) => void;

    const App = cc(() => {
      const [count, set] = useState(0);
      setCount = set;
      useEffect(() => {
        // Effect created inside the useEffect callback should be owned by the
        // component and disposed on unmount.
        const dispose = effect(() => {
          inner.push(count());
        });
        return () => dispose();
      }, [count]);
      return el("div", {}, () => `${count()}`);
    });

    const root = createRoot(container);
    root.render(App as any);
    // useEffect runs after mount (microtask).
    await tick();
    expect(inner).toEqual([0]);

    setCount(1);
    await tick();
    // deps changed → cleanup disposes old effect, new effect runs.
    expect(inner).toEqual([0, 1]);

    root.unmount();
    setCount(2);
    await tick();
    // No further runs after unmount.
    expect(inner).toEqual([0, 1]);
  });
});

describe("HMR effect disposal — error paths restore the effect scope", () => {
  it("falls back gracefully when a hot-swap setup throws (scope restored)", () => {
    // First render: a healthy component that creates a body effect.
    const Healthy = cc(() => {
      effect(() => undefined);
      return el("div", {}, "ok");
    });

    const root = createRoot(container);
    root.render(Healthy as any);
    expect(container.textContent).toContain("ok");

    // Hot-swap to a component that throws during setup. hotSwapRootInstance
    // must catch the error, restore the effect scope, and return false so the
    // caller can fall back. The global effect scope must be left clean (null)
    // afterwards — not stuck on the failed instance.
    const Throwing = cc(() => {
      throw new Error("boom");
    });

    // Should not throw out of render(); the error is handled internally.
    expect(() => root.render(Throwing as any)).not.toThrow();

    // The global effect scope must be restored to null (no leaked scope).
    expect(getActiveEffectScope()).toBeNull();
  });

  it("restores the scope when a component setup throws during mount", () => {
    const Throwing = cc(() => {
      throw new Error("mount-boom");
    });

    const root = createRoot(container);
    expect(() => root.render(Throwing as any)).not.toThrow();

    expect(getActiveEffectScope()).toBeNull();
  });
});
