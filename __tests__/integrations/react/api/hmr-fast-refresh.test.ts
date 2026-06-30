/**
 * Regression tests for plugin-free Fast Refresh (HMR hot-swap) state
 * preservation, focused on the interaction between native `signal()` and
 * the React-compatible `useState` hook.
 *
 * Bug: hook-internal signals (useState/useReducer/...) were leaking into the
 * user-land `signal_slots`. Because the hook slot init runs only on the first
 * render (not on hot-swap reuse), the signal cursor drifted, cross-wiring a
 * user `signal()` onto a `useState` signal — mutating one changed the other.
 */

// Fast Refresh hot-swap is DEV-only; enable before importing modules.
(globalThis as any).__DEV__ = true;

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../../../../src/component/create.ts";
import { createRoot } from "../../../../src/integrations/react/create-root.ts";
import { useState } from "../../../../src/integrations/react/use-state.ts";
import { signal, type Signal } from "../../../../src/reactivity/signal.ts";
import type { SinwanElement } from "../../../../src/types.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
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

describe("Fast Refresh — useState + signal isolation across hot-swap", () => {
  it("keeps useState and signal independent when useState is declared FIRST", () => {
    let count!: Signal<number>;
    let name!: () => string;
    let setName!: (v: string) => void;

    // useState BEFORE signal — the order that triggered the cross-wiring.
    const App = cc(() => {
      const [n, setN] = useState("alice");
      const c = signal(0);
      name = n;
      setName = setN;
      count = c;
      return el("div", {}, () => `${n()}-${c.value}`);
    });

    const root = createRoot(container);
    root.render(App as any);

    // Mutate both pieces of state.
    count.value = 5;
    setName("bob");
    expect(count.value).toBe(5);
    expect(name()).toBe("bob");

    // Trigger a hot-swap (simulating an HMR edit with identical hook shape).
    root.render(App as any);

    // State preserved across the swap.
    expect(count.value).toBe(5);
    expect(name()).toBe("bob");

    // CRITICAL: the two must remain DISTINCT, not a shared signal.
    count.value = 99;
    expect(name()).toBe("bob"); // unchanged by mutating count
    setName("carol");
    expect(count.value).toBe(99); // unchanged by mutating name
  });

  it("keeps useState and signal independent when signal is declared FIRST", () => {
    let count!: Signal<number>;
    let name!: () => string;
    let setName!: (v: string) => void;

    const App = cc(() => {
      const c = signal(0);
      const [n, setN] = useState("alice");
      count = c;
      name = n;
      setName = setN;
      return el("div", {}, () => `${n()}-${c.value}`);
    });

    const root = createRoot(container);
    root.render(App as any);

    count.value = 7;
    setName("bob");

    root.render(App as any);

    expect(count.value).toBe(7);
    expect(name()).toBe("bob");

    count.value = 42;
    expect(name()).toBe("bob");
    setName("dave");
    expect(count.value).toBe(42);
  });

  it("preserves multiple interleaved signals and useStates by correct slot", () => {
    let a!: Signal<number>;
    let b!: () => string;
    let setB!: (v: string) => void;
    let cSig!: Signal<boolean>;
    let d!: () => number;
    let setD!: (v: number) => void;

    const App = cc(() => {
      const _a = signal(1);
      const [_b, _setB] = useState("x");
      const _c = signal(false);
      const [_d, _setD] = useState(10);
      a = _a;
      b = _b;
      setB = _setB;
      cSig = _c;
      d = _d;
      setD = _setD;
      return el("div", {}, () => `${_a.value}-${_b()}-${_c.value}-${_d()}`);
    });

    const root = createRoot(container);
    root.render(App as any);

    a.value = 100;
    setB("hello");
    cSig.value = true;
    setD(999);

    root.render(App as any);

    expect(a.value).toBe(100);
    expect(b()).toBe("hello");
    expect(cSig.value).toBe(true);
    expect(d()).toBe(999);

    // Each remains independent after the swap.
    a.value = 1;
    expect(b()).toBe("hello");
    expect(cSig.value).toBe(true);
    expect(d()).toBe(999);
  });
});
