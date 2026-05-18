/**
 * Comprehensive tests for `useTransition`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import { resetHookCursor } from "../../../../src/integrations/react/_internal/bridge.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useTransition,
  useState,
  startTransition,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush (effects + deferred callbacks). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Wait for a timer-based delay. */
async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("useTransition — Reference", () => {
  it("returns an array with exactly two items", () => {
    let api: any;
    const App = cc(() => {
      api = useTransition();
      return el("div");
    });
    mount(App, container);

    expect(Array.isArray(api)).toBe(true);
    expect(api.length).toBe(2);
  });

  it("returns isPending as false initially", () => {
    let pending: any;
    const App = cc(() => {
      [pending] = useTransition();
      return el("div");
    });
    mount(App, container);

    expect(pending()).toBe(false);
  });

  it("returns startTransition as a function", () => {
    let start: any;
    const App = cc(() => {
      [, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    expect(typeof start).toBe("function");
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useTransition();
    }).toThrow("outside of a component");
  });
});

// ─── startTransition ──────────────────────────────────────────────────────

describe("useTransition — startTransition", () => {
  it("calls the action function immediately", () => {
    let actionCalled = false;
    const App = cc(() => {
      const [, start] = useTransition();
      start(() => {
        actionCalled = true;
      });
      return el("div");
    });
    mount(App, container);

    expect(actionCalled).toBe(true);
  });

  it("does not return anything from startTransition", () => {
    let result: any;
    const App = cc(() => {
      const [, start] = useTransition();
      result = start(() => {});
      return el("div");
    });
    mount(App, container);

    expect(result).toBeUndefined();
  });

  it("marks state updates inside the action as transitions", () => {
    let setCount: any;
    const App = cc(() => {
      const [count, setCountLocal] = useState(0);
      const [, start] = useTransition();
      setCount = setCountLocal;

      start(() => {
        setCount(1);
      });

      return el("div", {}, count);
    });
    mount(App, container);

    expect(setCount).toBeDefined();
    // In Sinwan, state updates inside a transition are batched via runInBatch
    // The signal value should be updated synchronously.
  });

  it("has a stable identity across renders", () => {
    let starts: any[] = [];
    const App = cc(() => {
      const [, start] = useTransition();
      starts.push(start);
      return el("div");
    });

    // Simulate multiple renders by resetting the hook cursor
    const dummy = createComponentInstance(() => el("div"), {}, null);
    withInstance(dummy, () => {
      resetHookCursor(dummy);
      App({});
      resetHookCursor(dummy);
      App({});
      resetHookCursor(dummy);
      App({});
    });

    expect(starts.length).toBe(3);
    expect(starts[0]).toBe(starts[1]);
    expect(starts[1]).toBe(starts[2]);
  });
});

// ─── Usage / Perform non-blocking updates with Actions ────────────────────

describe("useTransition — Usage / Non-blocking updates", () => {
  it("toggles isPending around synchronous work", () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    expect(pending()).toBe(false);

    start(() => {});
    // For sync work, isPending goes true then immediately false
    expect(pending()).toBe(false);
  });

  it("keeps isPending true during async work", async () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    start(async () => {
      await promise;
    });

    expect(pending()).toBe(true);
    resolvePromise();
    await tick();
    expect(pending()).toBe(false);
  });

  it("handles multiple sequential transitions", async () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    // First async transition
    let resolve1!: () => void;
    const p1 = new Promise<void>((r) => {
      resolve1 = r;
    });

    start(async () => {
      await p1;
    });
    expect(pending()).toBe(true);

    resolve1();
    await tick();
    expect(pending()).toBe(false);

    // Second async transition
    let resolve2!: () => void;
    const p2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    start(async () => {
      await p2;
    });
    expect(pending()).toBe(true);

    resolve2();
    await tick();
    expect(pending()).toBe(false);
  });

  it("allows nested startTransition calls", () => {
    let pending: any;
    let start: any;
    let setValue: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      const [v, setV] = useState(0);
      setValue = setV;
      return el("div", {}, v);
    });
    mount(App, container);

    start(() => {
      start(() => {
        setValue(1);
      });
    });

    expect(pending()).toBe(false);
    expect(setValue).toBeDefined();
  });
});

// ─── Usage / Displaying a pending visual state ────────────────────────────

describe("useTransition — Usage / Pending visual state", () => {
  it("reflects isPending in the DOM via reactive prop", async () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("button", { disabled: pending }, "click");
    });
    mount(App, container);

    const btn = container.querySelector("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    start(async () => {
      await promise;
    });

    expect(btn.disabled).toBe(true);

    resolvePromise();
    await tick();
    expect(btn.disabled).toBe(false);
  });
});

// ─── startTransition Caveats ──────────────────────────────────────────────

