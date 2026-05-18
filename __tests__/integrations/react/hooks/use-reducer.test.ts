/**
 * Comprehensive tests for `useReducer`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useReducer` is backed by a signal, so state updates are
 * synchronous (unlike React's batched re-render model). The getter returned
 * by `useReducer` always reads the live signal value.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useReducer,
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
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ────────────────────────────────────────────────────────────────

describe("useReducer — Reference", () => {
  it("accepts a reducer, an initial argument, and an optional initializer", () => {
    const App = cc(() => {
      useReducer((n: number) => n, 0);
      useReducer(
        (n: number) => n,
        0,
        (n) => n * 2,
      );
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns a state getter and a dispatch function", () => {
    let api: any;
    const App = cc(() => {
      api = useReducer((n: number, a: number) => n + a, 0);
      return el("div");
    });
    mount(App, container);
    const [state, dispatch] = api;
    expect(typeof state).toBe("function");
    expect(typeof dispatch).toBe("function");
  });

  it("initial state is initialArg when no init is provided", () => {
    let state: any;
    const App = cc(() => {
      [state] = useReducer((n: number) => n, 42);
      return el("div");
    });
    mount(App, container);
    expect(state()).toBe(42);
  });

  it("initial state is init(initialArg) when init is provided", () => {
    let state: any;
    const App = cc(() => {
      [state] = useReducer(
        (n: number) => n,
        5,
        (n) => n * 10,
      );
      return el("div");
    });
    mount(App, container);
    expect(state()).toBe(50);
  });

  it("dispatch has a stable identity across accesses", () => {
    let d1: any;
    let d2: any;
    const App = cc(() => {
      const [, d] = useReducer((n: number) => n, 0);
      d1 = d;
      d2 = d;
      return el("div");
    });
    mount(App, container);
    expect(d1).toBe(d2);
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useReducer((n: number) => n, 0);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Adding a reducer to a component ────────────────────────────────

describe("useReducer — Usage / Adding a reducer to a component", () => {
  it("manages state with a reducer and dispatches actions", async () => {
    let state: any;
    let dispatch: any;
    const App = cc(() => {
      [state, dispatch] = useReducer(
        (n: number, a: "inc" | "dec") => (a === "inc" ? n + 1 : n - 1),
        0,
      );
      return el("span", {}, state);
    });
    mount(App, container);

    expect((container as any).textContent).toBe("0");

    dispatch("inc");
    await tick();
    expect((container as any).textContent).toBe("1");

    dispatch("inc");
    await tick();
    expect((container as any).textContent).toBe("2");

    dispatch("dec");
    await tick();
    expect((container as any).textContent).toBe("1");
  });

  it("works with object state", async () => {
    type State = { age: number };
    type Action = { type: "incremented_age" };

    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (s: State, a: Action) => {
          if (a.type === "incremented_age") {
            return { age: s.age + 1 };
          }
          throw new Error("Unknown action.");
        },
        { age: 42 },
      );
      const age = () => state().age;
      return el("p", {}, "Hello! You are ", age, ".");
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Hello! You are 42.");

    dispatch({ type: "incremented_age" });
    await tick();
    expect((container as any).textContent).toBe("Hello! You are 43.");
  });
});

// ─── Usage / Writing the reducer function ───────────────────────────────────

describe("useReducer — Usage / Writing the reducer function", () => {
  it("handles multiple action types via a switch", () => {
    type State = { name: string; age: number };
    type Action =
      | { type: "incremented_age" }
      | { type: "changed_name"; nextName: string };

    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (s: State, a: Action) => {
          switch (a.type) {
            case "incremented_age":
              return { name: s.name, age: s.age + 1 };
            case "changed_name":
              return { name: a.nextName, age: s.age };
          }
          throw new Error("Unknown action: " + (a as any).type);
        },
        { name: "Taylor", age: 42 },
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toEqual({ name: "Taylor", age: 42 });

    dispatch({ type: "incremented_age" });
    expect(state()).toEqual({ name: "Taylor", age: 43 });

    dispatch({ type: "changed_name", nextName: "Alex" });
    expect(state()).toEqual({ name: "Alex", age: 43 });
  });

  it("manages array state without mutation", () => {
    type Task = { id: number; text: string };
    type Action =
      | { type: "added"; id: number; text: string }
      | { type: "deleted"; id: number };

    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (tasks: Task[], a: Action) => {
          switch (a.type) {
            case "added":
              return [...tasks, { id: a.id, text: a.text }];
            case "deleted":
              return tasks.filter((t: Task) => t.id !== a.id);
          }
          throw new Error("Unknown action: " + (a as any).type);
        },
        [
          { id: 0, text: "A" },
          { id: 1, text: "B" },
        ],
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toHaveLength(2);

    dispatch({ type: "added", id: 2, text: "C" });
    expect(state()).toHaveLength(3);
    expect(state()[2]).toEqual({ id: 2, text: "C" });

    dispatch({ type: "deleted", id: 1 });
    expect(state()).toHaveLength(2);
    expect(state().every((t: Task) => t.id !== 1)).toBe(true);
  });
});

// ─── Usage / Avoiding recreating the initial state ───────────────────────────

describe("useReducer — Usage / Avoiding recreating the initial state", () => {
  it("only calls the initializer once when passed as third argument", () => {
    let initCalls = 0;
    const init = (username: string) => {
      initCalls++;
      return { draft: "", todos: [username] };
    };

    let state: any;
    const App = cc(() => {
      [state] = useReducer<any, any>(
        (s: any, a: any) => s,
        "Taylor",
        init as any,
      );
      return el("div");
    });

    mount(App, container);
    expect(initCalls).toBe(1);
    expect(state()).toEqual({ draft: "", todos: ["Taylor"] });
  });

  it("uses initialArg directly when no init is provided", () => {
    let state: any;
    const App = cc(() => {
      [state] = useReducer((s: number) => s, 99);
      return el("div");
    });
    mount(App, container);
    expect(state()).toBe(99);
  });
});

// ─── Dispatch caveats ─────────────────────────────────────────────────────────

describe("useReducer — Dispatch caveats", () => {
  it("dispatch returns undefined (no return value)", () => {
    let dispatch: any;
    const App = cc(() => {
      [, dispatch] = useReducer((n: number) => n, 0);
      return el("div");
    });
    mount(App, container);
    expect(dispatch("anything")).toBeUndefined();
  });

  it("dispatch identity is stable within a component instance", () => {
    let d1: any;
    let d2: any;
    const App = cc(() => {
      const [, d] = useReducer((n: number) => n, 0);
      d1 = d;
      d2 = d;
      return el("div");
    });
    mount(App, container);
    expect(d1).toBe(d2);
  });
});

// ─── Troubleshooting / I've dispatched an action, but the screen doesn't update

describe("useReducer — Troubleshooting / Screen doesn't update", () => {
  it("skips update when reducer mutates state and returns the same reference", async () => {
    let effectRuns = 0;
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (s: { age: number }, a: any) => {
          // 🚩 Wrong: mutating existing object
          if (a.type === "incremented_age") {
            s.age++;
            return s;
          }
          return s;
        },
        { age: 42 },
      );
      useEffect(() => {
        effectRuns++;
      }, [state]);
      return el("span", {}, state().age);
    });

    mount(App, container);
    await tick();
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("42");

    dispatch({ type: "incremented_age" });
    await tick();
    // Object.is check prevents update because same object ref was returned
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("42");
  });

  it("updates when reducer returns a new object", async () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (s: { age: number }, a: any) => {
          if (a.type === "incremented_age") {
            return { age: s.age + 1 };
          }
          return s;
        },
        { age: 42 },
      );
      const age = () => state().age;
      return el("span", {}, age);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("42");

    dispatch({ type: "incremented_age" });
    await tick();
    expect((container as any).textContent).toBe("43");
  });
});

// ─── Troubleshooting / State becomes undefined ──────────────────────────────

describe("useReducer — Troubleshooting / State becomes undefined", () => {
  it("state becomes partial when ...state is forgotten", () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        ((s: { name: string; age: number }, a: any) => {
          if (a.type === "incremented_age") {
            // 🚩 Forgot ...state
            return { age: s.age + 1 };
          }
          return s;
        }) as any,
        { name: "Taylor", age: 42 },
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toEqual({ name: "Taylor", age: 42 });

    dispatch({ type: "incremented_age" });
    expect(state()).toEqual({ age: 43 }); // name dropped
  });

  it("state becomes undefined when a case forgets to return", () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        ((s: number | undefined, a: any) => {
          switch (a.type) {
            case "set":
              return a.value;
            case "bad":
            // forgot return
          }
          // No fallback return → implicit undefined
        }) as any,
        0,
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toBe(0);

    dispatch({ type: "bad" });
    expect(state()).toBeUndefined();
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useReducer — Edge cases", () => {
  it("bails out when next state equals current state via Object.is", async () => {
    let state: any;
    let dispatch: any;
    let effectRuns = 0;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (n: number, a: number) => (a === 0 ? n : a),
        5,
      );
      useEffect(() => {
        effectRuns++;
      }, [state]);
      return el("span", {}, state);
    });

    mount(App, container);
    await tick();
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("5");

    // dispatch same value — Object.is(5, 5) → bail out
    dispatch(5);
    await tick();
    expect(effectRuns).toBe(1);

    // dispatch different value
    dispatch(10);
    await tick();
    expect((container as any).textContent).toBe("10");
    expect(effectRuns).toBe(2);
  });

  it("handles NaN state correctly (Object.is(NaN, NaN) is true)", () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer((_n: number, a: number) => a, NaN);
      return el("div");
    });

    mount(App, container);
    expect(state()).toBeNaN();

    dispatch(NaN);
    expect(state()).toBeNaN();
  });

  it("supports multiple independent reducers in one component", () => {
    let s1: any, d1: any;
    let s2: any, d2: any;

    const App = cc(() => {
      [s1, d1] = useReducer((n: number, a: number) => n + a, 0);
      [s2, d2] = useReducer((n: number, a: number) => n * a, 1);
      return el("div");
    });

    mount(App, container);
    expect(s1()).toBe(0);
    expect(s2()).toBe(1);

    d1(5);
    expect(s1()).toBe(5);
    expect(s2()).toBe(1); // unaffected

    d2(3);
    expect(s1()).toBe(5);
    expect(s2()).toBe(3);
  });

  it("calls reducer with current state and action", () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer(
        (s: number[], a: number) => [...s, a],
        [] as number[],
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toEqual([]);

    dispatch(1);
    expect(state()).toEqual([1]);

    dispatch(2);
    expect(state()).toEqual([1, 2]);
  });

  it("handles init with null initialArg", () => {
    let state: any;

    const App = cc(() => {
      [state] = useReducer(
        (s: number[] | null, a: any) => s,
        null,
        () => [1, 2, 3],
      );
      return el("div");
    });

    mount(App, container);
    expect(state()).toEqual([1, 2, 3]);
  });

  it("survives rapid dispatches in a tight loop", async () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer((n: number, a: number) => n + a, 0);
      return el("div");
    });

    mount(App, container);

    for (let i = 1; i <= 500; i++) {
      dispatch(1);
    }

    await tick();
    expect(state()).toBe(500);
  });

  it("getter supports implicit coercion via valueOf/toPrimitive", () => {
    let state: any;

    const App = cc(() => {
      [state] = useReducer((n: number, a: number) => n + a, 10);
      return el("div");
    });

    mount(App, container);
    // Sinwan state getters support arithmetic via valueOf / Symbol.toPrimitive
    expect((state as any).valueOf()).toBe(10);
    expect(Number(state)).toBe(10);
    expect(String(state)).toBe("10");
  });
});
