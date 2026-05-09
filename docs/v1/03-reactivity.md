# Reactivity

Sinwan’s reactive layer is a small, well-defined system inspired by SolidJS, Vue 3, and Preact Signals. It exports four primitives:

| Primitive | Purpose |
|---|---|
| `signal(value)` | Reactive value cell, read & write |
| `computed(getter)` | Lazy, cached derived value |
| `effect(fn)` | Side effect that re-runs when its tracked deps change |
| `batch(fn)` | Coalesce multiple writes into a single effect flush |

Plus two utilities:

| Utility | Purpose |
|---|---|
| `nextTick(fn?)` | Promise that resolves after the next reactive flush |
| `isSignal(v)` / `isComputed(v)` | Type guards |

All of them live in `sinwan` and `sinwan/reactivity` (re-export).

---

## Mental model

1. Reading `signal.value` while an effect is running registers the effect as a **subscriber** of the signal.
2. Writing `signal.value` schedules every subscriber on the **microtask flush queue**.
3. When the microtask runs, each scheduled effect re-runs **once**, regardless of how many writes hit it.
4. `computed(getter)` is itself a `Dep` and a subscriber: it caches its value, marks dirty when any input changes, and lazily recomputes on the next read.

Effects always run their **first time synchronously** to establish dependencies.

---

## `signal<T>(initial)`

Create a reactive cell containing a single value.

```ts
function signal<T>(initial: T): Signal<T>;

interface Signal<T> {
  value: T;                                       // get/set, tracks/triggers
  peek(): T;                                      // get without tracking
  subscribe(fn: (value: T) => void): () => void;  // manual sub, returns unsub
}
```

### Reading and writing

```ts
const count = signal(0);

console.log(count.value);  // 0
count.value = 5;
console.log(count.value);  // 5
```

Setting `value` to the same value (compared with `Object.is`) is a no-op — no effects fire.

```ts
count.value = 5;
count.value = 5;  // no flush, deduped
```

### `peek()` — read without tracking

`peek()` returns the value but does **not** register the active effect as a subscriber:

```ts
effect(() => {
  // This effect tracks `count` because we used .value
  console.log("tracked:", count.value);
});

effect(() => {
  // This effect does NOT track `count`, even though it reads it
  console.log("untracked:", count.peek());
});
```

Use `peek()` whenever you want to inspect the current value without creating an unnecessary dependency (logging, conditional reads, etc.).

### `subscribe(fn)` — manual subscription

A non-reactive subscription mechanism, for code that wants raw callbacks instead of effects:

```ts
const unsub = count.subscribe((newValue) => {
  console.log("count changed:", newValue);
});

count.value = 10;  // logs "count changed: 10"
unsub();           // stops listening
```

Manual subscribers fire **synchronously** on every write (after the equality check). They do not go through the microtask scheduler.

### `toString()` and `valueOf()`

Signals (and computeds) implement `toString()` and `valueOf()` so they interpolate naturally:

```ts
const name = signal("World");
const n = signal(2);

const greeting = `Hello, ${name}!`;   // "Hello, World!"
const total = 10 + n;                 // 12
```

But the renderer detects signals via `isSignal` first — passing one as a JSX child or attribute creates a real reactive binding (preferred over string interpolation).

### Type guard

```ts
import { isSignal } from "sinwan";

if (isSignal(value)) {
  // value is Signal<unknown>
}
```

---

## `computed<T>(getter)`

A lazily-evaluated, cached derived value.

```ts
function computed<T>(getter: () => T): Computed<T>;

interface Computed<T> {
  readonly value: T;  // read tracks; lazy & cached
  peek(): T;          // read without tracking
}
```

### Behaviour

- The getter runs **once on creation** to capture initial dependencies and the cached value.
- When **any dependency** triggers, the computed marks itself **dirty** but does **not** recompute immediately. It also notifies its own subscribers (so downstream effects schedule).
- The next read of `.value` recomputes the value if dirty, then returns the fresh result.

