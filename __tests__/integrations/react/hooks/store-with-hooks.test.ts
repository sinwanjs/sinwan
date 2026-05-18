/**
 * Store + React Hooks Integration Tests
 *
 * Tests that Sinwan stores (createStore, createMutable, produce, reconcile)
 * work correctly with React-compatible hooks (useState, useEffect, useLayoutEffect,
 * useMemo, useRef, useReducer) inside Sinwan components.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { effect } from "../../../../src/reactivity/effect.ts";
import { nextTick } from "../../../../src/reactivity/scheduler.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
} from "../../../../src/integrations/react/_client.ts";
import {
  createStore,
  createMutable,
  modifyMutable,
  produce,
  reconcile,
  unwrap,
} from "../../../../src/store/index.ts";

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

// ─── createStore + useEffect ────────────────────────────────────────────────

describe("Store + useEffect", () => {
  it("useEffect observes store changes via effect", async () => {
    const [state, setState] = createStore({ count: 0 });
    const log: number[] = [];

    const App = cc(() => {
      useEffect(() => {
        // Subscribe to store reactively via Sinwan effect
        const dispose = (() => {
          let d: (() => void) | undefined;
          effect(() => {
            log.push(state.count);
          });
          return d;
        })();
        return () => dispose?.();
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual([0]);

    setState("count", 5);
    await nextTick();
    expect(log).toEqual([0, 5]);

    setState("count", (prev) => prev + 1);
    await nextTick();
    expect(log).toEqual([0, 5, 6]);
  });

  it("useEffect cleanup runs when component unmounts with active store", async () => {
    const [state, setState] = createStore({ value: "hello" });
    let cleanedUp = false;

    const App = cc(() => {
      useEffect(() => {
        // Simulate subscribing to store
        const _ = state.value;
        return () => {
          cleanedUp = true;
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    await tick();
    expect(cleanedUp).toBe(false);

    app.unmount();
    expect(cleanedUp).toBe(true);
  });

  it("useEffect reacts to store path updates", async () => {
    const [state, setState] = createStore({
      user: { name: "Alice", age: 25 },
    });
    const names: string[] = [];

    const App = cc(() => {
      useEffect(() => {
        effect(() => {
          names.push(state.user.name);
        });
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(names).toEqual(["Alice"]);

    setState("user", "name", "Bob");
    await nextTick();
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

// ─── createMutable + useEffect ──────────────────────────────────────────────

describe("Mutable Store + useEffect", () => {
  it("useEffect captures mutable store changes", async () => {
    const state = createMutable({ items: ["a", "b"] });
    const snapshots: string[][] = [];

    const App = cc(() => {
      useEffect(() => {
        effect(() => {
          snapshots.push([...state.items]);
        });
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(snapshots).toEqual([["a", "b"]]);

    state.items.push("c");
    await nextTick();
    expect(snapshots[snapshots.length - 1]).toEqual(["a", "b", "c"]);
  });

  it("direct property assignment triggers effect inside useEffect", async () => {
    const state = createMutable({ count: 0 });
    const log: number[] = [];

    const App = cc(() => {
      useEffect(() => {
        effect(() => {
          log.push(state.count);
        });
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual([0]);

    state.count = 10;
    await nextTick();
    expect(log).toEqual([0, 10]);

    state.count = 20;
    await nextTick();
    expect(log).toEqual([0, 10, 20]);
  });
});

// ─── Store + useState ───────────────────────────────────────────────────────

describe("Store + useState", () => {
  it("useState can hold a store reference", () => {
    const [store] = createStore({ name: "Sinwan" });
    let storeRef: any;

    const App = cc(() => {
      const [getStore] = useState(store);
      storeRef = getStore;
      return el("div");
    });

    mount(App, container);
    expect(storeRef()).toBe(store);
    expect(storeRef().name).toBe("Sinwan");
  });

  it("setState triggers DOM update while store provides data", async () => {
    const [store, setStore] = createStore({ label: "hello" });
    let setFlag: any;

    const App = cc(() => {
      const [flag, _setFlag] = useState(false);
      setFlag = _setFlag;
      const text = () => (flag() ? store.label : "hidden");
      return el("span", {}, text);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("hidden");

    setFlag(true);
    await tick();
    expect((container as any).textContent).toBe("hello");

    setStore("label", "world");
    await nextTick();
    expect((container as any).textContent).toBe("world");
  });

  it("store update and useState update work together", async () => {
    const state = createMutable({ multiplier: 2 });
    let setBase: any;

    const App = cc(() => {
      const [base, _setBase] = useState(5);
      setBase = _setBase;
      const result = () => base() * state.multiplier;
      return el("span", {}, result);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("10");

    setBase(10);
    await tick();
    expect((container as any).textContent).toBe("20");

    state.multiplier = 3;
    await nextTick();
    expect((container as any).textContent).toBe("30");
  });
});

// ─── Store + useLayoutEffect ────────────────────────────────────────────────

describe("Store + useLayoutEffect", () => {
  it("useLayoutEffect runs synchronously and can read store", () => {
    const [state] = createStore({ x: 42 });
    let captured: number | undefined;

    const App = cc(() => {
      useLayoutEffect(() => {
        captured = state.x;
      }, []);
      return el("div");
    });

    mount(App, container);
    // useLayoutEffect is synchronous — value should be set immediately
    expect(captured).toBe(42);
  });

  it("useLayoutEffect cleanup runs on unmount with store", () => {
    const state = createMutable({ active: true });
    let cleanedUp = false;

    const App = cc(() => {
      useLayoutEffect(() => {
        const _ = state.active;
        return () => {
          cleanedUp = true;
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    expect(cleanedUp).toBe(false);
    app.unmount();
    expect(cleanedUp).toBe(true);
  });
});

// ─── Store + useMemo ────────────────────────────────────────────────────────

describe("Store + useMemo", () => {
  it("useMemo caches computation based on store data", () => {
    const [state] = createStore({ items: [1, 2, 3, 4, 5] });
    let computeCount = 0;
    let memoResult: any;

    const App = cc(() => {
      memoResult = useMemo(() => {
        computeCount++;
        return (state.items as readonly number[]).reduce(
          (sum, n) => sum + n,
          0,
        );
      }, []);
      return el("div");
    });

    mount(App, container);
    expect(memoResult).toBe(15);
    expect(computeCount).toBe(1);
  });
});

// ─── Store + useRef ─────────────────────────────────────────────────────────

describe("Store + useRef", () => {
  it("useRef can track previous store values", async () => {
    const state = createMutable({ count: 0 });
    let prevRef: any;

    const App = cc(() => {
      prevRef = useRef(state.count);

      useEffect(() => {
        effect(() => {
          prevRef.current = state.count;
        });
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(prevRef.current).toBe(0);

    state.count = 5;
    await nextTick();
    expect(prevRef.current).toBe(5);
  });

  it("useRef stores unwrapped store snapshot", () => {
    const [state] = createStore({ nested: { value: 99 } });
    let ref: any;

    const App = cc(() => {
      ref = useRef(unwrap(state));
      return el("div");
    });

    mount(App, container);
    expect(ref.current.nested.value).toBe(99);
  });
});

// ─── Store + useReducer ─────────────────────────────────────────────────────

describe("Store + useReducer", () => {
  it("useReducer dispatch can trigger store mutations", async () => {
    const state = createMutable({ total: 0 });

    type Action = { type: "add"; amount: number } | { type: "reset" };
    function reducer(current: number, action: Action): number {
      switch (action.type) {
        case "add":
          state.total += action.amount;
          return current + action.amount;
        case "reset":
          state.total = 0;
          return 0;
      }
    }

    let dispatch: any;
    let getCount: any;

    const App = cc(() => {
      const [count, _dispatch] = useReducer(reducer, 0);
      dispatch = _dispatch;
      getCount = count;
      return el("span", {}, count);
    });

    mount(App, container);
    expect(getCount()).toBe(0);
    expect(state.total).toBe(0);

    dispatch({ type: "add", amount: 5 });
    expect(getCount()).toBe(5);
    expect(state.total).toBe(5);

    dispatch({ type: "add", amount: 3 });
    expect(getCount()).toBe(8);
    expect(state.total).toBe(8);

    dispatch({ type: "reset" });
    expect(getCount()).toBe(0);
    expect(state.total).toBe(0);
  });
});

// ─── produce + hooks ────────────────────────────────────────────────────────

describe("produce + hooks", () => {
  it("produce modifier works from within useEffect callback", async () => {
    const [state, setState] = createStore({
      todos: [
        { id: 1, text: "first", done: false },
        { id: 2, text: "second", done: false },
      ],
    });

    const App = cc(() => {
      useEffect(() => {
        // Simulate async data processing
        setState(
          produce((draft) => {
            const todo = draft.todos.find((t) => t.id === 1);
            if (todo) todo.done = true;
          }),
        );
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(state.todos[0].done).toBe(true);
    expect(state.todos[1].done).toBe(false);
  });

  it("produce inside useState updater pattern", async () => {
    const [state, setState] = createStore({
      items: [{ id: 1, name: "A" }],
    });
    let addItem: any;

    const App = cc(() => {
      addItem = (name: string) => {
        setState(
          produce((draft) => {
            draft.items.push({ id: draft.items.length + 1, name });
          }),
        );
      };
      return el("div");
    });

    mount(App, container);
    addItem("B");
    await nextTick();
    expect(state.items.length).toBe(2);
    expect(state.items[1].name).toBe("B");

    addItem("C");
    await nextTick();
    expect(state.items.length).toBe(3);
    expect(state.items[2].name).toBe("C");
  });
});

// ─── reconcile + hooks ──────────────────────────────────────────────────────

describe("reconcile + hooks", () => {
  it("reconcile updates store from simulated API response inside useEffect", async () => {
    const [state, setState] = createStore({
      users: [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    });

    const App = cc(() => {
      useEffect(() => {
        // Simulate fetching new data
        const newData = [
          { id: 1, name: "Alice Updated" },
          { id: 2, name: "Bob" },
          { id: 3, name: "Charlie" },
        ];
        setState("users", reconcile(newData, { key: "id" }));
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();

    expect(state.users.length).toBe(3);
    expect(state.users[0].name).toBe("Alice Updated");
    expect(state.users[1].name).toBe("Bob");
    expect(state.users[2].name).toBe("Charlie");
  });

  it("reconcile preserves object references for unchanged items", async () => {
    const [state, setState] = createStore({
      items: [
        { id: 1, value: "unchanged" },
        { id: 2, value: "will-change" },
      ],
    });

    const originalItem1 = unwrap(state.items[0]);

    const App = cc(() => {
      useEffect(() => {
        setState(
          "items",
          reconcile(
            [
              { id: 1, value: "unchanged" },
              { id: 2, value: "changed!" },
            ],
            { key: "id" },
          ),
        );
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();

    expect(state.items[0].value).toBe("unchanged");
    expect(state.items[1].value).toBe("changed!");
  });
});

// ─── modifyMutable + hooks ──────────────────────────────────────────────────

describe("modifyMutable + hooks", () => {
  it("modifyMutable with produce inside useEffect", async () => {
    const state = createMutable({
      counters: { a: 0, b: 0 },
    });
    const log: string[] = [];

    const App = cc(() => {
      useEffect(() => {
        effect(() => {
          log.push(`a=${state.counters.a},b=${state.counters.b}`);
        });

        modifyMutable(
          state,
          produce((draft) => {
            draft.counters.a = 10;
            draft.counters.b = 20;
          }),
        );
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    await nextTick();

    // Should have initial + updated values
    expect(log).toContain("a=0,b=0");
    expect(log).toContain("a=10,b=20");
  });

  it("modifyMutable batches updates in a single flush", async () => {
    const state = createMutable({ x: 1, y: 2 });
    let effectRuns = 0;

    const App = cc(() => {
      useEffect(() => {
        effect(() => {
          const _ = state.x + state.y;
          effectRuns++;
        });
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    const initialRuns = effectRuns;

    modifyMutable(
      state,
      produce((draft) => {
        draft.x = 100;
        draft.y = 200;
      }),
    );
    await nextTick();

    // Should only run once more (batched), not twice
    expect(effectRuns).toBe(initialRuns + 1);
  });
});

// ─── Store rendering in component templates ─────────────────────────────────

describe("Store + component rendering", () => {
  it("renders store values in DOM and updates reactively", async () => {
    const [state, setState] = createStore({ message: "Hello" });

    const App = cc(() => {
      const text = () => state.message;
      return el("p", {}, text);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Hello");

    setState("message", "World");
    await nextTick();
    expect((container as any).textContent).toBe("World");
  });

  it("renders nested store values", async () => {
    const [state, setState] = createStore({
      user: { firstName: "John", lastName: "Doe" },
    });

    const App = cc(() => {
      const fullName = () => `${state.user.firstName} ${state.user.lastName}`;
      return el("span", {}, fullName);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("John Doe");

    setState("user", "firstName", "Jane");
    await nextTick();
    expect((container as any).textContent).toBe("Jane Doe");
  });

  it("renders mutable store array length", async () => {
    const state = createMutable({ items: ["a"] });

    const App = cc(() => {
      const count = () => state.items.length;
      return el("span", {}, count);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("1");

    state.items.push("b");
    await nextTick();
    expect((container as any).textContent).toBe("2");

    state.items.push("c");
    await nextTick();
    expect((container as any).textContent).toBe("3");
  });

  it("renders computed derived from store + useState", async () => {
    const [store, setStore] = createStore({ price: 100 });
    let setQty: any;

    const App = cc(() => {
      const [qty, _setQty] = useState(2);
      setQty = _setQty;
      const total = () => store.price * qty();
      return el("span", {}, total);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("200");

    setQty(3);
    await tick();
    expect((container as any).textContent).toBe("300");

    setStore("price", 150);
    await nextTick();
    expect((container as any).textContent).toBe("450");
  });
});

// ─── unwrap + hooks ─────────────────────────────────────────────────────────

describe("unwrap + hooks", () => {
  it("unwrap inside useEffect for serialization", async () => {
    const [state] = createStore({
      data: { nested: { value: 42 } },
    });
    let serialized = "";

    const App = cc(() => {
      useEffect(() => {
        serialized = JSON.stringify(unwrap(state));
      }, []);
      return el("div");
    });

    mount(App, container);
    await tick();
    expect(serialized).toBe('{"data":{"nested":{"value":42}}}');
  });

  it("unwrapped value is plain object without proxy traps", () => {
    const [state] = createStore({ a: 1, b: { c: 2 } });
    const plain = unwrap(state);

    // Should not throw on assignment (not a read-only proxy)
    expect(() => {
      (plain as any).a = 99;
    }).not.toThrow();
    expect((plain as any).a).toBe(99);
  });
});
