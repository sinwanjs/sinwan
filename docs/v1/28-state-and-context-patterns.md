# State & Context Patterns

Sinwan offers **four overlapping systems** for passing data and managing state across components. This guide compares them, explains when to use each, shows how they combine, and highlights what you **cannot** do.

```ts
// Sinwan native
import { provide, inject } from "sinwan";
import { createStore, createMutable } from "sinwan/store";

// React-compatible
import { createContext, useContext, useReducer } from "sinwan/react";
```

---

## The four systems at a glance

| System                          | Origin    | Scope                          | Reactive?           | Mutable?               | Type-safe key?    |
| ------------------------------- | --------- | ------------------------------ | ------------------- | ---------------------- | ----------------- |
| `provide` / `inject`            | Sinwan    | Component subtree              | Manual              | Any                    | `InjectionKey<T>` |
| `createContext` / `useContext`  | React API | Component subtree              | No (static read)    | Via Provider re-render | `Context<T>`      |
| `createStore` / `createMutable` | Sinwan    | Any (module-level or provided) | Yes (per-property)  | `createMutable`        | N/A               |
| `useReducer`                    | React API | Single component               | Yes (signal-backed) | Via dispatch           | N/A               |

---

## 1. `provide` / `inject` — Sinwan native DI

### How it works

- `provide(key, value)` stores a value on the current component instance's `provides` object.
- `inject(key, default?)` walks up the prototype chain (`Object.create(parent.provides)`) to find the nearest ancestor that provided the key.
- Must be called during component setup (synchronously).

```tsx
import { cc, provide, inject } from "sinwan";
import type { InjectionKey } from "sinwan";

const ThemeKey: InjectionKey<string> = Symbol("theme");

const App = cc(() => {
  provide(ThemeKey, "dark");
  return <Child />;
});

const Child = cc(() => {
  const theme = inject(ThemeKey, "light"); // "dark"
  return <div class={theme}>Hello</div>;
});
```

### Key characteristics

- **Any value** — strings, objects, signals, stores, functions.
- **Static by default** — the injected value is whatever was provided at setup time. If you provide a plain string, it won't update.
- **Reactive if you provide a signal or store** — the consumer gets the reactive reference and can track it.
- **Typed via `InjectionKey<T>`** — a branded symbol that carries the value type.

---

## 2. `createContext` / `useContext` — React-compatible API

### How it works

- `createContext(default)` creates a `Context` object with a `.Provider` component and a private `InjectionKey`.
- `<Context.Provider value={x}>` calls Sinwan's `provide(key, x)` under the hood.
- `useContext(Context)` calls Sinwan's `inject(key, default)` under the hood.

```tsx
import { createContext, useContext } from "sinwan/react";
import { cc } from "sinwan";

const ThemeCtx = createContext("light");

const App = cc(() => (
  <ThemeCtx.Provider value="dark">
    <Child />
  </ThemeCtx.Provider>
));

const Child = cc(() => {
  const theme = useContext(ThemeCtx); // "dark"
  return <div class={theme}>Hello</div>;
});
```

### Key characteristics

- **Wraps provide/inject** — `createContext` generates a unique symbol key internally.
- **React 19 shorthand** — `<ThemeCtx value="dark">` works (the context itself is callable as a provider).
- **Consumer pattern** — `<ThemeCtx.Consumer>{(val) => ...}</ThemeCtx.Consumer>` is supported.
- **Same reactivity rules** as provide/inject — the value is static unless it's a signal/store.

---

## 3. `createStore` / `createMutable` — Sinwan stores

### How it works

- Creates a proxy-wrapped object where **each property** owns a signal.
- Reads track at the property level. Writes trigger only the subscribers of that property.
- Can be created at module scope (global) or inside a component.

```tsx
import { createStore } from "sinwan/store";

const [state, setState] = createStore({
  user: { name: "Alice" },
  theme: "dark",
});

// Property-level reactivity
effect(() => console.log(state.user.name)); // only re-runs when name changes
```

### Key characteristics

- **Fine-grained reactivity** — no re-renders, just signal updates.
- **Immutable** (`createStore`) or **mutable** (`createMutable`) variants.
- **Path-based updates** — `setState("user", "name", "Bob")`.
- **Not scoped to components** — can live anywhere.

---

## 4. `useReducer` — React-compatible local state

### How it works

