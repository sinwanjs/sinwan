# Stores

Sinwan stores provide **fine-grained reactive state** for complex, nested data structures. Inspired by SolidJS stores, they track reads and writes at the property level — not the whole object — enabling surgical DOM updates.

| API                | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `createStore`      | Read-only reactive proxy + setter function               |
| `createMutable`    | Writable reactive proxy (direct assignments allowed)     |
| `modifyMutable`    | Apply a modifier (produce/reconcile) to a mutable store  |
| `produce`          | Immer-style draft-based mutations                        |
| `reconcile`        | Diff-and-patch existing state with new data              |
| `unwrap`           | Strip proxy wrappers to get the plain underlying object  |

All exports live in `sinwan/store`.

```ts
import {
  createStore,
  createMutable,
  modifyMutable,
  produce,
  reconcile,
  unwrap,
} from "sinwan/store";
```

---

## Mental model

1. Each **property** on a store object owns a private `Signal`.
2. **Reading** a property calls `signal.value` → tracks the reader as a subscriber.
3. **Writing** (via `setStore` or direct assignment on mutable) calls `signal.value = …` → triggers dependents.
4. Nested objects are **lazily wrapped** into reactive proxies on first access.
5. Updates are **batched** — multiple writes produce a single effect flush.

This gives you the ergonomics of plain objects with the precision of signals.

---

## `createStore<T>(initial?)`

Creates a **read-only** reactive store and a setter function.

```ts
function createStore<T extends object>(
  initial?: T,
  options?: { name?: string },
): [Store<T>, SetStoreFunction<T>];
```

### Basic usage

```ts
const [state, setState] = createStore({
  user: { name: "Alice", age: 30 },
  todos: [
    { id: 1, text: "Learn Sinwan", done: false },
  ],
});

// Read (tracks dependency on `user.name`)
console.log(state.user.name); // "Alice"

// Write — read-only proxy throws on direct assignment
state.user.name = "Bob"; // ❌ Error: Store is read-only
```

### Updating with `setState`

#### Top-level partial merge

```ts
setState({ user: { name: "Bob", age: 31 } });
```

#### Updater function

```ts
setState((prev) => ({ ...prev, user: { ...prev.user, age: prev.user.age + 1 } }));
```

#### Path-based updates (up to 4 levels deep)

```ts
// 1-level
setState("user", { name: "Charlie", age: 25 });

// 2-level
setState("user", "name", "Diana");

// 3-level with updater
setState("todos", 0, "done", (prev) => !prev);
```

Path syntax is fully type-safe — TypeScript infers the valid keys at each depth.

---

## `createMutable<T>(state)`

Creates a **writable** reactive proxy. Reads track, writes trigger — no setter function needed.

```ts
function createMutable<T extends object>(
  state: T,
  options?: { name?: string },
): T;
```

### Usage

```ts
const state = createMutable({
  count: 0,
  items: ["a", "b"],
});

// Direct mutation — reactive!
state.count += 1;
state.items.push("c"); // Array methods are batched automatically
```

### When to use mutable vs immutable

| Scenario                           | Recommended API   |
| ---------------------------------- | ----------------- |
| Component-local state              | `createStore`     |
| Shared global state / service      | `createMutable`   |
| Mutation-heavy logic (drag, games) | `createMutable`   |
| Controlled updates, audit trail    | `createStore`     |

---

## `modifyMutable(state, modifier)`

Apply a modifier function to a mutable store inside a batch.

```ts
function modifyMutable<T extends object>(
  state: T,
  modifier: (state: T) => T,
): void;
```

The modifier receives the **raw** underlying object. If it returns a **different** object, the result is reconciled back into the mutable store in place.

```ts
const state = createMutable({ count: 0, label: "hello" });

modifyMutable(state, produce((draft) => {
  draft.count = 42;
  draft.label = "world";
}));
// state.count → 42, state.label → "world"
```

---

## `produce(fn)`

An Immer-style modifier. Internally deep-clones the state, wraps the clone in a mutable proxy so you can mutate freely, then returns the plain result.

```ts
function produce<T extends object>(
  fn: (draft: T) => void,
): (state: T) => T;
```

### Example

```ts
const [state, setState] = createStore({
  todos: [
    { id: 1, text: "Buy milk", done: false },
    { id: 2, text: "Write docs", done: false },
  ],
});

setState(produce((draft) => {
  const todo = draft.todos.find((t) => t.id === 2);
  if (todo) todo.done = true;
}));
```

> **Note:** `produce` deep-clones before mutation, so the original state is never touched — safe to use with read-only stores.

---

## `reconcile(value, options?)`

Diff-and-patch modifier. Reconciles the store's current state with `value`, minimizing signal notifications by reusing unchanged objects.

```ts
function reconcile<T>(
  value: T,
  options?: { key?: string | null; merge?: boolean },
): (state: T) => T;
```

| Option  | Default | Description                                                  |
| ------- | ------- | ------------------------------------------------------------ |
| `key`   | `"id"`  | Property used to match array items between old and new state |
| `merge` | `false` | If true, non-matching branches are merged instead of replaced |