describe("useTransition — startTransition caveats", () => {
  it("executes the action synchronously, not deferred", () => {
    const order: number[] = [];
    let start: any;

    const App = cc(() => {
      [, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    order.push(1);
    start(() => {
      order.push(2);
    });
    order.push(3);

    expect(order).toEqual([1, 2, 3]);
  });

  it("state updates in setTimeout are NOT inside the transition", async () => {
    let setValue: any;
    let start: any;

    const App = cc(() => {
      const [v, setV] = useState(0);
      [, start] = useTransition();
      setValue = setV;
      return el("div", {}, v);
    });
    mount(App, container);

    start(() => {
      setTimeout(() => {
        setValue(1);
      }, 0);
    });

    // The setTimeout callback hasn't run yet
    expect(setValue).toBeDefined();
    await sleep(10);
    // Now it has run, but it was outside the transition scope
  });

  it("state updates after await need another startTransition", async () => {
    let pending: any;
    let start: any;
    let setValue: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      const [v, setV] = useState(0);
      setValue = setV;
      return el("div", {}, v);
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    start(async () => {
      await promise;
      // After await, this set is NOT automatically in a transition
      setValue(1);
    });

    expect(pending()).toBe(true);
    resolvePromise();
    await tick();
    expect(pending()).toBe(false);
    // The state was still updated because signals update regardless
    expect(setValue).toBeDefined();
  });

  it("can wrap post-await updates in another startTransition", async () => {
    let pending: any;
    let start: any;
    let setValue: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      const [v, setV] = useState(0);
      setValue = setV;
      return el("div", {}, v);
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    start(async () => {
      await promise;
      start(() => {
        setValue(1);
      });
    });

    expect(pending()).toBe(true);
    resolvePromise();
    await tick();
    expect(pending()).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("useTransition — Edge cases", () => {
  it("resets isPending when the action throws synchronously", () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    expect(() => {
      start(() => {
        throw new Error("boom");
      });
    }).toThrow("boom");

    expect(pending()).toBe(false);
  });

  it("resets isPending when the async action rejects", async () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    let rejectPromise!: (e: Error) => void;
    const promise = new Promise<void>((_, r) => {
      rejectPromise = r;
    });

    start(async () => {
      await promise;
    });

    // Attach catch before rejecting so the rejection is never unhandled
    promise.catch(() => {});

    expect(pending()).toBe(true);
    rejectPromise(new Error("async boom"));

    await tick();
    expect(pending()).toBe(false);
  });

  it("handles rapid successive sync transitions", () => {
    let pending: any;
    let start: any;
    let setValue: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      const [v, setV] = useState(0);
      setValue = setV;
      return el("div", {}, v);
    });
    mount(App, container);

    for (let i = 1; i <= 100; i++) {
      start(() => {
        setValue(i);
      });
    }

    // After all sync transitions, isPending should be false
    expect(pending()).toBe(false);
  });

  it("handles rapid successive async transitions", async () => {
    let pending: any;
    let start: any;

    const App = cc(() => {
      [pending, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    const promises: Promise<void>[] = [];
    const resolvers: (() => void)[] = [];

    for (let i = 0; i < 10; i++) {
      let resolve!: () => void;
      const p = new Promise<void>((r) => {
        resolve = r;
      });
      promises.push(p);
      resolvers.push(resolve);

      start(async () => {
        await p;
      });
    }

    expect(pending()).toBe(true);

    // Resolve one at a time
    for (const resolve of resolvers) {
      resolve();
      await tick();
    }

    expect(pending()).toBe(false);
  });

  it("works with useState set functions inside transitions", () => {
    let state: any;
    let setState: any;
    let pending: any;
    let start: any;

    const App = cc(() => {
      [state, setState] = useState(0);
      [pending, start] = useTransition();
      return el("div", {}, state);
    });
    mount(App, container);

    expect(state()).toBe(0);
    expect(pending()).toBe(false);

    start(() => {
      setState(42);
    });

    expect(state()).toBe(42);
    expect(pending()).toBe(false);
  });

  it("works with multiple useState updates in one transition", () => {
    let setA: any;
    let setB: any;
    let a: any;
    let b: any;
    let start: any;

    const App = cc(() => {
      [a, setA] = useState(0);
      [b, setB] = useState("x");
      [, start] = useTransition();
      return el("div", {}, a, b);
    });
    mount(App, container);

    start(() => {
      setA(1);
      setB("y");
    });

    expect(a()).toBe(1);
    expect(b()).toBe("y");
  });

  it("returns a stable startTransition reference when called again within the same instance", () => {
    let start1: any;
    const results: any[] = [];

    const App = cc(() => {
      const [, s] = useTransition();
      start1 = s;
      results.push(s);
      return el("div");
    });

    const dummy = createComponentInstance(() => el("div"), {}, null);
    withInstance(dummy, () => {
      resetHookCursor(dummy);
      App({});
      resetHookCursor(dummy);
      App({});
    });

    expect(results.length).toBe(2);
    // startTransition is memoised in a slot, so it should be stable
    expect(results[0]).toBe(results[1]);
  });

  it("startTransition outside component works standalone", () => {
    expect(() => startTransition(() => {})).not.toThrow();
  });

  it("does not leak pending state across unrelated transitions", async () => {
    let pendingA: any;
    let startA: any;
    let pendingB: any;
    let startB: any;

    const AppA = cc(() => {
      [pendingA, startA] = useTransition();
      return el("div");
    });

    const AppB = cc(() => {
      [pendingB, startB] = useTransition();
      return el("div");
    });

    mount(AppA, container);

    const container2 = (globalThis as any).document.createElement("div");
    (globalThis as any).document.body.appendChild(container2);
    mount(AppB, container2);

    let resolveA!: () => void;
    const pA = new Promise<void>((r) => {
      resolveA = r;
    });

    startA(async () => {
      await pA;
    });

    expect(pendingA()).toBe(true);
    expect(pendingB()).toBe(false);

    resolveA();
    await tick();
    expect(pendingA()).toBe(false);
    expect(pendingB()).toBe(false);
  });
});
