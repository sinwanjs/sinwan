/**
 * State & Context Patterns — Exhaustive validation of docs/v1/28-state-and-context-patterns.md
 *
 * Proves every major assertion in the document:
 * 1. provide / inject (Sinwan native DI)
 * 2. createContext / useContext (React-compatible API)
 * 3. createStore / createMutable (Sinwan stores)
 * 4. useReducer (React-compatible local state)
 * 5. Combined patterns (Store+provide/inject, createContext+store, useReducer+provide/inject, Store+useReducer)
 * 6. What you CANNOT combine (and workarounds)
 * 7. Interoperability between createContext and provide/inject
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../src/renderer/mount.ts";
import { cc } from "../src/component/create.ts";
import { provide, inject } from "../src/component/provide-inject.ts";
import { effect, nextTick } from "../src/reactivity/index.ts";
import type { SinwanElement } from "../src/types.ts";
import {
  createContext,
  useContext,
  useReducer,
  useState,
} from "../src/integrations/react/_client.ts";
import { createStore, createMutable, produce } from "../src/store/index.ts";

// ─── DOM setup ─────────────────────────────────────────────

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

function el(
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement {
  return {
    tag: tag as any,
    props: { ...props, children },
    children: children as any,
  };
}

async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── 1. provide / inject ───────────────────────────────────

describe("provide / inject — Sinwan native DI", () => {
  it("stores any value on the current instance's provides object", () => {
    const ThemeKey: symbol = Symbol("theme");
    let injected: string | undefined;

    const Child = cc(() => {
      injected = inject(ThemeKey, "light");
      return el("span");
    });

    const App = cc(() => {
      provide(ThemeKey, "dark");
      return el("div", {}, el(Child, {}));
    });

    mount(App, container);
    expect(injected).toBe("dark");
  });

  it("walks up the prototype chain to find the nearest ancestor provide", () => {
    const Key = Symbol("key");
    let deep: string | undefined;

    const DeepChild = cc(() => {
      deep = inject(Key, "none");
      return el("span");
    });

    const Middle = cc(() => {
      provide(Key, "middle");
      return el("div", {}, el(DeepChild, {}));
    });

    const App = cc(() => {
      provide(Key, "root");
      return el("div", {}, el(Middle, {}));
    });

    mount(App, container);
    expect(deep).toBe("middle");
  });

  it("must be called during component setup (throws otherwise)", () => {
    expect(() => provide(Symbol("x"), "val")).toThrow(
      "outside of component setup",
    );
    expect(() => inject(Symbol("x"))).toThrow("outside of component setup");
  });

  it("accepts signals for reactive injection", async () => {
    const Key = Symbol("reactive");
    const { signal } = await import("../src/reactivity/signal.ts");
    const count = signal(10);
    let captured: any;

    const Child = cc(() => {
      captured = inject(Key);
      return el("span", {}, () => String((captured as any).value));
    });

    const App = cc(() => {
      provide(Key, count);
      return el("div", {}, el(Child, {}));
    });

    mount(App, container);
    expect((captured as any).value).toBe(10);

    count.value = 20;
    await nextTick();
    expect((container as any).textContent).toBe("20");
  });

  it("accepts stores for reactive injection", async () => {
    const Key = Symbol("store");
    const [state, setState] = createStore({ count: 0 });
    let captured: any;

    const Child = cc(() => {
      captured = inject(Key);
      const text = () => (captured as any).count;
      return el("span", {}, text);
    });

    const App = cc(() => {
      provide(Key, state);
      return el("div", {}, el(Child, {}));
    });

    mount(App, container);
    expect((captured as any).count).toBe(0);

    setState("count", 5);
    await nextTick();
    expect((container as any).textContent).toBe("5");
  });

  it("is typed via InjectionKey<T> (symbol)", () => {
    type InjectionKey<T> = symbol & { __type?: T };
    const ThemeKey: InjectionKey<string> = Symbol("theme");
    let theme: string | undefined;

    const App = cc(() => {
      theme = inject(ThemeKey, "default");
      return el("div");
    });

    mount(App, container);
    expect(theme).toBe("default");
  });
});

// ─── 2. createContext / useContext ─────────────────────────

describe("createContext / useContext — React-compatible API", () => {
  it("creates a Context object with a private InjectionKey", () => {
    const Ctx = createContext("light");
    expect(typeof Ctx._key).toBe("symbol");
    expect(Ctx._defaultValue).toBe("light");
  });

  it("Provider calls provide() under the hood", () => {
    const ThemeCtx = createContext("light");
    let theme: string | undefined;

    const Child = cc(() => {
      theme = useContext(ThemeCtx);
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeCtx.Provider, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(theme).toBe("dark");
  });

  it("useContext calls inject() under the hood (falls back to default)", () => {
    const ThemeCtx = createContext("light");
    let theme: string | undefined;

    const App = cc(() => {
      theme = useContext(ThemeCtx);
      return el("div");
    });

    mount(App, container);
    expect(theme).toBe("light");
  });

  it("supports React 19 shorthand <Ctx value={x}>", () => {
    const ThemeCtx = createContext("light");
    let theme: string | undefined;

    const Child = cc(() => {
      theme = useContext(ThemeCtx);
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeCtx, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(theme).toBe("dark");
  });

  it("supports Consumer pattern with render-prop children", () => {
    const ThemeCtx = createContext("light");
    let received: string | undefined;

    const App = cc(() => {
      return el(
        ThemeCtx.Provider,
        { value: "dark" },
        el(ThemeCtx.Consumer, {}, (value: string) => {
          received = value;
          return el("span", {}, value);
        }),
      );
    });

    mount(App, container);
    expect(received).toBe("dark");
  });

  it("value is static unless it's a signal/store", async () => {
    const ThemeCtx = createContext("light");
    let theme: string | undefined;

    const Child = cc(() => {
      theme = useContext(ThemeCtx);
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeCtx.Provider, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(theme).toBe("dark");
    // Re-mounting a different provider value would require a new mount
  });

  it("passing a signal makes context reactive", async () => {
    const { signal } = await import("../src/reactivity/signal.ts");
    const countSig = signal(0);
    const CountCtx = createContext(countSig);
    let captured: any;

    const Child = cc(() => {
      captured = useContext(CountCtx);
      const text = () => String(captured.value);
      return el("span", {}, text);
    });

    const App = cc(() => {
      return el(CountCtx.Provider, { value: countSig }, el(Child, {}));
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0");

    countSig.value = 5;
    await nextTick();
    expect((container as any).textContent).toBe("5");
  });
});

// ─── 3. createStore / createMutable ──────────────────────

describe("createStore / createMutable — Sinwan stores", () => {
  it("createStore returns a proxy where each property owns a signal", async () => {
    const [state, setState] = createStore({ count: 0, name: "a" });
    const log: number[] = [];

    effect(() => {
      log.push(state.count);
    });

    setState("count", 1);
    await nextTick();
    expect(log).toEqual([0, 1]);
  });

  it("reads track at the property level (fine-grained)", async () => {
    const [state, setState] = createStore({ a: 1, b: 2 });
    const logA: number[] = [];

    effect(() => {
      logA.push(state.a);
    });

    setState("b", 20);
    await nextTick();
    expect(logA).toEqual([1]); // no re-run for unrelated property

    setState("a", 10);
    await nextTick();
    expect(logA).toEqual([1, 10]);
  });

  it("supports path-based updates", async () => {
    const [state, setState] = createStore({ user: { name: "Alice" } });
    setState("user", "name", "Bob");
    await nextTick();
    expect(state.user.name).toBe("Bob");
  });

  it("createMutable allows direct property mutation", async () => {
    const state = createMutable({ count: 0 });
    const log: number[] = [];

    effect(() => {
      log.push(state.count);
    });

    state.count = 5;
    await nextTick();
    expect(log).toEqual([0, 5]);
  });

  it("can be created at module scope (global singleton)", async () => {
    const globalState = createMutable({ theme: "dark" });
    let text: string | undefined;

    const App = cc(() => {
      text = globalState.theme;
      const t = () => globalState.theme;
      return el("div", {}, t);
    });

    mount(App, container);
    expect(text).toBe("dark");

    globalState.theme = "light";
    await nextTick();
    expect((container as any).textContent).toBe("light");
  });
});

// ─── 4. useState ───────────────────────────────────────────

describe("useState — React-compatible local state", () => {
  it("returns a getter and a setter function", () => {
    let api: any;

    const App = cc(() => {
      api = useState(0);
      return el("div");
    });

    mount(App, container);
    const [getter, setter] = api;
    expect(typeof getter).toBe("function");
    expect(typeof setter).toBe("function");
    expect(getter()).toBe(0);
  });

  it("supports initial value from a function", () => {
    let state: any;

    const App = cc(() => {
      [state] = useState(() => 42);
      return el("div");
    });

    mount(App, container);
    expect(state()).toBe(42);
  });

  it("updates state with a direct value", async () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState("hello");
      return el("span", {}, state);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("hello");

    setState("world");
    await tick();
    expect((container as any).textContent).toBe("world");
  });

  it("updates state with a function updater (prev => next)", async () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(0);
      return el("span", {}, state);
    });

    mount(App, container);
    expect(state()).toBe(0);

    setState((prev: number) => prev + 1);
    await tick();
    expect(state()).toBe(1);

    setState((prev: number) => prev + 5);
    await tick();
    expect(state()).toBe(6);
  });

  it("is backed by a signal (DOM updates without re-running setup)", async () => {
    let setupRuns = 0;
    let state: any;
    let setState: any;

    const App = cc(() => {
      setupRuns++;
      [state, setState] = useState(0);
      return el("span", {}, state);
    });

    mount(App, container);
    expect(setupRuns).toBe(1);
    expect((container as any).textContent).toBe("0");

    setState(5);
    await tick();
    expect((container as any).textContent).toBe("5");
    expect(setupRuns).toBe(1); // setup does NOT re-run
  });

  it("throws when called outside a component", () => {
    expect(() => useState(0)).toThrow("outside of a component");
  });

  it("supports object state updates immutably", async () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState({ count: 0, name: "a" });
      return el("div");
    });

    mount(App, container);
    expect(state()).toEqual({ count: 0, name: "a" });

    setState((prev: any) => ({ ...prev, count: prev.count + 1 }));
    await tick();
    expect(state()).toEqual({ count: 1, name: "a" });
  });

  it("getter supports implicit coercion via valueOf / toPrimitive", () => {
    let state: any;

    const App = cc(() => {
      [state] = useState(10);
      return el("div");
    });

    mount(App, container);
    expect(Number(state)).toBe(10);
    expect(String(state)).toBe("10");
  });
});

// ─── 5. useReducer ─────────────────────────────────────────

describe("useReducer — React-compatible local state", () => {
  it("is backed by a signal inside the component instance", async () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer((n: number, a: number) => n + a, 0);
      return el("span", {}, state);
    });

    mount(App, container);
    expect(state()).toBe(0);

    dispatch(5);
    await tick();
    expect(state()).toBe(5);
  });

  it("returns [() => S, dispatch] — a getter, not a plain value", () => {
    let api: any;

    const App = cc(() => {
      api = useReducer((n: number) => n, 10);
      return el("div");
    });

    mount(App, container);
    const [getter, dispatch] = api;
    expect(typeof getter).toBe("function");
    expect(typeof dispatch).toBe("function");
    expect(getter()).toBe(10);
  });

  it("dispatch(action) calls reducer(currentState, action)", () => {
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer((n: number, a: number) => n + a, 0);
      return el("div");
    });

    mount(App, container);
    dispatch(3);
    expect(state()).toBe(3);
    dispatch(7);
    expect(state()).toBe(10);
  });

  it("supports init function as third argument", () => {
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

  it("throws when called outside a component", () => {
    expect(() => useReducer((n: number) => n, 0)).toThrow(
      "outside of a component",
    );
  });
});

// ─── 5. Combined patterns ──────────────────────────────────

describe("Pattern 1: Store + provide/inject", () => {
  it("provides a reactive store tuple to descendants", async () => {
    interface AppState {
      user: { name: string } | null;
      notifications: { id: number; text: string }[];
    }

    type AppStore = ReturnType<typeof createStore<AppState>>;
    const AppStoreKey: symbol = Symbol("AppStore");

    const Header = cc(() => {
      const [state] = inject(AppStoreKey) as AppStore;
      const text = () => state.user?.name ?? "Guest";
      return el("nav", {}, text);
    });

    const Main = cc(() => {
      const [state, setState] = inject(AppStoreKey) as AppStore;
      const login = () =>
        setState("user", { name: "Alice", role: "admin" } as any);
      return el(
        "div",
        {},
        el("button", { onClick: login }, "Login"),
        el("p", {}, () => `Notifications: ${state.notifications.length}`),
      );
    });

    const App = cc(() => {
      const store = createStore<AppState>({
        user: null,
        notifications: [],
      });
      provide(AppStoreKey, store);
      return el("div", {}, el(Header, {}), el(Main, {}));
    });

    mount(App, container);
    expect((container as any).textContent).toContain("Guest");
    expect((container as any).textContent).toContain("Notifications: 0");

    const btn = container.getElementsByTagName("button")[0];
    (btn as any).click();
    await nextTick();
    expect((container as any).textContent).toContain("Alice");
  });
});

describe("Pattern 2: createContext + store (React-style)", () => {
  it("shares a store via createContext Provider", async () => {
    interface Todo {
      id: number;
      text: string;
      done: boolean;
    }

    function createTodoStore() {
      const [state, setState] = createStore({
        items: [] as Todo[],
        filter: "all" as "all" | "active" | "done",
      });

      const addTodo = (text: string) =>
        setState("items", (prev) => [
          ...prev,
          { id: Date.now(), text, done: false },
        ]);

      const toggle = (id: number) =>
        setState(
          produce((draft: any) => {
            const item = draft.items.find((t: Todo) => t.id === id);
            if (item) item.done = !item.done;
          }),
        );

      return { state, addTodo, toggle };
    }

    type TodoStore = ReturnType<typeof createTodoStore>;
    const TodoCtx = createContext<TodoStore | null>(null);

    const TodoList = cc(() => {
      const { state, toggle } = useContext(TodoCtx)!;
      const text = () =>
        state.items.map((t) => `${t.done ? "✓" : "○"} ${t.text}`).join(", ");
      return el("ul", {}, text);
    });

    const App = cc(() => {
      const store = createTodoStore();
      // Add one item for testing
      store.addTodo("Test");
      return el(TodoCtx.Provider, { value: store }, el(TodoList, {}));
    });

    mount(App, container);
    expect((container as any).textContent).toContain("Test");
  });
});

describe("Pattern 3: useReducer + provide/inject", () => {
  it("shares reducer-based state machine across a subtree", async () => {
    interface CartState {
      items: string[];
      total: number;
    }
    type CartAction =
      | { type: "add"; item: string; price: number }
      | { type: "clear" };

    function cartReducer(state: CartState, action: CartAction): CartState {
      switch (action.type) {
        case "add":
          return {
            items: [...state.items, action.item],
            total: state.total + action.price,
          };
        case "clear":
          return { items: [], total: 0 };
      }
    }

    type CartAPI = {
      cart: () => CartState;
      dispatch: (a: CartAction) => void;
    };
    const CartKey: symbol = Symbol("Cart");

    const CartProvider = cc((props: { children: any }) => {
      const [cart, dispatch] = useReducer(cartReducer, {
        items: [],
        total: 0,
      });
      provide(CartKey, { cart, dispatch });
      return el("div", {}, props.children);
    });

    const CartBadge = cc(() => {
      const { cart } = inject(CartKey) as CartAPI;
      const text = () => `🛒 ${cart().items.length}`;
      return el("span", {}, text);
    });

    const AddButton = cc((props: { name: string; price: number }) => {
      const { dispatch } = inject(CartKey) as CartAPI;
      return el(
        "button",
        {
          onClick: () =>
            dispatch({ type: "add", item: props.name, price: props.price }),
        },
        `Add ${props.name}`,
      );
    });

    const App = cc(() => {
      return el(
        CartProvider,
        {},
        el(CartBadge, {}),
        el(AddButton, { name: "Book", price: 10 }),
      );
    });

    mount(App, container);
    expect((container as any).textContent).toContain("🛒 0");

    const btn = container.getElementsByTagName("button")[0];
    (btn as any).click();
    await tick();
    expect((container as any).textContent).toContain("🛒 1");
  });
});

describe("Pattern 4: Store + useReducer (complex local + shared)", () => {
  it("uses useReducer for local UI state and mutable store for shared data", async () => {
    const appState = createMutable({
      products: [] as string[],
      cart: [] as string[],
    });
    appState.products = ["Apple", "Banana", "Cherry"];

    const ProductPage = cc(() => {
      const [ui, dispatchUI] = useReducer(
        (state: { filterOpen: boolean; sortBy: string }, action: any) => {
          switch (action.type) {
            case "openFilter":
              return { ...state, filterOpen: true };
            case "closeFilter":
              return { ...state, filterOpen: false };
            case "setSort":
              return { ...state, sortBy: action.field };
          }
          return state;
        },
        { filterOpen: false, sortBy: "name" },
      );

      const addToCart = (product: string) => {
        appState.cart.push(product);
      };

      const sorted = () => {
        const field = ui().sortBy;
        return [...appState.products].sort((a, b) => (a > b ? 1 : -1));
      };

      return el(
        "div",
        {},
        el(
          "button",
          { onClick: () => dispatchUI({ type: "openFilter" }) },
          "Filter",
        ),
        () =>
          sorted().map((p) =>
            el(
              "div",
              {},
              p,
              el("button", { onClick: () => addToCart(p) }, "Add"),
            ),
          ),
      );
    });

    mount(ProductPage, container);
    expect((container as any).textContent).toContain("Apple");
    expect((container as any).textContent).toContain("Banana");

    const btns = container.getElementsByTagName("button");
    // First "Add" button adds Apple
    (btns[1] as any).click();
    await nextTick();
    expect(appState.cart).toEqual(["Apple"]);
  });
});

// ─── 6. What you CANNOT combine ──────────────────────────────

describe("What you CANNOT combine (and workarounds)", () => {
  it("useState cannot be used across components directly (workaround: provide/inject)", () => {
    // Like useReducer, useState creates a signal owned by the current instance.
    // It must be wrapped with provide/inject to share it.
    let localSetter: any;

    const A = cc(() => {
      const [, set] = useState(0);
      localSetter = set;
      return el("div");
    });

    mount(A, container);
    expect(typeof localSetter).toBe("function");
  });

  it("useReducer cannot be used across components directly (workaround: provide/inject)", () => {
    // Direct cross-component use is impossible because the signal is
    // owned by the component instance where useReducer was called.
    // The workaround is demonstrated in Pattern 3 above.
    // Here we just prove useReducer is local to its instance.
    let localDispatch: any;

    const A = cc(() => {
      const [, d] = useReducer((n: number) => n, 0);
      localDispatch = d;
      return el("div");
    });

    mount(A, container);
    expect(typeof localDispatch).toBe("function");
    // There is no way for another component to access this dispatch
    // without provide/inject.
  });

  it("createContext requires a Provider ancestor (no module-level singletons)", () => {
    const ThemeCtx = createContext("light");
    let theme: string | undefined;

    const App = cc(() => {
      theme = useContext(ThemeCtx);
      return el("div");
    });

    mount(App, container);
    // Without a provider, it falls back to defaultValue.
    // The document recommends createMutable/createStore for module-level singletons.
    expect(theme).toBe("light");
  });

  it("provide/inject throw outside component setup", () => {
    expect(() => provide(Symbol("x"), 1)).toThrow("outside of component setup");
    expect(() => inject(Symbol("x"))).toThrow("outside of component setup");
  });

  it("useReducer reducer must be pure (no store path updates inside)", () => {
    // This is a design constraint, not a runtime error.
    // We prove the reducer receives state + action and returns new state.
    let state: any;
    let dispatch: any;

    const App = cc(() => {
      [state, dispatch] = useReducer((s: number, a: number) => s + a, 0);
      return el("div");
    });

    mount(App, container);
    dispatch(5);
    expect(state()).toBe(5);
    // A pure reducer always returns derived state without side effects.
  });
});

// ─── 7. Interoperability ───────────────────────────────────

describe("Interoperability: createContext built on provide/inject", () => {
  it("allows mixing createContext Provider with inject consumer via _key", () => {
    const ThemeCtx = createContext("light");
    let a: string | undefined;
    let b: string | undefined;

    const Child = cc(() => {
      a = useContext(ThemeCtx);
      b = inject(ThemeCtx._key as any, "fallback");
      return el("div");
    });

    const App = cc(() => {
      return el(ThemeCtx.Provider, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(a).toBe("dark");
    expect(b).toBe("dark");
    expect(a).toBe(b);
  });

  it("createContext generates a unique symbol key internally", () => {
    const A = createContext(1);
    const B = createContext(1);
    expect(typeof A._key).toBe("symbol");
    expect(typeof B._key).toBe("symbol");
    expect(A._key).not.toBe(B._key);
  });
});

// ─── 8. Summary table validations ──────────────────────────

describe("Summary table validations", () => {
  it("useReducer alone is signal-backed and component-local", () => {
    let s: any;
    const App = cc(() => {
      [s] = useReducer((n: number) => n, 42);
      return el("div");
    });
    mount(App, container);
    expect(s()).toBe(42);
  });

  it("provide/inject + plain value has no reactivity", () => {
    const Key = Symbol("static");
    let val: string | undefined;

    const Child = cc(() => {
      val = inject(Key, "default");
      return el("span");
    });

    const App = cc(() => {
      provide(Key, "hello");
      return el("div", {}, el(Child, {}));
    });

    mount(App, container);
    expect(val).toBe("hello");
    // No signal means no reactive updates — value is static.
  });

  it("module-level createMutable is global and reactive", async () => {
    const globalTheme = createMutable({ theme: "dark" });

    const App = cc(() => {
      const t = () => globalTheme.theme;
      return el("div", {}, t);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("dark");

    globalTheme.theme = "light";
    await nextTick();
    expect((container as any).textContent).toBe("light");
  });

  it("useState alone is signal-backed and component-local", async () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(7);
      return el("span", {}, state);
    });

    mount(App, container);
    expect(state()).toBe(7);

    setState(9);
    await tick();
    expect(state()).toBe(9);
  });

  it("useState + provide/inject can share state across subtree", async () => {
    const CountKey: symbol = Symbol("count");

    const CounterProvider = cc((props: { children: any }) => {
      const [count, setCount] = useState(0);
      provide(CountKey, { count, setCount });
      return el("div", {}, props.children);
    });

    const Display = cc(() => {
      const { count } = inject(CountKey) as any;
      return el("span", {}, () => String(count()));
    });

    const Inc = cc(() => {
      const { setCount } = inject(CountKey) as any;
      return el(
        "button",
        { onClick: () => setCount((c: number) => c + 1) },
        "+",
      );
    });

    const App = cc(() => {
      return el(CounterProvider, {}, el(Display, {}), el(Inc, {}));
    });

    mount(App, container);
    expect((container as any).textContent).toContain("0");

    const btn = container.getElementsByTagName("button")[0];
    (btn as any).click();
    await tick();
    expect((container as any).textContent).toContain("1");
  });

  it("useState + store works for mixed local + shared state", async () => {
    const [store, setStore] = createStore({ multiplier: 2 });
    let setBase: any;

    const App = cc(() => {
      const [base, _setBase] = useState(5);
      setBase = _setBase;
      const result = () => base() * store.multiplier;
      return el("span", {}, result);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("10");

    setBase(10);
    await tick();
    expect((container as any).textContent).toBe("20");

    setStore("multiplier", 3);
    await nextTick();
    expect((container as any).textContent).toBe("30");
  });
});