### Example — replacing a list from an API response

```ts
const [state, setState] = createStore({
  todos: [
    { id: 1, text: "Old", done: true },
  ],
});

// Fetch new data
const freshTodos = await fetch("/api/todos").then((r) => r.json());

// Reconcile: items with same `id` are patched, others replaced
setState("todos", reconcile(freshTodos, { key: "id" }));
```

### Why reconcile?

When you replace an entire sub-tree naively, every signal fires even if the actual values haven't changed. `reconcile` walks both trees and only updates signals whose underlying value differs — reducing unnecessary DOM updates.

---

## `unwrap(item)`

Recursively strips store proxies and returns the plain underlying data.

```ts
function unwrap<T>(item: T): T;
```

### Behavior

- **Proxy objects** → returns the raw backing object.
- **Frozen objects** → shallow-copied before unwrapping children.
- **Circular references** → handled safely (internal `Set` guard).
- **Primitives** → returned as-is.

### Use cases

- Serializing store state to JSON.
- Passing store data to third-party libraries that don't expect proxies.
- Debugging — inspecting the raw value without reactive wrappers.

```ts
const [state] = createStore({ nested: { deep: 42 } });

JSON.stringify(unwrap(state)); // '{"nested":{"deep":42}}'
```

---

## Reactivity internals

### Property-level signals

Each property on a store node owns a `Signal<unknown>`:

```
store.user.name  →  Signal("Alice")
store.user.age   →  Signal(30)
store.todos[0]   →  Signal(Proxy{id:1, ...})
```

Signals are created **lazily** — only when a property is first read. This keeps unused branches cost-free.

### Wrappable objects

Only plain objects and arrays are wrapped into reactive proxies. The following are **excluded**:

- `Date`, `RegExp`, `Error`
- `Map`, `Set`, `WeakMap`, `WeakSet`
- `Promise`, `ArrayBuffer`

### Array mutation batching

On mutable stores, calls to `push`, `pop`, `splice`, `sort`, etc. are automatically wrapped in a `batch()`. All index signals are resynchronized in a single pass, producing one effect flush instead of O(n) flushes.

### `syncStoreFromRaw`

After mutations through `setStore` or `modifyMutable`, the internal `syncStoreFromRaw` function walks the raw object tree and updates any signals whose value diverged — inside a `batch()` for efficiency.

---

## Type reference

```ts
/** Deep readonly utility */
type DeepReadonly<T> = /* recursive mapped type — see source */;

/** The reactive store type (read-only at type level) */
type Store<T> = DeepReadonly<T>;

/** Setter supporting partial merge, updater, and path syntax */
interface SetStoreFunction<T> {
  (setter: Partial<T> | ((prev: T) => T | Partial<T>)): void;
  <K1 extends keyof T>(key1: K1, value: ValueOrUpdater<T[K1]>): void;
  <K1, K2>(key1: K1, key2: K2, value: ValueOrUpdater<T[K1][K2]>): void;
  <K1, K2, K3>(key1: K1, key2: K2, key3: K3, value: ValueOrUpdater<T[K1][K2][K3]>): void;
  <K1, K2, K3, K4>(key1: K1, key2: K2, key3: K3, key4: K4, value: ValueOrUpdater<T[K1][K2][K3][K4]>): void;
  (...path: [...PropertyKey[], unknown]): void;
}
```

---

## Comparison with other state solutions

| Feature               | Sinwan Store             | SolidJS Store           | Zustand / Jotai     |
| --------------------- | ------------------------ | ----------------------- | ------------------- |
| Granularity           | Per-property signal      | Per-property signal     | Whole-atom           |
| Immutable by default  | ✅ (`createStore`)       | ✅                      | Depends             |
| Mutable variant       | ✅ (`createMutable`)     | ✅                      | ❌                   |
| Path-based updates    | ✅ (type-safe, 4 levels) | ✅ (dynamic)            | ❌                   |
| Immer-style `produce` | ✅ (built-in)            | ✅                      | ✅ (via middleware)  |
| Reconciliation        | ✅ (built-in)            | ✅                      | ❌                   |
| Works with effects    | Sinwan `effect`/`computed` | SolidJS `createEffect` | React hooks         |
| SSR compatible        | ✅                       | ✅                      | ✅                   |

---

## Best practices

1. **Prefer `createStore`** for component state — the read-only proxy catches accidental mutations early.
2. **Use path syntax** for surgical updates deep in the tree instead of spreading entire sub-objects.
3. **Batch related writes** — while stores auto-batch array mutations, explicit `batch()` around multiple `setState` calls can further reduce flushes.
4. **Use `reconcile`** when replacing large sub-trees from external data (API responses, WebSocket messages) to avoid unnecessary signal triggers.
5. **`unwrap` before serialization** — `JSON.stringify(state)` may not work as expected on proxied objects.
6. **Don't destructure** store properties at the top level — you lose reactivity. Access `state.x` inside effects/templates.

```ts
// ❌ Loses reactivity
const { name } = state.user;

// ✅ Reactive
effect(() => console.log(state.user.name));
```