```ts
const a = signal(1);
const b = signal(2);
const sum = computed(() => a.value + b.value);

console.log(sum.value);  // 3 — getter ran once

batch(() => {
  a.value = 10;
  b.value = 20;
});

console.log(sum.value);  // 30 — getter ran exactly once more
```

### Why lazy?

Cheap derived values that are read infrequently never recompute until someone actually reads them. Reads are cached:

```ts
const big = computed(() => expensiveCalc(input.value));

// expensiveCalc runs once, then the cached value is reused
big.value;
big.value;
big.value;

input.value = newInput;  // marks dirty, but doesn't recompute yet

// expensiveCalc runs once more, on this read:
big.value;
```

### Type guard

```ts
import { isComputed } from "sinwan";

if (isComputed(value)) {
  // value is Computed<unknown>
}
```

---

## `effect(fn)`

Run a side-effect that automatically re-runs when its tracked dependencies change.

```ts
type CleanupFn = () => void;
type EffectFn = () => CleanupFn | void;

function effect(fn: EffectFn): CleanupFn;
```

### First run is synchronous

```ts
const count = signal(0);

const dispose = effect(() => {
  console.log("count =", count.value);  // logs immediately: "count = 0"
});

count.value = 1;  // microtask: "count = 1"
count.value = 2;  // queued — but flushed only once: "count = 2"
```

After the synchronous first run, subsequent runs are scheduled on the microtask queue and deduplicated.

### Cleanup function

If your effect returns a function, it is called **before the next run** and **on dispose**:

```ts
effect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);  // cleanup
});
```

The cleanup runs in the order: previous-cleanup → current-effect.

### Disposal

Calling the function returned by `effect()` permanently disposes the effect — it stops running, unsubscribes from every dep, and runs your cleanup one last time:

```ts
const dispose = effect(() => { /* ... */ });
// later...
dispose();
```

### Reactivity inside components

When `effect()` is called during component setup, it is **not** automatically tied to the component’s lifetime. To dispose effects on unmount, register them via `onUnmounted` or push them onto `getCurrentInstance().effects`:

```ts
import { effect, onUnmounted } from "sinwan";

createComponent(() => {
  const dispose = effect(() => { /* ... */ });
  onUnmounted(dispose);
  return <div>...</div>;
});
```

Effects created **by the renderer** (reactive text, reactive attributes) are automatically disposed when the surrounding `MountedNode` unmounts.

### Re-entrancy guard

If an effect tries to schedule itself synchronously (writing a signal it reads), the renderer detects the cycle and skips the inner re-entrant call:

```ts
const a = signal(0);

effect(() => {
  // Don't actually do this — but if you did:
  if (a.value < 5) a.value++;
});
// loops at most once per microtask, no infinite recursion
```

---

## `batch(fn)`

Group multiple synchronous writes into a single effect flush.

```ts
function batch(fn: () => void): void;
```

```ts
const a = signal(1);
const b = signal(2);

effect(() => console.log("sum =", a.value + b.value));
// logs: "sum = 3"

batch(() => {
  a.value = 10;
  b.value = 20;
});
// logs ONCE: "sum = 30"
```

Without `batch`, two writes would queue the same effect twice in the same microtask, the scheduler would dedup, and the effect would run once anyway — but `batch` also **flushes synchronously** at the end of `fn`, which is useful in tests:

```ts
batch(() => {
  count.value = 5;
});
// after batch returns, every effect has already run synchronously
```

`batch()` calls can nest — the flush only happens when the outermost batch closes.

---

## `nextTick(fn?)`

Wait for the next reactive flush to complete.

```ts
function nextTick(fn?: () => void): Promise<void>;
```

Two main use cases:

```ts
// 1. In tests / async code — wait for effects to run
count.value = 1;
await nextTick();
expect(textNode.data).toBe("1");

// 2. Schedule code AFTER the next flush
nextTick(() => {
  // every effect that was queued has now run
});
```

If no flush is pending, the callback runs on the next microtask anyway (so `await nextTick()` always yields at least once).

---

## Scheduler internals

