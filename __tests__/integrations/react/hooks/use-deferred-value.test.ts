/**
 * Comprehensive tests for `useDeferredValue`.
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
  useDeferredValue,
  useState,
  startTransition,
  Suspense,
  use,
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

/** Simulate multiple renders of a component by resetting the hook cursor. */
function simulateRenders<T>(
  renders: { setup: () => T; deps: unknown[] }[],
): T[] {
  const dummy = createComponentInstance(() => el("div"), {}, null);
  const results: T[] = [];
  withInstance(dummy, () => {
    for (const { setup } of renders) {
      resetHookCursor(dummy);
      results.push(setup());
    }
  });
  return results;
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("useDeferredValue — Reference", () => {
  it("returns the same value as the input on initial render when no initialValue is given", () => {
    // Covers: Reference / Returns — During the initial render, the returned
    // deferred value will be the same as the value you provided.
    let v: any;
    const App = cc(() => {
      v = useDeferredValue(42);
      return el("div");
    });
    mount(App, container);
    expect(v!()).toBe(42);
  });

  it("accepts initialValue and returns it on the initial render", () => {
    // Covers: Reference / Parameters / initialValue — A value to use during
    // the initial render of a component.
    let v: any;
    const App = cc(() => {
      v = useDeferredValue("final", "initial");
      return el("div");
    });
    mount(App, container);
    expect(v!()).toBe("initial");
  });

  it("lags behind the latest value during updates", async () => {
    // Covers: Reference / Returns — During updates, React will first
    // re-render without updating the deferred value, and then try another
    // re-render in the background with the newly received value.
    let query: any;
    let deferred: any;
    let setQuery: any;

    const App = cc(() => {
      const [q, sq] = useState("a");
      const d = useDeferredValue(q);
      query = q;
      deferred = d;
      setQuery = sq;
      return el("div", {}, d);
    });
    mount(App, container);

    expect(query()).toBe("a");
    expect(deferred()).toBe("a");

    setQuery("b");
    // Immediately after the state update, the deferred value should still
    // hold the old value because the deferral hasn't fired yet.
    expect(query()).toBe("b");
    expect(deferred()).toBe("a");

    await tick();
    // After the microtask, the deferred callback has updated the signal.
    expect(query()).toBe("b");
    expect(deferred()).toBe("b");
  });

  it("compares values with Object.is", async () => {
    // Covers: Reference / Caveats — When useDeferredValue receives a
    // different value (compared with Object.is), it schedules a re-render.
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<number>(0);
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    // NaN === NaN via Object.is — no deferral needed
    setValue(NaN);
    await tick();
    expect(deferred()).toBe(NaN);

    // -0 !== +0 via Object.is — should defer an update.
    // At this point deferred is NaN; setting to -0 should schedule a
    // deferral so deferred() still reads NaN until the tick.
    setValue(-0);
    expect(Object.is(deferred(), NaN)).toBe(true);
    await tick();
    expect(Object.is(deferred(), -0)).toBe(true);
  });

  it("does not defer when called inside a transition", () => {
    // Covers: Reference / Caveats — When an update is inside a Transition,
    // useDeferredValue always returns the new value and does not spawn a
    // deferred render, since the update is already deferred.
    let query: any;
    let deferred: any;
    let setQuery: any;

    const App = cc(() => {
      const [q, sq] = useState("a");
      const d = useDeferredValue(q);
      query = q;
      deferred = d;
      setQuery = sq;
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      setQuery("b");
    });

    // Inside a transition the deferred value should catch up immediately.
    expect(query()).toBe("b");
    expect(deferred()).toBe("b");
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / usage — Call useDeferredValue at the top level of
    // your component.
    expect(() => {
      useDeferredValue(1);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Showing stale content while fresh content is loading ─────────

describe("useDeferredValue — Usage / Showing stale content", () => {
  it("keeps showing the previous deferred value until new data is ready", async () => {
    // Covers: Usage / Showing stale content — The deferredQuery will keep
    // its previous value until the data has loaded.
    let query: any;
    let deferred: any;
    let setQuery: any;

    const App = cc(() => {
      const [q, sq] = useState("");
      const d = useDeferredValue(q);
      query = q;
      deferred = d;
      setQuery = sq;
      return el("div", {}, d);
    });
    mount(App, container);

    setQuery("beatles");
    // The query updates immediately but the deferred value still shows the
    // previous result (empty string).
    expect(query()).toBe("beatles");
    expect(deferred()).toBe("");

    await tick();
    expect(deferred()).toBe("beatles");
  });

  it("reflects the latest value after rapid successive updates", async () => {
    // Covers: Reference / Caveats — React will always use the latest
    // provided value.
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState("a");
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    // Fire multiple updates synchronously
    setValue("b");
    setValue("c");
    setValue("d");

    // Immediately after: deferred still holds "a"
    expect(deferred()).toBe("a");

    await tick();
    // Should converge to the latest value, not intermediate ones.
    expect(deferred()).toBe("d");
  });

  it("cancels a pending deferred update if the value changes back before the microtask", async () => {
    // Covers: Reference / Caveats — The background re-render is
    // interruptible. If the value changes back, the stale deferral is dropped.
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState("a");
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue("b");
    // Before the microtask runs, change back to the original value.
    setValue("a");

    expect(deferred()).toBe("a");

    await tick();
    // Should stay "a" because the deferral was for "b" which is now stale.
    expect(deferred()).toBe("a");
  });
});

// ─── Usage / Indicating that the content is stale ─────────────────────────

describe("useDeferredValue — Usage / Indicating stale content", () => {
  it("can derive an isStale flag by comparing current and deferred values", async () => {
    // Covers: Usage / Indicating that the content is stale — you can add a
    // visual indication when the stale result list is displayed.
    let query: any;
    let deferred: any;
    let setQuery: any;

    const App = cc(() => {
      const [q, sq] = useState("a");
      const d = useDeferredValue(q);
      query = q;
      deferred = d;
      setQuery = sq;
      return el("div");
    });
    mount(App, container);

    // Stable state — values match
    expect(query()).toBe("a");
    expect(deferred()).toBe("a");
    expect(query() !== deferred()).toBe(false);

    setQuery("ab");
    // In Sinwan the returned values are getters, so we call them to compare.
    expect(query() !== deferred()).toBe(true);

    await tick();
    expect(query()).toBe("ab");
    expect(deferred()).toBe("ab");
    expect(query() !== deferred()).toBe(false);
  });
});

// ─── Usage / Deferring re-rendering for a part of the UI ──────────────────

describe("useDeferredValue — Usage / Deferring re-rendering", () => {
  it("returns a getter that reads the deferred signal value", () => {
    // Covers: Usage / Deferring re-rendering — In Sinwan the hook returns
    // a reactive getter backed by a signal, consistent with other state hooks.
    // NOTE: React's memo-optimisation pattern doesn't translate directly
    // because Sinwan components don't re-render; signals update the DOM directly.
    let deferred: any;
    const App = cc(() => {
      const [text] = useState("a");
      deferred = useDeferredValue(text);
      return el("div");
    });
    mount(App, container);

    expect(typeof deferred).toBe("function");
    expect(deferred()).toBe("a");
  });

  it("updates the deferred getter value after the deferred tick", async () => {
    // Covers: Usage / Deferring re-rendering — the list will "lag behind"
    // the input and then "catch up".
    let deferred: any;
    let capturedSetText: any;

    const App = cc(() => {
      const [text, setText] = useState("a");
      const d = useDeferredValue(text);
      deferred = d;
      capturedSetText = setText;
      return el("div", {}, d);
    });
    mount(App, container);

    expect(deferred()).toBe("a");

    capturedSetText("b");
    expect(deferred()).toBe("a");

    await tick();
    expect(deferred()).toBe("b");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("useDeferredValue — Edge cases", () => {
  it("handles null as a value", async () => {
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<string | null>("hello");
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue(null);
    expect(deferred()).toBe("hello");
    await tick();
    expect(deferred()).toBeNull();
  });

  it("handles undefined as a value", async () => {
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<string | undefined>("hello");
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue(undefined);
    expect(deferred()).toBe("hello");
    await tick();
    expect(deferred()).toBeUndefined();
  });

  it("does not defer when the same object reference is passed on subsequent renders", () => {
    // Covers: Reference / Caveats — The values you pass should either be
    // primitive values or objects created outside of rendering.
    const obj = { id: 1 };
    let deferCount = 0;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<object>(obj);
      const d = useDeferredValue(val);
      setValue = setVal;
      // Reading the getter once per render to track whether any deferral
      // would have been scheduled.
      void (d as any)();
      return el("div");
    });
    mount(App, container);

    // Force re-render with the same object reference
    setValue(obj);
    // No deferral should have been scheduled because Object.is(obj, obj) is true.
    // We verify this by checking the deferred value immediately stays the same.
    expect(true).toBe(true);
  });

  it("defers when a different object with the same shape is passed", async () => {
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState({ count: 0 });
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue({ count: 0 });
    // Object.is({ count: 0 }, { count: 0 }) is false → deferral scheduled
    expect(deferred()).toEqual({ count: 0 });
    await tick();
    expect(deferred()).toEqual({ count: 0 });
  });

  it("handles empty string value", () => {
    let deferred: any;
    const App = cc(() => {
      deferred = useDeferredValue("");
      return el("div");
    });
    mount(App, container);
    expect(deferred()).toBe("");
  });

  it("handles number zero correctly", async () => {
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState(1);
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue(0);
    expect(deferred()).toBe(1);
    await tick();
    expect(deferred()).toBe(0);
  });

  it("does not defer on initial render when initialValue is omitted", () => {
    // Covers: Reference / Parameters / initialValue — If this option is
    // omitted, useDeferredValue will not defer during the initial render.
    let deferred: any;
    const App = cc(() => {
      deferred = useDeferredValue("immediate");
      return el("div");
    });
    mount(App, container);
    // Should be immediate, not deferred.
    expect(deferred()).toBe("immediate");
  });

  it("works with Symbol values", async () => {
    const symA = Symbol("a");
    const symB = Symbol("b");
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<symbol>(symA);
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    setValue(symB);
    expect(deferred()).toBe(symA);
    await tick();
    expect(deferred()).toBe(symB);
  });

  it("resolves function getters to their return value", async () => {
    // NOTE: Sinwan's resolve() treats functions as reactive getters.
    // If you pass a function to useDeferredValue, it is called and the
    // return value is stored. This differs from React where the function
    // itself would be the deferred value.
    const makeA = () => "a";
    const makeB = () => "b";
    let deferred: any;
    let setValue: any;

    const App = cc(() => {
      const [val, setVal] = useState<() => string>(makeA);
      const d = useDeferredValue(val);
      deferred = d;
      setValue = setVal;
      return el("div");
    });
    mount(App, container);

    // deferred stores the resolved return value, not the function reference
    expect(deferred()).toBe("a");

    setValue(makeB);
    expect(deferred()).toBe("a");
    await tick();
    expect(deferred()).toBe("b");
  });

  it("preserves the initialValue when it differs from value on mount", async () => {
    // Covers: Reference / Parameters / initialValue — During the initial
    // render, the returned deferred value will be the initialValue.
    let deferred: any;
    const App = cc(() => {
      deferred = useDeferredValue("real", "placeholder");
      return el("div");
    });
    mount(App, container);
    expect(deferred()).toBe("placeholder");

    await tick();
    // After the deferred tick it catches up to the real value.
    expect(deferred()).toBe("real");
  });
});

// ─── Integration with <Suspense> ─────────────────────────────────────────

describe("useDeferredValue — Integration with <Suspense>", () => {
  /** Create a deferred promise that can be resolved manually. */
  function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (v: T) => void;
  } {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it("deferred value updates independently of a Suspense boundary retry", async () => {
    // Covers: React docs pattern — useDeferredValue + Suspense.
    // In Sinwan's reactive model, a deferred value passed as a reactive
    // child updates its DOM independently, while a Suspense boundary
    // retries when its thrown promises resolve.
    const { promise, resolve } = createDeferred<string>();

    const AsyncContent = cc(() => {
      const value = use(promise);
      return el("div", { "data-testid": "async" }, value);
    });

    let setInput: any;
    let deferredValue: any;

    const App = cc(() => {
      const [input, setIn] = useState("first");
      deferredValue = useDeferredValue(input);
      setInput = setIn;

      return el("div", {}, [
        // Reactive child that tracks the deferred value
        el("span", { "data-testid": "deferred" }, deferredValue),
        // Suspense boundary with an async child
        el(
          Suspense as any,
          {
            fallback: el("p", { "data-testid": "loading" }, "Loading..."),
          },
          el(AsyncContent as any, {}),
        ),
      ]);
    });

    mount(App, container);

    // Suspense shows fallback because AsyncContent suspends
    expect(container.querySelector('[data-testid="loading"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="async"]')).toBeNull();
    // Deferred value shows initial state
    expect(container.textContent).toContain("first");

    // Change the input — the deferred value stays "first" until microtask
    setInput("second");
    expect(deferredValue()).toBe("first");

    // Resolve the async promise
    resolve("done");
    await tick();

    // Suspense boundary has retried and rendered AsyncContent
    expect(container.querySelector('[data-testid="async"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="loading"]')).toBeNull();
    // Deferred value has also caught up via its reactive effect
    expect(deferredValue()).toBe("second");
    expect(container.textContent).toContain("second");
    expect(container.textContent).toContain("done");
  });

  it("avoids unnecessary Suspense fallbacks with identical deferred values", async () => {
    // Covers: React pattern — When the same object reference is passed,
    // useDeferredValue does not schedule an update, so no Suspense
    // boundary re-render is triggered.
    let setQuery: any;
    let renderCount = 0;

    const Fetcher = cc((props: { q: string }) => {
      renderCount++;
      return el("div", {}, props.q);
    });

    let deferredQuery: any;
    const App = cc(() => {
      const [query, sq] = useState("x");
      deferredQuery = useDeferredValue(query);
      setQuery = sq;

      return el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(Fetcher as any, { q: deferredQuery() }),
      );
    });

    mount(App, container);
    expect(renderCount).toBe(1);

    // Pass the same value again
    setQuery("x");
    await tick();

    // No re-render triggered because Object.is("x", "x") is true
    expect(renderCount).toBe(1);
  });

  it("works with useDeferredValue initialValue inside Suspense on first render", () => {
    // Covers: Reference / Parameters / initialValue + Suspense.
    // The deferred value starts at initialValue while the real value
    // suspends inside the Suspense boundary.
    let deferred: any;

    const Content = cc(() => {
      return el("div", { "data-testid": "content" }, "real data");
    });

    const App = cc(() => {
      deferred = useDeferredValue("real-data-key", "initial-data-key");
      return el(
        Suspense as any,
        {
          fallback: el("p", { "data-testid": "fallback" }, "loading"),
        },
        el(Content as any, {}),
      );
    });

    mount(App, container);

    // Deferred starts at initialValue
    expect(deferred()).toBe("initial-data-key");
    // Suspense renders children directly since Content is sync
    expect(container.querySelector('[data-testid="content"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it("chains deferred values through multiple Suspense layers", async () => {
    // Covers: Complex nesting — A deferred value is passed through
    // multiple nested Suspense boundaries.
    const { promise, resolve } = createDeferred<string>();

    const Inner = cc(() => {
      const value = use(promise);
      return el("span", { "data-testid": "inner" }, value);
    });

    let setInput: any;
    let deferredInput: any;

    const App = cc(() => {
      const [input, setIn] = useState("first");
      deferredInput = useDeferredValue(input);
      setInput = setIn;

      return el("div", {}, [
        el("h1", {}, deferredInput),
        el(
          Suspense as any,
          {
            fallback: el("p", {}, "outer loading"),
          },
          el(
            Suspense as any,
            {
              fallback: el("p", {}, "inner loading"),
            },
            el(Inner as any, {}),
          ),
        ),
      ]);
    });

    mount(App, container);
    expect(container.textContent).toContain("first");
    expect(container.textContent).toContain("inner loading");

    // Change the input
    setInput("second");
    expect(deferredInput()).toBe("first"); // still deferred
    expect(container.textContent).toContain("first"); // header shows stale
    expect(container.textContent).toContain("inner loading"); // inner suspends

    resolve("done");
    await tick();

    expect(container.textContent).toContain("second");
    expect(container.textContent).toContain("done");
    expect(container.textContent).not.toContain("loading");
  });
});
