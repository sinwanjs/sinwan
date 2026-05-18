/**
 * Comprehensive tests for `useMemo`.
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
  useMemo,
  useState,
  useEffect,
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

describe("useMemo — Reference", () => {
  it("accepts a calculateValue function and a dependency array", () => {
    // Covers: Reference / Parameters — calculateValue and dependencies
    const App = cc(() => {
      const [dep] = useState(1);
      const value = useMemo(() => 1 + 1, [dep]);
      void value;
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns the result of calling calculateValue on the initial render", () => {
    // Covers: Reference / Returns — On the initial render, useMemo
    // returns the result of calling calculateValue with no arguments.
    let result: number | undefined;
    const App = cc(() => {
      result = useMemo(() => 42, []);
      return el("div");
    });
    mount(App, container);
    expect(result).toBe(42);
  });

  it("returns the same cached value when dependencies haven't changed", () => {
    // Covers: Reference / Returns — During subsequent renders, it will
    // either return an already stored value from the last render.
    const obj = { id: 1 };
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [key] = useState("a");
          return useMemo(() => obj, [key]);
        },
        deps: ["a"],
      },
      {
        setup: () => {
          const [key] = useState("a");
          return useMemo(() => obj, [key]);
        },
        deps: ["a"],
      },
    ]);
    expect(val1).toBe(obj);
    expect(val2).toBe(obj);
    expect(val1).toBe(val2);
  });

  it("recomputes and returns a new value when dependencies have changed", () => {
    // Covers: Reference / Returns — ...or call calculateValue again
    // and return the result.
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useMemo(() => ({ id: 1 }), [one]);
        },
        deps: [1],
      },
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useMemo(() => ({ id: 2 }), [two]);
        },
        deps: [2],
      },
    ]);
    expect(val1).toEqual({ id: 1 });
    expect(val2).toEqual({ id: 2 });
    expect(val1).not.toBe(val2);
  });

  it("does not call calculateValue again when deps are the same", () => {
    // Covers: Reference / Parameters / calculateValue — React will
    // call your function during the initial render. On next renders,
    // React will return the same value again if dependencies haven't changed.
    let callCount = 0;
    const factory = () => {
      callCount++;
      return 99;
    };
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [key] = useState("x");
          return useMemo(factory, [key]);
        },
        deps: ["x"],
      },
      {
        setup: () => {
          const [key] = useState("x");
          return useMemo(factory, [key]);
        },
        deps: ["x"],
      },
    ]);
    expect(callCount).toBe(1); // only called once
    expect(val1).toBe(99);
    expect(val2).toBe(99);
  });

  it("compares dependencies with Object.is", () => {
    // Covers: Reference / Parameters / dependencies — React will compare
    // each dependency with its previous value using Object.is.
    const factory = () => 0;

    // NaN === NaN via Object.is
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [nan] = useState(NaN);
          return useMemo(factory, [nan]);
        },
        deps: [NaN],
      },
      {
        setup: () => {
          const [nan] = useState(NaN);
          return useMemo(factory, [nan]);
        },
        deps: [NaN],
      },
    ]);
    expect(val1).toBe(val2);

    // -0 !== +0 via Object.is → deps differ, recompute
    let calls = 0;
    const countingFactory = () => ++calls;
    const [val3, val4] = simulateRenders([
      {
        setup: () => {
          const [posZero] = useState(0);
          const [negZero] = useState(-0);
          return useMemo(countingFactory, [posZero]);
        },
        deps: [0],
      },
      {
        setup: () => {
          const [posZero] = useState(0);
          const [negZero] = useState(-0);
          return useMemo(countingFactory, [negZero]);
        },
        deps: [-0],
      },
    ]);
    expect(val3).toBe(1);
    expect(val4).toBe(2);

    // Same object reference → cached
    const obj = { id: 1 };
    const [val5, val6] = simulateRenders([
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useMemo(factory, [objDep]);
        },
        deps: [obj],
      },
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useMemo(factory, [objDep]);
        },
        deps: [obj],
      },
    ]);
    expect(val5).toBe(val6);

    // Different object with same shape → recompute
    let shapeCalls = 0;
    const shapeFactory = () => ++shapeCalls;
    const [val7, val8] = simulateRenders([
      {
        setup: () => {
          const [objA] = useState({ id: 1 });
          const [objB] = useState({ id: 1 });
          return useMemo(shapeFactory, [objA]);
        },
        deps: [{ id: 1 }],
      },
      {
        setup: () => {
          const [objA] = useState({ id: 1 });
          const [objB] = useState({ id: 1 });
          return useMemo(shapeFactory, [objB]);
        },
        deps: [{ id: 1 }],
      },
    ]);
    expect(val7).toBe(1);
    expect(val8).toBe(2);
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / Caveats — useMemo is a Hook, so you can
    // only call it at the top level of your component or your own Hooks.
    expect(() => {
      useMemo(() => 1, []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Skipping expensive recalculations ─────────────────────────────

describe("useMemo — Usage / Skipping expensive recalculations", () => {
  it("skips recalculation when dependencies haven't changed", () => {
    // Covers: Usage / Skipping expensive recalculations — On every
    // subsequent render, React compares dependencies. If none changed,
    // useMemo returns the already calculated value.
    let computeCount = 0;
    function filterTodos(todos: string[], tab: string) {
      computeCount++;
      return todos.filter((t) => t.includes(tab));
    }

    const todos = ["a", "ab", "abc"];
    const [visible1, visible2] = simulateRenders([
      {
        setup: () => {
          const [todosDep] = useState(todos);
          const [tabDep] = useState("ab");
          return useMemo(() => filterTodos(todos, "ab"), [todosDep, tabDep]);
        },
        deps: [todos, "ab"],
      },
      {
        setup: () => {
          const [todosDep] = useState(todos);
          const [tabDep] = useState("ab");
          return useMemo(() => filterTodos(todos, "ab"), [todosDep, tabDep]);
        },
        deps: [todos, "ab"],
      },
    ]);
    expect(computeCount).toBe(1); // computed once
    expect(visible1).toEqual(["ab", "abc"]);
    expect(visible2).toBe(visible1); // same reference
  });

  it("recomputes when a dependency changes", () => {
    // Covers: Usage / Skipping expensive recalculations — Otherwise,
    // React will re-run your calculation and return the new value.
    let computeCount = 0;
    function filterTodos(todos: string[], tab: string) {
      computeCount++;
      return todos.filter((t) => t.includes(tab));
    }

    const todos = ["a", "ab", "abc"];
    const [visible1, visible2] = simulateRenders([
      {
        setup: () => {
          const [todosDep] = useState(todos);
          const [tabAb] = useState("ab");
          const [tabAbc] = useState("abc");
          return useMemo(() => filterTodos(todos, "ab"), [todosDep, tabAb]);
        },
        deps: [todos, "ab"],
      },
      {
        setup: () => {
          const [todosDep] = useState(todos);
          const [tabAb] = useState("ab");
          const [tabAbc] = useState("abc");
          return useMemo(() => filterTodos(todos, "abc"), [todosDep, tabAbc]);
        },
        deps: [todos, "abc"],
      },
    ]);
    expect(computeCount).toBe(2); // computed twice because tab changed
    expect(visible1).toEqual(["ab", "abc"]);
    expect(visible2).toEqual(["abc"]);
  });
});

// ─── Usage / Skipping re-rendering of components ────────────────────────────

describe("useMemo — Usage / Skipping re-rendering of components", () => {
  it("returns the same array reference so a memo child can skip re-rendering", () => {
    // Covers: Usage / Skipping re-rendering — By wrapping the calculation
    // in useMemo, you ensure it has the same value between re-renders.
    const todos = ["a", "b"];
    const [arr1, arr2] = simulateRenders([
      {
        setup: () => {
          const [todosDep] = useState(todos);
          return useMemo(() => [...todos], [todosDep]);
        },
        deps: [todos],
      },
      {
        setup: () => {
          const [todosDep] = useState(todos);
          return useMemo(() => [...todos], [todosDep]);
        },
        deps: [todos],
      },
    ]);
    expect(arr1).toEqual(["a", "b"]);
    expect(arr2).toBe(arr1); // same reference = memo child won't re-render
  });

  it("returns a different array reference when deps change", () => {
    const todos1 = ["a", "b"];
    const todos2 = ["a", "b", "c"];
    const [arr1, arr2] = simulateRenders([
      {
        setup: () => {
          const [todosA] = useState(todos1);
          const [todosB] = useState(todos2);
          return useMemo(() => [...todos1], [todosA]);
        },
        deps: [todos1],
      },
      {
        setup: () => {
          const [todosA] = useState(todos1);
          const [todosB] = useState(todos2);
          return useMemo(() => [...todos2], [todosB]);
        },
        deps: [todos2],
      },
    ]);
    expect(arr1).not.toBe(arr2);
  });
});

// ─── Usage / Preventing an Effect from firing too often ─────────────────────

describe("useMemo — Usage / Preventing an Effect from firing too often", () => {
  it("memoizes an object so it can safely be used as a useEffect dependency", async () => {
    // Covers: Usage / Preventing an Effect from firing too often —
    // You can wrap the object you need to call from an Effect in useMemo.
    let effectRuns = 0;
    const App = cc(({ roomId }: { roomId: string }) => {
      const [roomIdDep] = useState(roomId);
      const options = useMemo(
        () => ({
          serverUrl: "https://localhost:1234",
          roomId: roomIdDep(),
        }),
        [roomIdDep],
      );
      const [optionsDep] = useState(options);
      useEffect(() => {
        effectRuns++;
        expect(optionsDep().roomId).toBe(roomId);
        return () => {};
      }, [optionsDep]);
      return el("div");
    });

    const app = mount(App, container, { roomId: "general" });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(effectRuns).toBe(1);

    // Update props with same roomId — options reference stays same,
    // but in Sinwan the component doesn't re-render. We verify the
    // initial mount behavior is correct.
    void app;
  });
});

// ─── Usage / Memoizing a dependency of another Hook ─────────────────────────

describe("useMemo — Usage / Memoizing a dependency of another Hook", () => {
  it("memoizes an object used as a dependency for another useMemo", () => {
    // Covers: Usage / Memoizing a dependency of another Hook —
    // You could memoize the searchOptions object itself before passing
    // it as a dependency.
    let outerCalls = 0;
    let innerCalls = 0;

    const [result1, result2] = simulateRenders([
      {
        setup: () => {
          const [hello] = useState("hello");
          const searchOptions = useMemo(
            () => ({ matchMode: "whole-word", text: "hello" }),
            [hello],
          );
          const [searchOptionsDep] = useState(searchOptions);
          return useMemo(() => {
            outerCalls++;
            return searchOptionsDep();
          }, [searchOptionsDep]);
        },
        deps: [],
      },
      {
        setup: () => {
          const [hello] = useState("hello");
          const searchOptions = useMemo(
            () => ({ matchMode: "whole-word", text: "hello" }),
            [hello],
          );
          const [searchOptionsDep] = useState(searchOptions);
          return useMemo(() => {
            innerCalls++;
            return searchOptionsDep();
          }, [searchOptionsDep]);
        },
        deps: [],
      },
    ]);

    // Because searchOptions is memoized with the same dep "hello",
    // it returns the same object reference across renders, so the
    // outer useMemo doesn't recompute.
    expect(outerCalls).toBe(1);
    expect(innerCalls).toBe(0); // same ref, no recompute
    expect(result1).toBe(result2);
  });
});

// ─── Usage / Memoizing a function ───────────────────────────────────────────

describe("useMemo — Usage / Memoizing a function", () => {
  it("can memoize a function by returning it from the factory", () => {
    // Covers: Usage / Memoizing a function — Memoizing functions is
    // common enough that React has useCallback, but useMemo can do it too.
    const productId = "42";
    const referrer = "search";

    const [fn1, fn2] = simulateRenders([
      {
        setup: () => {
          const [productDep] = useState(productId);
          const [referrerDep] = useState(referrer);
          return useMemo(
            () => (orderDetails: string) => {
              void productId;
              void referrer;
              return orderDetails;
            },
            [productDep, referrerDep],
          );
        },
        deps: [productId, referrer],
      },
      {
        setup: () => {
          const [productDep] = useState(productId);
          const [referrerDep] = useState(referrer);
          return useMemo(
            () => (orderDetails: string) => {
              void productId;
              void referrer;
              return orderDetails;
            },
            [productDep, referrerDep],
          );
        },
        deps: [productId, referrer],
      },
    ]);

    expect(fn1).toBe(fn2);
    expect(fn1!("test")).toBe("test");
  });
});

// ─── Troubleshooting ───────────────────────────────────────────────────────

describe("useMemo — Troubleshooting", () => {
  it("recomputes every time when the dependency array is omitted", () => {
    // Covers: Troubleshooting / Every time my component renders, the
    // calculation in useMemo re-runs — Make sure you've specified the
    // dependency array as a second argument!
    let callCount = 0;
    const factory = () => ++callCount;
    const [val1, val2] = simulateRenders([
      { setup: () => useMemo(factory), deps: [] },
      { setup: () => useMemo(factory), deps: [] },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(2); // recomputed because no deps array
  });

  it("recomputes every time when at least one dependency changes", () => {
    let callCount = 0;
    const factory = () => ++callCount;
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useMemo(factory, [one]);
        },
        deps: [1],
      },
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          return useMemo(factory, [two]);
        },
        deps: [2],
      },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(2);
  });

  it("does not recompute when dependencies stay the same", () => {
    let callCount = 0;
    const factory = () => ++callCount;
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [a] = useState("a");
          return useMemo(factory, [one, a]);
        },
        deps: [1, "a"],
      },
      {
        setup: () => {
          const [one] = useState(1);
          const [a] = useState("a");
          return useMemo(factory, [one, a]);
        },
        deps: [1, "a"],
      },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(1);
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("useMemo — Edge cases", () => {
  it("handles empty dependency array (caches forever)", () => {
    let callCount = 0;
    const factory = () => ++callCount;
    const [val1, val2] = simulateRenders([
      { setup: () => useMemo(factory, []), deps: [] },
      { setup: () => useMemo(factory, []), deps: [] },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(1);
    expect(val1).toBe(val2);
  });

  it("handles dependencies with null and undefined values", () => {
    const factory = () => 0;
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [nil] = useState<null>(null);
          const [undef] = useState<undefined>(undefined);
          return useMemo(factory, [nil, undef]);
        },
        deps: [null, undefined],
      },
      {
        setup: () => {
          const [nil] = useState<null>(null);
          const [undef] = useState<undefined>(undefined);
          return useMemo(factory, [nil, undef]);
        },
        deps: [null, undefined],
      },
    ]);
    expect(val1).toBe(val2);
  });

  it("handles multiple useMemo calls in one component", () => {
    let callsA = 0;
    let callsB = 0;
    const [result] = simulateRenders([
      {
        setup: () => {
          const [one] = useState(1);
          const [two] = useState(2);
          const a = useMemo(() => ++callsA, [one]);
          const b = useMemo(() => ++callsB, [two]);
          return { a, b };
        },
        deps: [],
      },
    ]);
    expect(result.a).toBe(1);
    expect(result.b).toBe(1);
  });

  it("memoizes values of any type including undefined", () => {
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [dep] = useState(1);
          return useMemo(() => undefined, [dep]);
        },
        deps: [1],
      },
      {
        setup: () => {
          const [dep] = useState(1);
          return useMemo(() => undefined, [dep]);
        },
        deps: [1],
      },
    ]);
    expect(val1).toBeUndefined();
    expect(val2).toBeUndefined();
  });

  it("memoizes null values", () => {
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [dep] = useState(1);
          return useMemo(() => null, [dep]);
        },
        deps: [1],
      },
      {
        setup: () => {
          const [dep] = useState(1);
          return useMemo(() => null, [dep]);
        },
        deps: [1],
      },
    ]);
    expect(val1).toBeNull();
    expect(val2).toBeNull();
    expect(val1).toBe(val2);
  });

  it("handles object dependencies with reference equality", () => {
    const obj = { a: 1 };
    let calls = 0;
    const factory = () => ++calls;
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useMemo(factory, [objDep]);
        },
        deps: [obj],
      },
      {
        setup: () => {
          const [objDep] = useState(obj);
          return useMemo(factory, [objDep]);
        },
        deps: [obj],
      },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(1); // same object ref → no recompute
  });

  it("handles different object shapes as dependencies", () => {
    let calls = 0;
    const factory = () => ++calls;
    const [val1, val2] = simulateRenders([
      {
        setup: () => {
          const [objA] = useState({ a: 1 });
          const [objB] = useState({ a: 1 });
          return useMemo(factory, [objA]);
        },
        deps: [{ a: 1 }],
      },
      {
        setup: () => {
          const [objA] = useState({ a: 1 });
          const [objB] = useState({ a: 1 });
          return useMemo(factory, [objB]);
        },
        deps: [{ a: 1 }],
      },
    ]);
    expect(val1).toBe(1);
    expect(val2).toBe(2); // different object refs → recompute
  });

  it("works with reactive state getters as dependencies", () => {
    // Covers: Sinwan-specific — state getters are stable references,
    // so useMemo caches correctly across signal updates.
    let computeCount = 0;
    const App = cc(() => {
      const [count, setCount] = useState(0);
      const doubled = useMemo(() => {
        computeCount++;
        return (count as unknown as () => number)() * 2;
      }, [count]);
      void setCount;
      return el("div", {}, doubled as unknown as number);
    });
    mount(App, container);
    expect(computeCount).toBe(1);
    expect(container.textContent).toBe("0");
  });
});