- Backed by a **signal** inside the component instance.
- `dispatch(action)` calls `reducer(currentState, action)` and writes the result to the signal.
- Returns `[() => S, dispatch]` — a getter (not a plain value).

```tsx
import { useReducer } from "sinwan/react";
import { cc } from "sinwan";

type Action = { type: "inc" } | { type: "dec" };
const reducer = (n: number, a: Action) => (a.type === "inc" ? n + 1 : n - 1);

const Counter = cc(() => {
  const [count, dispatch] = useReducer(reducer, 0);
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => dispatch({ type: "inc" })}>+</button>
    </div>
  );
});
```

### Key characteristics

- **Component-local** — the signal lives on the component instance.
- **Predictable updates** — all logic in the reducer function.
- **Not shareable** across components (unlike stores or context).

---

## Comparison: when to use what

| Need                                  | Best tool                              |
| ------------------------------------- | -------------------------------------- |
| Share a theme/config across a subtree | `provide`/`inject` or `createContext`  |
| Complex shared state (e.g. todo list) | `createStore` + `provide`/`inject`     |
| Global singleton state                | `createMutable` at module scope        |
| Local component state with actions    | `useReducer`                           |
| React migration / familiar API        | `createContext` + `useContext`         |
| Fine-grained reactivity               | `createStore` / `createMutable`        |
| Type-safe DI without React patterns   | `provide`/`inject` with `InjectionKey` |

---

## Combining them: real-world patterns

### Pattern 1: Store + provide/inject

The most powerful combination. Create a store, provide it to a subtree, inject it in any descendant:

```tsx
import { cc, provide, inject } from "sinwan";
import { createStore, produce } from "sinwan/store";
import type { InjectionKey } from "sinwan";

// ─── Define the store shape ─────────────────────
interface AppState {
  user: { name: string; role: string } | null;
  notifications: { id: number; text: string }[];
}

type AppStore = [
  import("sinwan/store").Store<AppState>,
  import("sinwan/store").SetStoreFunction<AppState>,
];

const AppStoreKey: InjectionKey<AppStore> = Symbol("AppStore");

// ─── Root provides the store ────────────────────
const App = cc(() => {
  const store = createStore<AppState>({
    user: null,
    notifications: [],
  });

  provide(AppStoreKey, store);

  return (
    <div>
      <Header />
      <Main />
    </div>
  );
});

// ─── Any descendant injects it ──────────────────
const Header = cc(() => {
  const [state] = inject(AppStoreKey)!;

  return <nav>{() => state.user?.name ?? "Guest"}</nav>;
});

const Main = cc(() => {
  const [state, setState] = inject(AppStoreKey)!;

  const login = () => {
    setState("user", { name: "Alice", role: "admin" });
  };

  return (
    <div>
      <button onClick={login}>Login</button>
      <p>Notifications: {() => state.notifications.length}</p>
    </div>
  );
});
```

**Why this works well:**

- The store is **reactive** — descendants read `state.user.name` and only that signal fires when the name changes.
- The store is **scoped** — only components in the subtree can access it.
- The store + setter travel together as a single injectable value.

### Pattern 2: createContext + store (React-style)

Same concept, but using the React-compatible API:

```tsx
import { createContext, useContext } from "sinwan/react";
import { createStore } from "sinwan/store";
import { cc } from "sinwan";

const TodoCtx = createContext<ReturnType<typeof createTodoStore> | null>(null);

function createTodoStore() {
  const [state, setState] = createStore({
    items: [] as { id: number; text: string; done: boolean }[],
    filter: "all" as "all" | "active" | "done",
  });

  const addTodo = (text: string) =>
    setState("items", (prev) => [
      ...prev,
      { id: Date.now(), text, done: false },
    ]);

  const toggle = (id: number) =>
    setState(
      produce((draft) => {
        const item = draft.items.find((t) => t.id === id);
        if (item) item.done = !item.done;
      }),
    );

  return { state, addTodo, toggle };
}

const App = cc(() => {
  const store = createTodoStore();
  return (
    <TodoCtx.Provider value={store}>
      <TodoList />
      <AddForm />
    </TodoCtx.Provider>
  );
});

const TodoList = cc(() => {
  const { state, toggle } = useContext(TodoCtx)!;
  return (
    <ul>
      {() =>
        state.items.map((t) => (
          <li onClick={() => toggle(t.id)}>
            {t.done ? "✓" : "○"} {t.text}
          </li>
        ))
      }
    </ul>
  );
});
```

