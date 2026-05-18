# Stores + React Hooks Integration

This guide explains how to use Sinwan stores (`createStore`, `createMutable`, `produce`, `reconcile`) together with the React-compatible hooks (`useState`, `useEffect`, `useLayoutEffect`, `useMemo`, `useRef`, `useReducer`).

---

## Key difference: Sinwan vs React

| Concept        | React                         | Sinwan                                    |
| -------------- | ----------------------------- | ----------------------------------------- |
| State update   | Triggers re-render            | Triggers signal → fine-grained DOM update |
| Component body | Re-runs on every render       | Runs **once** (setup function)            |
| Store access   | N/A (external state managers) | Built-in, property-level reactivity       |
| Effect deps    | Required for subscription     | Automatic via signal tracking             |

Because Sinwan components run once, stores are naturally accessible inside any hook without stale closure issues.

---

## Setup

```ts
import { cc } from "sinwan";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useReducer,
} from "sinwan/react";
import {
  createStore,
  createMutable,
  produce,
  reconcile,
  unwrap,
} from "sinwan/store";
```

---

## Store + `useEffect`

### Subscribing to store changes

Wrap a Sinwan `effect()` inside `useEffect` to react to store property changes:

```ts
import { effect } from "sinwan";
import { createStore } from "sinwan/store";
import { useEffect } from "sinwan/react";

const [state, setState] = createStore({ count: 0 });

const Counter = cc(() => {
  useEffect(() => {
    // Sinwan effect auto-tracks `state.count`
    const dispose = effect(() => {
      console.log("Count changed:", state.count);
    });
    return () => dispose?.();
  }, []);

  return <span>{() => state.count}</span>;
});
```

### Async data fetching with reconcile

```ts
const [state, setState] = createStore({
  users: [] as { id: number; name: string }[],
  loading: false,
});

const UserList = cc(() => {
  useEffect(() => {
    setState("loading", true);

    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        setState("users", reconcile(data, { key: "id" }));
        setState("loading", false);
      });
  }, []);

  return (
    <ul>
      {() =>
        state.loading
          ? "Loading..."
          : state.users.map((u) => <li>{u.name}</li>)
      }
    </ul>
  );
});
```

### Cleanup on unmount

Effects that subscribe to stores are properly cleaned up:

```ts
const App = cc(() => {
  useEffect(() => {
    const ws = new WebSocket("/api/live");
    ws.onmessage = (e) => {
      setState(reconcile(JSON.parse(e.data)));
    };
    return () => ws.close();
  }, []);

  return <div>{() => state.message}</div>;
});
```

---

## Store + `useLayoutEffect`

`useLayoutEffect` runs **synchronously** after mount (before paint). Use it when you need store values immediately for DOM measurements:

```ts
const [state] = createStore({ width: 0 });

const MeasuredBox = cc(() => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) {
      // Read DOM measurement synchronously
      console.log("Width:", ref.current.offsetWidth);
    }
  }, []);

  return <div ref={ref}>{() => state.width}px</div>;
});
```

---

## Store + `useState`

Combine local component state (`useState`) with shared store state:

```ts
const [store, setStore] = createStore({ price: 100 });

const PriceCalculator = cc(() => {
  const [quantity, setQuantity] = useState(1);

  // Derived computation — reactive to both store and local state
  const total = () => store.price * quantity();

  return (
    <div>
      <p>Price: {() => store.price}</p>
      <p>Qty: {quantity}</p>
      <p>Total: {total}</p>
      <button onClick={() => setQuantity((q) => q + 1)}>+1</button>
    </div>
  );
});
```

> **Remember:** `useState` returns a getter `() => T`, not a plain value. Use `quantity()` to read.

---

## Store + `useMemo`

Cache expensive computations derived from store data:

```ts
const [state] = createStore({
  items: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() })),
});

const ExpensiveList = cc(() => {
  const sorted = useMemo(() => {
    return [...state.items].sort((a, b) => a.value - b.value);
  }, []);

  return (
    <ul>
      {() => sorted.map((item) => <li key={item.id}>{item.value}</li>)}
    </ul>
  );
});
```

---

## Store + `useRef`

Track previous store values or hold mutable references alongside store state:

```ts
const state = createMutable({ count: 0 });

const PrevTracker = cc(() => {
  const prevCount = useRef(state.count);

  useEffect(() => {
    effect(() => {
      console.log(`Changed from ${prevCount.current} to ${state.count}`);
      prevCount.current = state.count;
    });
  }, []);

  return <span>{() => state.count}</span>;
});
```

### Storing unwrapped snapshots

```ts
const [state] = createStore({ data: { nested: { value: 42 } } });

const Snapshot = cc(() => {
  const snapshot = useRef(unwrap(state));

  useEffect(() => {
    // Send plain object to analytics (no proxy)
    analytics.track("page_view", snapshot.current);
  }, []);

  return <div />;
});
```

---

## Store + `useReducer`

Use `useReducer` for complex local logic that also updates a shared store:

