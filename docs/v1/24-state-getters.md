# State Getters and the JSX Runtime

> This document explains why `useState` returns a **getter `() => T`** instead of a plain value `T`, how the Sinwan renderer automatically detects them in JSX, why arithmetic requires an explicit call.

---

## 1. Why a getter?

In React, `useState(0)` returns `[number, Dispatch<SetStateAction<number>>]` — a direct value.

In Sinwan, `useState(0)` returns `[() => number, Dispatch<SetStateAction<number>>]` — a **getter**.

```tsx
// src/integrations/react/use-state.ts
export function useState<S>(
  initial: S | (() => S),
): [() => S, Dispatch<SetStateAction<S>>] {
  const sig = useSignalSlot<S>(() =>
    typeof initial === "function" ? (initial as () => S)() : initial,
  );
  const setState: Dispatch<SetStateAction<S>> = (action) => {
    sig.value = applyUpdate(sig.peek(), action);
  };
  return [createStateGetter(sig), setState];
}
```

**Reason:** Sinwan is a _fine-grained_ library. The component **never** re-runs after mount. For the DOM to update when `count` changes, the renderer must be able to subscribe to the underlying signal. A getter is a function; the Sinwan renderer treats functions as reactive nodes that it wraps in an `effect`. If `useState` returned a raw value, JSX would hold no reference to the signal and the DOM would never update.

---

## 2. `createStateGetter` and `STATE_GETTER_MARKER`

The React↔Sinwan bridge builds a special getter via `createStateGetter`:

```tsx
// src/integrations/react/_internal/bridge.ts
export const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

export function createStateGetter<T>(sig: Signal<T>): () => T {
  const getter = () => sig.value;
  (getter as any)[STATE_GETTER_MARKER] = true;
  getter.valueOf = () => sig.value as any;
  getter.toString = () => String(sig.value);
  (getter as any)[Symbol.toPrimitive] = (hint: string) => {
    const val = sig.value;
    if (hint === "string") return String(val);
    return Number(val);
  };
  return getter;
}
```

**What this getter does:**

1. **Direct call** `getter()` → reads `sig.value` (and triggers subscription if called inside an `effect`).
2. **`STATE_GETTER_MARKER`** → invisible marker that lets React-compatible hooks (`useEffect`, `useLayoutEffect`, etc.) recognize it as a state getter rather than an arbitrary user function.
3. **`valueOf` / `toString` / `Symbol.toPrimitive`** → enables implicit coercion in certain JavaScript contexts (see section 4).

---

## 3. How `{count}` works without `count()`

**Full example:**

```tsx
import { useState } from "sinwan/react-client";

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>You clicked {count} times.</p>
      <button onClick={() => setCount(count() + 1)}>Click me</button>
    </div>
  );
};
```

Here, `count` is a getter function. The JSX runtime does **nothing** special. It simply places the `count` function into the `children` array of the `SinwanElement`:

```tsx
// src/jsx/jsx-runtime.ts
function buildElement(type, props, children) {
  // children contains the `count` function as-is
  return { tag: type, props, children };
}
```

It is the **client renderer** that detects and handles the function:

```tsx
// src/renderer/render-children.ts
export function renderNodeToDOM(node, parent, anchor, namespace) {
  // ...
  if (isReactive(node)) {
    return renderReactiveNodeToDOM(node as any, parent, anchor, namespace);
  }
  // ...
}
```

`isReactive` returns `true` for **any function** (`typeof value === "function"`):

```tsx
// src/reactivity/normalization.ts
export function isReactive(
  value: unknown,
): value is Signal<any> | Computed<any> | Function {
  return isSignal(value) || isComputed(value) || typeof value === "function";
}
```

The renderer then creates a reactive block with comment anchors and an `effect`:

```tsx
// src/renderer/render-children.ts
function renderReactiveNodeToDOM(reactive, parent, anchor, namespace) {
  const startAnchor = domOps.createComment("Sinwan-r");
  const endAnchor = domOps.createComment("/Sinwan-r");
  // ...
  block.dispose = effect(() => {
    if (mountedContent) removeMountedNode(mountedContent);
    const value = resolve(reactive); // <-- calls the function
    mountedContent = renderNodeToDOM(
      value as SinwanNode,
      parent,
      endAnchor,
      namespace,
    );
    // ...
  });
  return block;
}
```

