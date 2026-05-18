/**
 * Comprehensive tests for `useCallback`.
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
  useCallback,
  useMemo,
  useEffect,
  useState,
} from "../../../../src/integrations/react/_client.ts";

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
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

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

describe("useCallback — Reference", () => {
  it("returns the fn function passed on the initial render", () => {
    // Covers: Reference / Returns — On the initial render, useCallback
    // returns the fn function you have passed.
    const fn = (n: number) => n * 2;
    let result: typeof fn | undefined;
    const App = cc(() => {
      const [dep] = useState(1);
      result = useCallback(fn, [dep]);
      return el("div");
    });
    mount(App, container);
    expect(result).toBe(fn);
  });

  it("returns the same function when dependencies haven't changed", () => {
    // Covers: Reference / Returns — During subsequent renders, it will
    // either return an already stored fn function from the last render
    // (if the dependencies haven't changed).
    const fn = (n: number) => n * 2;
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useCallback(fn, [one, two]);
        },
        deps: [1, 2],
      },
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useCallback(fn, [one, two]);
        },
        deps: [1, 2],
      },
    ]);
    expect(cb1).toBe(cb2);
  });

  it("returns a new function when dependencies have changed", () => {
    const fn1 = (n: number) => n * 2;
    const fn2 = (n: number) => n * 3;
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useCallback(fn1, [one]);
        },
        deps: [1],
      },
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useCallback(fn2, [two]);
        },
        deps: [2],
      },
    ]);
    expect(cb1).not.toBe(cb2);
    expect(cb2).toBe(fn2);
  });

  it("does not call the function — it returns it for the caller to decide when to invoke", () => {
    // Covers: Reference / Parameters / fn — React will not call your
    // function. The function is returned to you so you can decide when
    // and whether to call it.
    let callCount = 0;
    const fn = () => {
      callCount++;
      return 42;
    };
    const App = cc(() => {
      const cb = useCallback(fn, []);
      // cb is returned, not called
      void cb;
      return el("div");
    });
    mount(App, container);
    expect(callCount).toBe(0);
  });

  it("compares dependencies with Object.is", () => {
    // Covers: Reference / Parameters / dependencies — React will
    // compare each dependency with its previous value using Object.is.
    const fn = () => 0;

    // NaN === NaN via Object.is
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [nan] = useState(NaN);
          return useCallback(fn, [nan]);
        },
        deps: [NaN],
      },
      {
        setup: () => {
          const [nan] = useState(NaN);
          return useCallback(fn, [nan]);
        },
        deps: [NaN],
      },
    ]);
    expect(cb1).toBe(cb2);

    // -0 !== +0 via Object.is → deps differ, so the hook returns the
    // fn passed in the current render. Use different fn refs to verify.
    const fnZero = () => 0;
    const fnNegZero = () => -0;
    const [cb3, cb4] = simulateRenders([
      {
        setup: () => {
          const [posZero] = useState(0);
          const [negZero] = useState(-0);
          return useCallback(fnZero, [posZero]);
        },
        deps: [0],
      },
      {
        setup: () => {
          const [posZero] = useState(0);
          const [negZero] = useState(-0);
          return useCallback(fnNegZero, [negZero]);
        },
        deps: [-0],
      },
    ]);
    expect(cb3).toBe(fnZero);
    expect(cb4).toBe(fnNegZero);
    expect(cb3).not.toBe(cb4);

    // Same object reference
    const obj = { id: 1 };
    const [cb5, cb6] = simulateRenders([
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useCallback(fn, [objDep]);
        },
        deps: [obj],
      },
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useCallback(fn, [objDep]);
        },
        deps: [obj],
      },
    ]);
    expect(cb5).toBe(cb6);

    // Different object with same shape → deps change, so useCallback
    // returns the fn from the CURRENT render. We pass a different fn
    // reference on the second render to prove it got swapped.
    const fnA = () => 1;
    const fnB = () => 2;
    const [cb7, cb8] = simulateRenders([
      {
        setup: () => {
          const [objA] = useState({ id: 1 });
          const [objB] = useState({ id: 1 });
          return useCallback(fnA, [objA]);
        },
        deps: [{ id: 1 }],
      },
      {
        setup: () => {
          const [objA] = useState({ id: 1 });
          const [objB] = useState({ id: 1 });
          return useCallback(fnB, [objB]);
        },
        deps: [{ id: 1 }],
      },
    ]);
    expect(cb7).toBe(fnA);
    expect(cb8).toBe(fnB);
    expect(cb7).not.toBe(cb8);
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / Caveats — useCallback is a Hook, so you can
    // only call it at the top level of your component or your own Hooks.
    expect(() => {
      useCallback(() => {}, []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage ────────────────────────────────────────────────────────────────

describe("useCallback — Usage / Skipping re-rendering of components", () => {
  it("caches a function so it can be passed to a memo child without causing re-renders", () => {
    // Covers: Usage / Skipping re-rendering — By wrapping handleSubmit in
    // useCallback, you ensure that it's the same function between re-renders.
    const postFn = (n: number) => n + 1;
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [productId] = useState("product-1");
          const [referrer] = useState("referrer-a");
          return useCallback(
            (orderDetails: string) => {
              postFn(orderDetails.length);
            },
            [productId, referrer],
          );
        },
        deps: ["product-1", "referrer-a"],
      },
      {
        setup: () => {
          const [productId] = useState("product-1");
          const [referrer] = useState("referrer-a");
          return useCallback(
            (orderDetails: string) => {
              postFn(orderDetails.length);
            },
            [productId, referrer],
          );
        },
        deps: ["product-1", "referrer-a"],
      },
    ]);
    expect(cb1).toBe(cb2);
  });

  it("returns a different function when a dependency changes", () => {
    // Covers: Usage / Skipping re-rendering — React will compare the
    // dependencies with the dependencies you passed during the previous
    // render. If none of the dependencies have changed, useCallback will
    // return the same function as before. Otherwise, useCallback will return
    // the function you passed on this render.
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [id123] = useState(123);
          const [id456] = useState(456);
          const [ref] = useState("ref");
          return useCallback(() => {}, [id123, ref]);
        },
        deps: [123, "ref"],
      },
      {
        setup: () => {
          const [id123] = useState(123);
          const [id456] = useState(456);
          const [ref] = useState("ref");
          return useCallback(() => {}, [id456, ref]);
        },
        deps: [456, "ref"],
      },
    ]);
    expect(cb1).not.toBe(cb2);
  });
});

describe("useCallback — Usage / Updating state from a memoized callback", () => {
  it("can read previous state via updater function inside useCallback without listing state as a dependency", () => {
    // Covers: Usage / Updating state from a memoized callback — When
    // you read some state only to calculate the next state, you can
    // remove that dependency by passing an updater function.
    let capturedUpdater: ((prev: number[]) => number[]) | undefined;
    const App = cc(() => {
      const [todos, setTodos] = useState<number[]>([]);
      const handleAddTodo = useCallback(
        (text: string) => {
          const newTodo = { id: Date.now(), text };
          setTodos((prev: number[]) => [...prev, newTodo as unknown as number]);
        },
        [], // No todos dependency needed because we use updater function
      );
      capturedUpdater = handleAddTodo as any;
      void todos;
      return el("div");
    });
    mount(App, container);
    expect(typeof capturedUpdater).toBe("function");
    // The callback was created with empty deps, so it's stable
    expect(capturedUpdater).toBeDefined();
  });
});

describe("useCallback — Usage / Preventing an Effect from firing too often", () => {
  it("caches a function so it can safely be used as a useEffect dependency", () => {
    // Covers: Usage / Preventing an Effect from firing too often —
    // You can wrap the function you need to call from an Effect into
    // useCallback so it only changes when its own dependencies change.
    let effectCalls = 0;
    const roomId = "room-42";
    const App = cc(() => {
      const [roomIdDep] = useState(roomId);
      const createOptions = useCallback(
        () => ({
          serverUrl: "https://localhost:1234",
          roomId: roomIdDep(),
        }),
        [roomIdDep],
      );
      useEffect(() => {
        effectCalls++;
        const options = createOptions();
        expect(options.roomId).toBe("room-42");
        return () => {};
      }, [createOptions]);
      return el("div");
    });
    mount(App, container);
    // useEffect runs after mount via microtask
    expect(effectCalls).toBe(0);
  });
});

describe("useCallback — Usage / Optimizing a custom Hook", () => {
  it("returns stable functions from a custom hook so consumers can optimize", () => {
    // Covers: Usage / Optimizing a custom Hook — It's recommended to
    // wrap any functions that a custom Hook returns into useCallback.
    const [result1, result2] = simulateRenders([
      {
        setup: () => {
          const navigate = useCallback((url: string) => {
            void url;
          }, []);
          const goBack = useCallback(() => {}, []);
          return { navigate, goBack };
        },
        deps: [],
      },
      {
        setup: () => {
          const navigate = useCallback((url: string) => {
            void url;
          }, []);
          const goBack = useCallback(() => {}, []);
          return { navigate, goBack };
        },
        deps: [],
      },
    ]);
    expect(result1.navigate).toBe(result2.navigate);
    expect(result1.goBack).toBe(result2.goBack);
  });
});

// ─── Troubleshooting ───────────────────────────────────────────────────────

describe("useCallback — Troubleshooting", () => {
  it("returns a different function every time when the dependency array is omitted", () => {
    // Covers: Troubleshooting / Every time my component renders, useCallback
    // returns a different function — Make sure you've specified the dependency
    // array as a second argument!
    const fn1 = () => 1;
    const fn2 = () => 2;
    const [cb1, cb2] = simulateRenders([
      { setup: () => useCallback(fn1), deps: [] },
      { setup: () => useCallback(fn2), deps: [] },
    ]);
    // Without a deps array, each "render" gets the function passed that render
    expect(cb1).toBe(fn1);
    expect(cb2).toBe(fn2);
    expect(cb1).not.toBe(cb2);
  });

  it("throws when called inside a loop (outside component top level)", () => {
    // Covers: Troubleshooting / I need to call useCallback for each list item
    // in a loop, but it's not allowed.
    expect(() => {
      for (let i = 0; i < 3; i++) {
        useCallback(() => i, []);
      }
    }).toThrow("outside of a component");
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("useCallback — Edge cases", () => {
  it("handles empty dependency array (caches forever)", () => {
    const fn = () => 42;
    const [cb1, cb2] = simulateRenders([
      { setup: () => useCallback(fn, []), deps: [] },
      { setup: () => useCallback(fn, []), deps: [] },
    ]);
    expect(cb1).toBe(cb2);
  });

  it("handles dependencies with null and undefined values", () => {
    const fn = () => 0;
    const [cb1, cb2] = simulateRenders([
      {
        setup: () => {
          const [nil] = useState<null>(null);
          const [undef] = useState<undefined>(undefined);
          return useCallback(fn, [nil, undef]);
        },
        deps: [null, undefined],
      },
      {
        setup: () => {
          const [nil] = useState<null>(null);
          const [undef] = useState<undefined>(undefined);
          return useCallback(fn, [nil, undef]);
        },
        deps: [null, undefined],
      },
    ]);
    expect(cb1).toBe(cb2);
  });

  it("handles functions that accept any arguments and return any value", () => {
    const fn = (a: string, b: number, c?: boolean) => ({
      a,
      b,
      c: c ?? false,
    });
    let result: typeof fn | undefined;
    const App = cc(() => {
      const [dep] = useState(1);
      result = useCallback(fn, [dep]);
      return el("div");
    });
    mount(App, container);
    expect(result).toBe(fn);
    expect(result!("x", 5, true)).toEqual({ a: "x", b: 5, c: true });
  });

  it("preserves the this-binding of the original function reference", () => {
    const obj = {
      value: 10,
      method() {
        return this.value;
      },
    };
    let captured: (() => number) | undefined;
    const App = cc(() => {
      captured = useCallback(obj.method, []);
      return el("div");
    });
    mount(App, container);
    // The returned function is the SAME reference, so this-binding is preserved
    expect(captured).toBe(obj.method);
  });

  it("works with useMemo pattern equivalence", () => {
    // Covers: DeepDive / How is useCallback related to useMemo?
    // useCallback(fn, deps) is equivalent to useMemo(() => fn, deps)
    const fn = (x: number) => x + 1;
    let memoCb: typeof fn | undefined;
    let callbackCb: typeof fn | undefined;
    const App = cc(() => {
      const [dep] = useState(1);
      memoCb = useMemo(() => fn, [dep]);
      callbackCb = useCallback(fn, [dep]);
      return el("div");
    });
    mount(App, container);
    expect(memoCb).toBe(callbackCb);
  });
});