The scheduler is intentionally tiny. It exposes only `nextTick` publicly; the rest is internal but documented here for completeness.

### Effect ordering

The flush sorts pending effects by **creation id** (a monotonic counter on `ReactiveEffect`). This guarantees:

- Parent effects run before child effects (parents are created first).
- Reactive text effects in the same component run in document order.

### Convergence loop

If effects scheduled during a flush write to signals that schedule new effects, the scheduler drains those too — up to **10 iterations** per flush before bailing out:

```text
flush:
  iteration 1: drain pendingEffects
  iteration 2: drain anything queued during 1
  …
  iteration 10: drain — last chance
  if pendingEffects > 0 still → silently stop, don’t infinite-loop
```

This protects against pathological reactive cycles while letting normal cascades work.

### `flushSync()` (internal)

`batch()` uses an internal `flushSync()` to drain effects synchronously. It’s not a public API in v1.

---

## Common patterns

### Derived state

```ts
const items = signal<Item[]>([]);
const total = computed(() => items.value.reduce((sum, i) => sum + i.qty, 0));
```

### Side effect that touches the DOM

The renderer already does this for you when you interpolate a signal into JSX. For ad-hoc code, use `effect`:

```ts
effect(() => {
  document.title = `Cart (${total.value})`;
});
```

### One-shot read after a flush

```ts
counter.value = 5;
await nextTick();
const text = el.textContent;  // reflects the new value
```

### Coalesced writes from a network response

```ts
batch(() => {
  for (const item of payload) addItem(item);
  loading.value = false;
});
```

### Manual subscription for non-reactive code

```ts
const unsub = userId.subscribe((id) => analytics.identify(id));
onUnmounted(unsub);
```

---

## Functional Getters

In SinwanJS, any plain function that returns a value (a "getter") can be used as a reactive input in JSX attributes or children.

When you pass a function like `() => count.value > 0` to a component or a DOM element, the renderer automatically wraps it in an `effect()`. This is the preferred way to use expressions that derive state without the overhead of a full `computed()` object.

### Why use a function?

If you pass an expression directly, it is evaluated by JavaScript **only once** when the component function runs:

```tsx
// ❌ NOT REACTIVE — evaluated once to 'true' or 'false'
<button disabled={count.value === 0}> ... </button>
```

By wrapping it in a function, you pass the **live logic** to the renderer, allowing it to re-run the expression whenever the signals inside it change:

```tsx
// ✅ REACTIVE — the renderer runs this in an effect
<button disabled={() => count.value === 0}> ... </button>
```

### Dynamic JSX in Getters

Functional getters in JSX children can return complex content, including other JSX elements, fragments, or arrays:

```tsx
<div>
  {() => count.value === 1 ? <p>Winner!</p> : <span>Try again</span>}
</div>
```

SinwanJS treats these as **Reactive Blocks**. It uses hidden comment anchors in the DOM to surgically swap the content whenever the function's return value changes, ensuring that only the specific part of the tree is updated.

---

## What reactivity does **not** do (in v1)

- **No async tracking.** If your getter awaits a promise, dependencies read after the `await` are not tracked. Read everything you depend on synchronously, then await.
- **No deep object reactivity.** A signal holding an object is opaque — mutating fields on the object does not trigger updates. Replace the value or wrap nested fields in their own signals.
- **No proxy-based collection reactivity.** Arrays inside signals update when you replace the array value. Use `<For each={items}>` for keyed DOM updates from a signal-backed array.

---

## Reference summary

| Function | Signature | Notes |
|---|---|---|
| `signal` | `<T>(v: T) => Signal<T>` | Reactive cell |
| `computed` | `<T>(g: () => T) => Computed<T>` | Lazy, cached |
| `effect` | `(fn: EffectFn) => CleanupFn` | First run sync; returns dispose |
| `batch` | `(fn: () => void) => void` | Sync flush at end |
| `nextTick` | `(fn?: () => void) => Promise<void>` | Resolves after flush |
| `isSignal` / `isComputed` | `(v: unknown) => v is …` | Type guards |