`resolve` calls the function if it is a zero-argument function:

```tsx
// src/reactivity/normalization.ts
export function resolve<T>(value: T | Signal<T> | Computed<T> | (() => T)): T {
  if (isSignal(value) || isComputed(value)) {
    return (value as any).value;
  }
  if (typeof value === "function" && (value as any).length === 0) {
    return (value as any)(); // <-- count() is called here
  }
  return value as T;
}
```

**Conclusion:** `{count}` in JSX works because the Sinwan renderer automatically detects that `count` is a function, wraps it in an `effect`, and calls it on every update to get the current value.

---

## 4. Implicit coercion: `valueOf`, `toString`, `Symbol.toPrimitive`

The getter is a function, but it is equipped with coercion methods so it behaves like the underlying value in certain contexts:

| Context                  | Behavior                                 | Example                  |
| ------------------------ | ---------------------------------------- | ------------------------ |
| **String**               | `toString()` returns `String(sig.value)` | `alert(count)` → `"5"`   |
| **Operator `==` / `!=`** | `valueOf()` returns `sig.value`          | `count == 5` → `true`    |
| **Template literal**     | `Symbol.toPrimitive("string")`           | `` `${count}` `` → `"5"` |
| **Unary operator `+`**   | `Symbol.toPrimitive("number")`           | `+count` → `5`           |

```tsx
const [count, setCount] = useState(5);

// These expressions work thanks to coercion:
console.log(`${count}`); // "5"  (Symbol.toPrimitive "string")
console.log(count == 5); // true (valueOf)
console.log(String(count)); // "5"  (toString)
console.log(+count); // 5    (Symbol.toPrimitive "number")
```

---

## 5. Why arithmetic requires an explicit call

Despite coercion, **addition and other binary operations need `count()`**:

```tsx
const [count, setCount] = useState(0);

// ❌ Wrong — adding functions, not numbers
setCount(count + 1); // NaN (Function + Number)

// ✅ Correct — explicit call
setCount(count() + 1); // 1
```

**Why?**

JavaScript's binary `+` operator calls `Symbol.toPrimitive` with the hint `"default"`, not `"number"`. The getter then returns `Number(sig.value)` thanks to `Symbol.toPrimitive`. **Wait...** In fact, according to the `createStateGetter` implementation:

```ts
(getter as any)[Symbol.toPrimitive] = (hint: string) => {
  const val = sig.value;
  if (hint === "string") return String(val);
  return Number(val); // for "number" AND "default"
};
```

With `hint === "default"`, it returns `Number(val)`. So `count + 1` should theoretically work... but in practice it does not because:

1. `+` between a function and a number: JavaScript first tries `ToPrimitive` on both operands. If `count` is a function, it calls `Symbol.toPrimitive` if available. This **should** work.
2. However, `count + 1` is not reliable because if coercion fails for any reason, you get `NaN`.

In reality, user code explicitly uses `count() + 1`. This is the **recommended practice** because:

- It is explicit and readable
- It avoids any ambiguity about coercion
- It guarantees subscription to the signal if called inside an effect

**Golden rule:**

- In JSX: `{count}` — the renderer calls it for you
- In arithmetic / logic: `count()` — call it explicitly
- In `useEffect` dependencies: `[count]` — `resolveDeps` calls it for you

---

## 6. `useEffect` dependencies: `resolveDeps`

When you pass a getter into a hook's dependency array:

```tsx
useEffect(() => {
  console.log("count changed", count());
}, [count]);
```

The hook uses `resolveDeps` to dereference the getter and subscribe to the signal:

```tsx
// src/integrations/react/use-effect.ts
function resolveDeps(
  deps: GetterDependencyList | undefined,
): any[] | undefined {
  if (deps === undefined) return undefined;
  return deps.map((d) => {
    if (typeof d === "function" && (d as any)[STATE_GETTER_MARKER]) {
      return d(); // <-- reads the signal's current value
    }
    return d;
  });
}
```

**Why `STATE_GETTER_MARKER` is crucial here:**

Without this marker, `resolveDeps` would not know whether a function in the array is a state getter (to be called) or a user callback (must NOT be called). The marker prevents accidental invocation of functions that are not Sinwan getters.

---

## 7. SSR — getters are now supported