```ts
const globalState = createMutable({ totalOrders: 0 });

type Action =
  | { type: "add"; item: string }
  | { type: "remove"; index: number }
  | { type: "checkout" };

function cartReducer(cart: string[], action: Action): string[] {
  switch (action.type) {
    case "add":
      return [...cart, action.item];
    case "remove":
      return cart.filter((_, i) => i !== action.index);
    case "checkout":
      globalState.totalOrders++;
      return [];
  }
}

const Cart = cc(() => {
  const [items, dispatch] = useReducer(cartReducer, []);

  return (
    <div>
      <p>Items: {() => items().length}</p>
      <p>Total orders: {() => globalState.totalOrders}</p>
      <button onClick={() => dispatch({ type: "add", item: "Widget" })}>
        Add
      </button>
      <button onClick={() => dispatch({ type: "checkout" })}>
        Checkout
      </button>
    </div>
  );
});
```

---

## Mutable store + hooks

`createMutable` gives you a writable proxy — no setter needed. Combined with hooks:

```ts
const state = createMutable({
  todos: [] as { id: number; text: string; done: boolean }[],
  filter: "all" as "all" | "active" | "done",
});

const TodoApp = cc(() => {
  const [input, setInput] = useState("");

  const filtered = () => {
    switch (state.filter) {
      case "active": return state.todos.filter((t) => !t.done);
      case "done": return state.todos.filter((t) => t.done);
      default: return state.todos;
    }
  };

  const addTodo = () => {
    state.todos.push({ id: Date.now(), text: input(), done: false });
    setInput("");
  };

  const toggle = (id: number) => {
    const todo = state.todos.find((t) => t.id === id);
    if (todo) todo.done = !todo.done;
  };

  return (
    <div>
      <input value={input} onInput={(e) => setInput(e.target.value)} />
      <button onClick={addTodo}>Add</button>
      <ul>
        {() => filtered().map((t) => (
          <li onClick={() => toggle(t.id)}>
            {t.done ? "✓" : "○"} {t.text}
          </li>
        ))}
      </ul>
    </div>
  );
});
```

---

## `produce` + hooks

Use `produce` for Immer-style mutations inside event handlers or effects:

```ts
const [state, setState] = createStore({
  todos: [
    { id: 1, text: "Learn Sinwan", done: false },
    { id: 2, text: "Build app", done: false },
  ],
});

const App = cc(() => {
  const toggleTodo = (id: number) => {
    setState(produce((draft) => {
      const todo = draft.todos.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    }));
  };

  const addTodo = (text: string) => {
    setState(produce((draft) => {
      draft.todos.push({ id: Date.now(), text, done: false });
    }));
  };

  useEffect(() => {
    // Persist to localStorage whenever todos change
    effect(() => {
      localStorage.setItem("todos", JSON.stringify(unwrap(state).todos));
    });
  }, []);

  return (
    <ul>
      {() => state.todos.map((t) => (
        <li onClick={() => toggleTodo(t.id)}>
          {t.done ? "✓" : "○"} {t.text}
        </li>
      ))}
    </ul>
  );
});
```

---

## `modifyMutable` + hooks

Apply complex batch mutations to a mutable store:

```ts
const state = createMutable({ x: 0, y: 0, z: 0 });

const BatchUpdate = cc(() => {
  useEffect(() => {
    // All three updates produce a single effect flush
    modifyMutable(state, produce((draft) => {
      draft.x = 10;
      draft.y = 20;
      draft.z = 30;
    }));
  }, []);

  const sum = () => state.x + state.y + state.z;
  return <span>{sum}</span>;
});
```

---

## Patterns & best practices

### 1. Don't destructure store properties

```ts
// ❌ Loses reactivity — value captured once
const { name } = state.user;

// ✅ Reactive — reads signal on each access
const greeting = () => `Hello, ${state.user.name}`;
```

### 2. Use `unwrap` before passing to third-party libs

```ts
useEffect(() => {
  chart.setData(unwrap(state.chartData));
}, []);
```

### 3. Prefer `reconcile` for server data

```ts
useEffect(() => {
  fetchData().then((data) => {
    setState("items", reconcile(data, { key: "id" }));
  });
}, []);
```

This minimizes signal notifications — only changed properties trigger effects.

### 4. Separate local UI state from shared app state

```ts
// Shared across components
const appStore = createMutable({ user: null, theme: "light" });

// Local to a single component
const Form = cc(() => {
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // ...
});
```

### 5. Batch multiple setState calls

```ts
import { batch } from "sinwan";

const handleSubmit = () => {
  batch(() => {
    setState("loading", true);
    setState("error", null);
    setState("data", newData);
  });
  // → single effect flush
};
```

---

## Summary table

| Hook              | Store integration pattern                             |
| ----------------- | ----------------------------------------------------- |
| `useEffect`       | Subscribe to store via `effect()`, fetch & reconcile  |
| `useLayoutEffect` | Synchronous DOM reads using store values              |
| `useState`        | Local state combined with store-derived computations  |
| `useMemo`         | Cache expensive store-based computations              |
| `useRef`          | Track previous store values, hold unwrapped snapshots |
| `useReducer`      | Complex local logic that side-effects into a store    |