### Pattern 3: useReducer + provide/inject (action-driven shared state)

Share a reducer-based state machine across a subtree:

```tsx
import { cc, provide, inject } from "sinwan";
import { useReducer } from "sinwan/react";
import type { InjectionKey } from "sinwan";

// ─── State & actions ────────────────────────────
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

type CartAPI = { cart: () => CartState; dispatch: (a: CartAction) => void };
const CartKey: InjectionKey<CartAPI> = Symbol("Cart");

// ─── Provider component ─────────────────────────
const CartProvider = cc(({ children }) => {
  const [cart, dispatch] = useReducer(cartReducer, { items: [], total: 0 });
  provide(CartKey, { cart, dispatch });
  return <>{children}</>;
});

// ─── Consumer components ────────────────────────
const CartBadge = cc(() => {
  const { cart } = inject(CartKey)!;
  return <span>🛒 {() => cart().items.length}</span>;
});

const AddButton = cc(({ name, price }) => {
  const { dispatch } = inject(CartKey)!;
  return (
    <button onClick={() => dispatch({ type: "add", item: name, price })}>
      Add {name}
    </button>
  );
});
```

### Pattern 4: Store + useReducer (complex local + shared)

Use a store for shared data and useReducer for local component logic:

```tsx
const appState = createMutable({ products: [], cart: [] });

const ProductPage = cc(() => {
  // Local UI state via useReducer
  const [ui, dispatchUI] = useReducer(
    (state, action) => {
      switch (action.type) {
        case "openFilter":
          return { ...state, filterOpen: true };
        case "closeFilter":
          return { ...state, filterOpen: false };
        case "setSort":
          return { ...state, sortBy: action.field };
      }
    },
    { filterOpen: false, sortBy: "name" },
  );

  // Shared state via store
  const addToCart = (product) => {
    appState.cart.push(product);
  };

  const sorted = () => {
    const field = ui().sortBy;
    return [...appState.products].sort((a, b) =>
      a[field] > b[field] ? 1 : -1,
    );
  };

  return (
    <div>
      <button onClick={() => dispatchUI({ type: "openFilter" })}>Filter</button>
      {() =>
        sorted().map((p) => (
          <div>
            {p.name} <button onClick={() => addToCart(p)}>Add</button>
          </div>
        ))
      }
    </div>
  );
});
```

---

## What you CANNOT combine (and workarounds)

### ❌ useReducer across components directly

`useReducer` creates a signal on the **current** component instance. You cannot call it in one component and use it in another.

**Workaround:** Wrap the return value with `provide`/`inject` (see Pattern 3 above).

### ❌ createContext without a component tree

`createContext` + `useContext` requires a `<Provider>` ancestor in the JSX tree. You cannot use it for module-level singletons.

**Workaround:** Use `createStore`/`createMutable` at module scope — no provider needed.

```tsx
// ✅ Module-level store — no context or provider required
export const globalState = createMutable({ theme: "dark", locale: "en" });

// Any component can import and read it directly
const Header = cc(() => (
  <nav class={globalState.theme}>{globalState.locale}</nav>
));
```

### ❌ provide/inject outside component setup

Both `provide()` and `inject()` throw if called outside a component's setup function.

**Workaround:** For runtime injection (e.g. from an event handler), provide a **setter function** or a mutable store:

```tsx
const App = cc(() => {
  const state = createMutable({ token: "" });
  provide(AuthKey, state);

  // Later, from an event handler:
  const login = async () => {
    state.token = await fetchToken(); // works — mutable store
  };

  return <button onClick={login}>Login</button>;
});
```

### ❌ Store path updates inside useReducer

`useReducer`'s reducer must be a pure function that returns new state. You cannot call `setState("path", value)` inside a reducer.

**Workaround:** Use the reducer for local logic and update the store in the dispatch wrapper:

```tsx
const [local, rawDispatch] = useReducer(reducer, initialState);

const dispatch = (action) => {
  rawDispatch(action);
  // Side-effect: sync to store
  if (action.type === "save") {
    setState("saved", true);
  }
};
```

---

## `createContext` vs `provide`/`inject` — detailed comparison

