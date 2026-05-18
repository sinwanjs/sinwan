/**
 * Comprehensive tests for `useOptimistic`.
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
  useOptimistic,
  useState,
  startTransition,
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

/** Wait for the next microtask flush. */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Simulate multiple renders of a component by resetting the hook cursor. */
function simulateRenders<T>(renders: { setup: () => T }[]): T[] {
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

describe("useOptimistic — Reference", () => {
  it("accepts a passthrough value and an optional reducer", () => {
    const App = cc(() => {
      useOptimistic(0);
      useOptimistic(0, (s, a) => s + a);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns an array with exactly two items", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic("hello");
      return el("div");
    });
    mount(App, container);
    expect(Array.isArray(api)).toBe(true);
    expect(api.length).toBe(2);
  });

  it("returns the passthrough value as the initial optimistic state", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic([1, 2, 3]);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual([1, 2, 3]);
  });

  it("returns a setter function as the second item", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(0);
      return el("div");
    });
    mount(App, container);
    expect(typeof api[1]).toBe("function");
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useOptimistic(0);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Adding optimistic state to a component ─────────────────────────

describe("useOptimistic — Usage / Adding optimistic state", () => {
  it("without reducer, setter replaces the optimistic state directly", async () => {
    let setter: any;
    let getter: any;
    const App = cc(() => {
      const [optimistic, setOptimistic] = useOptimistic("Alice");
      getter = optimistic;
      setter = setOptimistic;
      return el("div", {}, optimistic as unknown as string);
    });
    mount(App, container);
    expect(container.textContent).toBe("Alice");

    setter("Bob");
    expect(getter()).toBe("Bob");
    await tick();
    expect(container.textContent).toBe("Bob");
  });

  it("with reducer, setter passes action to the reducer", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic([1, 2], (current: number[], next: number) => [
        ...current,
        next,
      ]);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual([1, 2]);

    api[1](3);
    expect(api[0]()).toEqual([1, 2, 3]);
  });

  it("can be called multiple times in one component", () => {
    let ageApi: any;
    let nameApi: any;
    const App = cc(() => {
      ageApi = useOptimistic(28);
      nameApi = useOptimistic("Alice");
      return el("div");
    });
    mount(App, container);
    expect(ageApi[0]()).toBe(28);
    expect(nameApi[0]()).toBe("Alice");
  });
});

// ─── Usage / Using optimistic state in Action props ─────────────────────────

describe("useOptimistic — Usage / Using optimistic state in Action props", () => {
  it("shows optimistic pending state immediately inside a transition", async () => {
    let setter: any;
    let getter: any;
    const App = cc(() => {
      const [optimistic, setOptimistic] = useOptimistic("idle");
      getter = optimistic;
      setter = setOptimistic;
      return el("div", {}, optimistic as unknown as string);
    });
    mount(App, container);
    expect(container.textContent).toBe("idle");

    startTransition(async () => {
      setter("submitting");
    });
    expect(getter()).toBe("submitting");
    await tick();
    expect(container.textContent).toBe("submitting");
  });
});

// ─── Usage / Updating props or state optimistically ─────────────────────────

describe("useOptimistic — Usage / Updating props or state optimistically", () => {
  it("immediately toggles the displayed value when setter is called", async () => {
    let setter: any;
    let getter: any;
    const App = cc(() => {
      const [optimistic, setOptimistic] = useOptimistic("off");
      getter = optimistic;
      setter = setOptimistic;
      return el("div", {}, optimistic as unknown as string);
    });
    mount(App, container);
    expect(container.textContent).toBe("off");

    setter("on");
    expect(getter()).toBe("on");
    await tick();
    expect(container.textContent).toBe("on");
  });

  it("supports updater functions for relative updates", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(5);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBe(5);

    api[1]((prev: number) => prev + 3);
    expect(api[0]()).toBe(8);

    api[1]((prev: number) => prev * 2);
    expect(api[0]()).toBe(16);
  });
});

// ─── Usage / Updating multiple values together ──────────────────────────────

describe("useOptimistic — Usage / Updating multiple values together", () => {
  it("reducer keeps related values in sync during optimistic update", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(
        { isFollowing: false, followerCount: 100 },
        (current, isFollowing: boolean) => ({
          isFollowing,
          followerCount: current.followerCount + (isFollowing ? 1 : -1),
        }),
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual({ isFollowing: false, followerCount: 100 });

    api[1](true);
    expect(api[0]()).toEqual({ isFollowing: true, followerCount: 101 });

    api[1](false);
    expect(api[0]()).toEqual({ isFollowing: false, followerCount: 100 });
  });
});

// ─── Usage / Optimistically adding to a list ────────────────────────────────

describe("useOptimistic — Usage / Optimistically adding to a list", () => {
  it("reducer appends items optimistically", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(
        [{ id: 1, text: "Learn React" }],
        (current: any[], newTodo: any) => [
          ...current,
          { id: newTodo.id, text: newTodo.text, pending: true },
        ],
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual([{ id: 1, text: "Learn React" }]);

    api[1]({ id: 2, text: "Build app" });
    expect(api[0]()).toEqual([
      { id: 1, text: "Learn React" },
      { id: 2, text: "Build app", pending: true },
    ]);
  });
});

// ─── Usage / Handling multiple action types ─────────────────────────────────