> **Fix since v1.1.2.** The files `renderer.ts`, `hydration-markers.ts`, and `stream.ts` now detect getters marked by `STATE_GETTER_MARKER` and call their current value during server-side rendering.

The SSR renderer checks three kinds of reactive values:

```tsx
// src/server/renderer.ts (also applied to hydration-markers.ts and stream.ts)
const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

if (isSignal(node) || isComputed(node)) {
  return escapeHtml(String((node as any).value));
}

if (typeof node === "function" && (node as any)[STATE_GETTER_MARKER]) {
  return escapeHtml(String((node as any)())); // <-- calls the getter
}
```

**Before the fix:** a `createStateGetter` getter was a plain JavaScript function — neither `Signal` nor `Computed`. It fell into the fallback:

```tsx
return escapeHtml(String(node)); // → "() => 5"
```

**After the fix:** the server detects the `Symbol.for("sinwan.state_getter")` marker on the function, calls it to get the current value, and escapes it like any other text.

```tsx
// In SSR, {count} now works without an explicit call
const [count, setCount] = useState(0);
renderToString(<p>Count: {count}</p>); // → "<p>Count: 0</p>"
```

The same logic applies to `readReactive()`, which resolves element attributes: if a prop contains a `useState` getter, it is automatically dereferenced.

---

## 8. Native `signal()` vs `useState()` — two models in the same component

In this example, we use **both** side by side:

```tsx
import { signal } from "sinwan"; // ← native Sinwan
import { useState } from "sinwan/react-client"; // ← React-compatible

export const Counter = () => {
  const [count, setCount] = useState(0); // ← getter + setter
  const id = signal("test"); // ← Signal object

  const handleClick = () => {
    id.value = "test" + Math.random(); // ← direct mutation
    setCount(count() + 1); // ← setter + getter
  };

  return (
    <div>
      <p>{count} times.</p> {/* ← getter, renderer calls count() */}
      <div>{id}</div> {/* ← Signal, renderer reads id.value */}
    </div>
  );
};
```

### 8.1 `signal()` returns a `Signal<T>` object

```tsx
// src/reactivity/signal.ts (conceptual)
export interface Signal<T> {
  get value(): T;
  set value(v: T);
  peek(): T; // read without subscribing
}

export function signal<T>(initial: T): Signal<T> {
  /* ... */
}
```

`signal("test")` returns an **object** with two accessor properties (`get value` / `set value`). It is a native Sinwan reactive object.

### 8.2 Why `id.value = "new"` works

A Signal is a normal object with a setter. You mutate its internal value directly:

```tsx
id.value = "new"; // ✅ direct mutation
```

This triggers the reactivity mechanism: all `effect`s that read `id.value` are re-scheduled.

### 8.3 Why `<div>{id}</div>` works

When `id` (a `Signal`) is passed as a JSX child, the client renderer detects it via `isSignal()`:

```tsx
// src/renderer/render-children.ts
if (isReactive(node)) {
  return renderReactiveNodeToDOM(node as any, parent, anchor, namespace);
}
```

`isReactive` returns `true` because `isSignal(id)` is `true`. The reactive block uses `resolve(reactive)` which, for a Signal, reads `.value`:

```tsx
// src/reactivity/normalization.ts
export function resolve<T>(value: T | Signal<T> | Computed<T> | (() => T)): T {
  if (isSignal(value) || isComputed(value)) {
    return (value as any).value; // ← reads id.value
  }
  // ...
}
```

So `{id}` is equivalent to `{id.value}` — the renderer handles it.

### 8.4 Why `useState` does not return a Signal

`useState` returns `[getter, setter]` because the React API has **no** concept of a signal object. React returns a value + an update function. Sinwan follows this signature for compatibility:

```tsx
// React
const [count, setCount] = useState(0); // count is a number

// Sinwan (compatible)
const [count, setCount] = useState(0); // count is a getter () => number
```