| Feature                    | `provide`/`inject`            | `createContext`/`useContext`        |
| -------------------------- | ----------------------------- | ----------------------------------- |
| API origin                 | Sinwan (Vue-inspired)         | React-compatible                    |
| Key type                   | `InjectionKey<T>` (symbol)    | `Context<T>` (object)               |
| Provider syntax            | `provide(key, value)` (call)  | `<Ctx.Provider value={x}>` (JSX)    |
| Consumer syntax            | `inject(key, default)` (call) | `useContext(Ctx)` (hook)            |
| Default value              | Second arg to `inject()`      | Arg to `createContext()`            |
| Consumer component         | N/A                           | `<Ctx.Consumer>`                    |
| React 19 `<Ctx value>`     | N/A                           | ✅ Supported                        |
| Internal mechanism         | Direct prototype chain        | Calls `provide`/`inject` internally |
| Works in Sinwan components | ✅                            | ✅                                  |
| Works in React components  | ❌                            | ✅ (if using sinwan/react)          |
| SSR support                | ✅                            | ✅                                  |

### What is `<Ctx.Consumer>`?

In React (especially before hooks), the **Consumer** component was the only way to read context inside class components. It uses a "render-prop" pattern — you pass a function as children that receives the context value:

```tsx
// React-style consumer pattern
<ThemeCtx.Consumer>
  {(theme) => <div class={theme}>Hello</div>}
</ThemeCtx.Consumer>
```

With `provide`/`inject`, this pattern doesn't exist — you simply call `inject(key)` directly in setup. That's why the table shows **N/A** for provide/inject.

> Today, `useContext(Ctx)` is preferred over `<Ctx.Consumer>`. The Consumer exists only for backward compatibility.

### What is React 19 `<Ctx value>`?

React 19 introduced a shorthand: instead of writing `<Ctx.Provider value={x}>`, you can use the context itself as the JSX tag:

```tsx
// Classic (React 18)
<ThemeCtx.Provider value="dark">
  <Child />
</ThemeCtx.Provider>

// Shorthand (React 19) — same behavior
<ThemeCtx value="dark">
  <Child />
</ThemeCtx>
```

Sinwan supports this because `createContext` returns a **callable function** that acts as a provider when it receives a `value` prop:

```ts
// Internal: the Context object itself is a component
const Context = (props) => {
  if ("value" in props) provide(key, props.value);
  return props.children;
};
```

With `provide`/`inject`, there's no JSX wrapper — you call `provide(key, value)` as a function. Hence **N/A**.

---

**They are interoperable** — `createContext` is built on top of `provide`/`inject`. You can even mix them:

```tsx
// Provider uses createContext
const ThemeCtx = createContext("light");

const App = cc(() => (
  <ThemeCtx.Provider value="dark">
    <Child />
  </ThemeCtx.Provider>
));

// Consumer uses inject with the context's internal key
const Child = cc(() => {
  // Both work:
  const a = useContext(ThemeCtx); // React way
  const b = inject(ThemeCtx._key, "light"); // Sinwan way (internal key)
  // a === b === "dark"
  return <div />;
});
```

> **Recommendation:** Prefer `provide`/`inject` for pure Sinwan projects. Use `createContext`/`useContext` when migrating from React or when you want the `<Provider>` JSX pattern.

---

## Decision flowchart

```
Do you need state shared across components?
├── No  → useState or useReducer (component-local)
└── Yes
    ├── Global singleton? → createMutable at module scope
    └── Scoped to subtree?
        ├── Need fine-grained reactivity? → createStore + provide/inject
        ├── Migrating from React?         → createContext + useContext
        └── Action-driven (reducer)?      → useReducer + provide/inject
```

---

## Summary

| Pattern                             | Reactivity          | Scope         | Complexity |
| ----------------------------------- | ------------------- | ------------- | ---------- |
| `useReducer` alone                  | Signal-backed       | Component     | Low        |
| `provide`/`inject` + plain value    | None                | Subtree       | Low        |
| `provide`/`inject` + store          | Per-property signal | Subtree       | Medium     |
| `createContext` + store             | Per-property signal | Subtree (JSX) | Medium     |
| `useReducer` + `provide`/`inject`   | Signal-backed       | Subtree       | Medium     |
| Module-level `createMutable`        | Per-property signal | Global        | Low        |
| Store + useReducer (local + shared) | Both                | Mixed         | High       |