describe("useOptimistic — Usage / Handling multiple action types", () => {
  it("reducer handles different action objects", () => {
    type CartItem = {
      id: number;
      name: string;
      quantity: number;
      pending?: boolean;
    };
    type Action =
      | { type: "add"; item: { id: number; name: string } }
      | { type: "remove"; id: number }
      | { type: "update_quantity"; id: number; quantity: number };

    let api: any;
    const App = cc(() => {
      api = useOptimistic(
        [] as CartItem[],
        (current: CartItem[], action: Action) => {
          switch (action.type) {
            case "add": {
              const exists = current.find((i) => i.id === action.item.id);
              if (exists) {
                return current.map((item) =>
                  item.id === action.item.id
                    ? { ...item, quantity: item.quantity + 1, pending: true }
                    : item,
                );
              }
              return [
                ...current,
                { ...action.item, quantity: 1, pending: true },
              ];
            }
            case "remove":
              return current.filter((item) => item.id !== action.id);
            case "update_quantity":
              return current.map((item) =>
                item.id === action.id
                  ? { ...item, quantity: action.quantity, pending: true }
                  : item,
              );
            default:
              return current;
          }
        },
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual([]);

    api[1]({ type: "add", item: { id: 1, name: "T-Shirt" } });
    expect(api[0]()).toEqual([
      { id: 1, name: "T-Shirt", quantity: 1, pending: true },
    ]);

    api[1]({ type: "add", item: { id: 1, name: "T-Shirt" } });
    expect(api[0]()).toEqual([
      { id: 1, name: "T-Shirt", quantity: 2, pending: true },
    ]);

    api[1]({ type: "update_quantity", id: 1, quantity: 5 });
    expect(api[0]()).toEqual([
      { id: 1, name: "T-Shirt", quantity: 5, pending: true },
    ]);

    api[1]({ type: "remove", id: 1 });
    expect(api[0]()).toEqual([]);
  });
});

// ─── Troubleshooting ────────────────────────────────────────────────────────

describe("useOptimistic — Troubleshooting", () => {
  it("resets to passthrough when the upstream value changes", () => {
    const results = simulateRenders([
      {
        setup: () => {
          const api = useOptimistic(0, (s: number, n: number) => s + n);
          api[1](5);
          return api[0]();
        },
      },
      {
        setup: () => {
          const api = useOptimistic(10, (s: number, n: number) => s + n);
          return api[0]();
        },
      },
    ]);

    expect(results[0]).toBe(5);
    expect(results[1]).toBe(10);
  });

  it("resets without reducer when passthrough changes", () => {
    const results = simulateRenders([
      {
        setup: () => {
          const api = useOptimistic("Alice");
          api[1]("Charlie");
          return api[0]();
        },
      },
      {
        setup: () => {
          const api = useOptimistic("Bob");
          return api[0]();
        },
      },
    ]);

    expect(results[0]).toBe("Charlie");
    expect(results[1]).toBe("Bob");
  });

  it("does not reset when passthrough stays the same reference", () => {
    const obj = { id: 1 };
    const [api1, api2] = simulateRenders([
      {
        setup: () => {
          const api = useOptimistic(obj, (s: any, n: any) => ({ ...s, ...n }));
          api[1]({ name: "Alice" });
          return api;
        },
      },
      {
        setup: () => {
          const api = useOptimistic(obj, (s: any, n: any) => ({ ...s, ...n }));
          return api;
        },
      },
    ]);

    // Same object reference → state should be preserved across simulated renders
    expect(api2[0]()).toEqual({ id: 1, name: "Alice" });
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("useOptimistic — Edge cases", () => {
  it("handles undefined as a passthrough value", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(undefined);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBeUndefined();

    api[1]("defined");
    expect(api[0]()).toBe("defined");
  });

  it("handles null as a passthrough value", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(null);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBeNull();

    api[1]("value");
    expect(api[0]()).toBe("value");
  });

  it("handles boolean passthrough and updates", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(false);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBe(false);

    api[1](true);
    expect(api[0]()).toBe(true);

    api[1](false);
    expect(api[0]()).toBe(false);
  });

  it("handles object passthrough and reducer mutations", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(
        { count: 0 },
        (current: { count: number }, delta: number) => ({
          count: current.count + delta,
        }),
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual({ count: 0 });

    api[1](5);
    expect(api[0]()).toEqual({ count: 5 });
  });

  it("getter returns the latest value after multiple updates", () => {
    const [api] = simulateRenders([
      {
        setup: () => {
          const api = useOptimistic(0);
          api[1](1);
          api[1](2);
          api[1](3);
          return api;
        },
      },
    ]);

    expect(api[0]()).toBe(3);
  });

  it("works with useState getter as passthrough source", async () => {
    let stateApi: any;
    let optimisticSetter: any;
    let optimisticGetter: any;
    const App = cc(() => {
      const [count] = useState(0);
      stateApi = count;
      const [optimistic, setOptimistic] = useOptimistic(count());
      optimisticSetter = setOptimistic;
      optimisticGetter = optimistic;
      return el("div", {}, optimistic as unknown as number);
    });
    mount(App, container);
    expect(container.textContent).toBe("0");

    optimisticSetter(10);
    expect(optimisticGetter()).toBe(10);
    await tick();
    expect(container.textContent).toBe("10");
  });

  it("supports nested updater functions", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(0);
      return el("div");
    });
    mount(App, container);

    api[1]((prev: number) => prev + 1);
    expect(api[0]()).toBe(1);

    api[1]((prev: number) => prev + 1);
    expect(api[0]()).toBe(2);
  });

  it("does not treat non-function values as updaters when reducer is provided", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic(
        [1, 2],
        (
          current: number[],
          action: number | ((prev: number[]) => number[]),
        ) => {
          if (typeof action === "function") {
            return (action as (prev: number[]) => number[])(current);
          }
          return [...current, action as number];
        },
      );
      return el("div");
    });
    mount(App, container);

    api[1](3);
    expect(api[0]()).toEqual([1, 2, 3]);

    api[1]((prev: number[]) => [...prev, 4]);
    expect(api[0]()).toEqual([1, 2, 3, 4]);
  });
});