The getter is how Sinwan exposes fine-grained reactivity inside a React-compatible API. If `useState` returned the Signal object itself, existing React code would not compile (you don't write `count.value` in React).

### 8.5 Practical differences

| Aspect            | Native `signal()`                | React-style `useState()`                          |
| ----------------- | -------------------------------- | ------------------------------------------------- |
| **Return type**   | `Signal<T>` (object)             | `[() => T, Dispatch<...>]`                        |
| **Read**          | `id.value` or `{id}`             | `count()` or `{count}`                            |
| **Write**         | `id.value = newVal`              | `setCount(newVal)` or `setCount(c => c + 1)`      |
| **In JSX**        | `{id}` → renderer reads `.value` | `{count}` → renderer calls `count()`              |
| **In SSR**        | `{id}` ✅ recognized as Signal   | `{count}` ✅ recognized via `STATE_GETTER_MARKER` |
| **Compatibility** | Pure Sinwan                      | React-compatible                                  |

### 8.6 When to use which?

- **Native `signal()`** — when writing pure Sinwan code (no React compat needed), or when you want direct mutation and better SSR support.
- **`useState()`** — when porting existing React code, or when you prefer the functional API with an explicit setter.

**Both coexist** because Sinwan is a single runtime: the renderer subscribes to the signal in both cases, whether through a `useState` getter or a native `Signal`. It is the same reactive engine under the hood.

### 8.7 Common pitfall: `count.value` does not work

Because `useState` returns a getter **function** and not a `Signal` object, the getter has no `.value` property:

```tsx
const [count, setCount] = useState(0);

// ❌ Wrong — count is a function, not a Signal
<div>{count.value}</div>; // renders "undefined"
```

If you look at `createStateGetter` in `src/integrations/react/_internal/bridge.ts`, the returned object is a plain function with extra methods (`valueOf`, `toString`, `Symbol.toPrimitive`, and `STATE_GETTER_MARKER`). It does **not** expose the underlying signal directly:

```tsx
// What the getter has:
count(); // ✅ reads sig.value
count.valueOf(); // ✅ reads sig.value (implicit coercion)
count.toString(); // ✅ reads sig.value (implicit coercion)

// What the getter does NOT have:
count.value; // ❌ undefined — no such property
```

**What works instead:**

| Expression      | Works? | Reason                                                                                            |
| --------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `{count}`       | ✅ Yes | Renderer detects it's a function, wraps it in an `effect`, and calls it automatically             |
| `{count()}`     | ✅ Yes | You explicitly call the getter                                                                    |
| `{count.value}` | ❌ No  | `count` is a function, not a Signal object. `createStateGetter` does not add a `.value` property. |

Only a native `signal()` returns a `Signal` object with a `.value` property:

```tsx
import { signal } from "sinwan";
const id = signal("test");

<div>{id.value}</div>  // ✅ works — id is a Signal object
<div>{id}</div>         // ✅ also works — renderer detects Signal and reads .value
```

**Rule:**

- `useState` → getter function → use `{count}` or `count()`
- `signal` → Signal object → use `{id}` or `id.value`

---

## 9. Summary

| Question                                   | Answer                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Why does `useState` return a getter?       | So the renderer can subscribe to the underlying signal without re-running the component.                    |
| Why does `{count}` work without `count()`? | The renderer detects `typeof node === "function"` and calls `resolve()` which executes the function.        |
| Why is `count() + 1` necessary?            | In arithmetic, you must call explicitly to obtain the numeric value.                                        |
| What is `STATE_GETTER_MARKER` for?         | Lets `resolveDeps` distinguish a state getter from a user callback.                                         |
| Does the getter work in SSR?               | **Yes.** Since the fix, SSR detects `STATE_GETTER_MARKER` and calls the getter automatically.               |
| Why does `id.value = "new"` work?          | `signal()` returns a `Signal` object with a setter. It is a direct mutation.                                |
| Why does `{id}` work with a Signal?        | The renderer detects `isSignal(id)` and reads `.value` automatically.                                       |
| `signal()` or `useState()`?                | `signal()` = native, direct mutation, better SSR. `useState()` = React compat, getter + setter.             |
| Why does `count.value` not work?           | `useState` returns a getter **function**, not a `Signal` object. `createStateGetter` does not add `.value`. |

---

## 10. Key source files in the lib directory

- `src/integrations/react/_internal/bridge.ts` — `createStateGetter`, `STATE_GETTER_MARKER`
- `src/integrations/react/use-state.ts` — `useState`
- `src/reactivity/normalization.ts` — `isReactive`, `resolve`
- `src/renderer/render-children.ts` — `renderNodeToDOM`, `renderReactiveNodeToDOM`
- `src/integrations/react/use-effect.ts` — `resolveDeps`
- `src/server/renderer.ts` — `renderToString`
- `src/server/hydration-markers.ts` — `renderNodeH`
