# Style Guide — State Getters in JSX

> **One rule, two contexts.**
>
> - **Inside JSX** (`children` & HTML attributes) → pass the getter **directly**: `{count}`
> - **Outside JSX** (logic, arithmetic, callbacks) → call it explicitly: `count()`

---

## 1. The rule

Sinwan `useState` returns a **getter function** `() => T`, not a plain value.
The renderer detects these functions automatically in JSX and wraps them in reactive effects.

```tsx
import { useState } from "sinwan/react-client";

const [count, setCount] = useState(0);

// ✅ Inside JSX — renderer calls count() for you
<p>You clicked {count} times.</p>

// ✅ Inside JSX attributes — renderer creates a reactive binding
<input value={count} />

// ❌ Outside JSX — never rely on implicit coercion
setCount(count + 1);        // NaN (function + number)

// ✅ Outside JSX — always call explicitly
setCount(count() + 1);      // correct
```

---

## 2. Quick reference

| Context                         | Syntax                 | Why                                                               |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| JSX text content                | `{count}`              | Renderer detects function, calls it reactively                    |
| JSX native attribute            | `value={count}`        | Renderer creates `effect` and calls `resolve(count)`              |
| Arithmetic / logic              | `count() > 5`          | No automatic resolution outside JSX                               |
| Callback body                   | `console.log(count())` | Explicit read                                                     |
| `useEffect` deps                | `[count]`              | `resolveDeps` calls getter via `STATE_GETTER_MARKER`              |
| Prop to child component         | `data={count}`         | Passes reactive getter through; child uses `{count}` or `count()` |
| Prop to child (immediate value) | `data={count()}`       | Forces current snapshot                                           |

---

## 3. Component props

When passing a getter to a **custom child component**, you have two choices:

```tsx
// Option A — pass reactive getter, child reads it
<Display value={count} />;

// Inside Display.tsx:
const Display = (props: { value: () => number }) => {
  return <p>{props.value}</p>; // ✅ renderer resolves in child's JSX
};
```

```tsx
// Option B — pass snapshot (not reactive)
<Display value={count()} />
```

Prefer **Option A** when the child needs to re-render (reactively update) when the value changes.
Prefer **Option B** when you only need the value at the moment of render.

---

## 4. Full example

```tsx
import { For, onUpdated } from "sinwan";
import { useEffect, useState } from "sinwan/react-client";

export const Counter = () => {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([1, 2, 3]);

  const handleClick = () => {
    // Outside JSX → explicit call
    setItems([...items(), items().length + 1]);
    setCount(count() + 1);
  };

  useEffect(() => {
    // Outside JSX → explicit call
    console.log("count =", count());
  }, [count]); // Deps array → pass getter directly

  return (
    <div>
      {/* Inside JSX → direct */}
      <p>Clicks: {count}</p>
      <button onClick={handleClick}>Add</button>
      <For each={items}>{(item) => <span>{item}</span>}</For>
    </div>
  );
};
```

---

## 5. Mixing native `signal()` with `useState()`

Avoid mixing the two APIs in the same component unless necessary.
They share the same reactive engine, but their surface APIs differ:

|           | Native `signal()`    | React-style `useState()` |
| --------- | -------------------- | ------------------------ |
| Read      | `id.value` or `{id}` | `count()` or `{count}`   |
| Write     | `id.value = x`       | `setCount(x)`            |
| JSX child | `{id}`               | `{count}`                |

Pick **one style per component** to keep the code predictable.

---

## 6. Why this standard?

- **Consistency** — every developer on the team writes getters the same way.
- **Readability** — `count` in JSX clearly means "render this reactively"; `count()` in logic clearly means "read the current value now".
- **Type safety** — TypeScript enforces `() => T`; the rule tells you where to invoke it.
- **No renderer magic surprises** — the automatic resolution only happens in JSX contexts managed by the renderer, never in arbitrary expressions.
