# Sinwan Philosophy

SinwanJS is designed to be a high-performance, predictable, and lightweight UI framework. To use it effectively, you need to understand the "Sinwan way" of thinking about state and rendering.

---

## The Mental Model: "Setup Once, Update Forever"

In many frameworks (like React), your component function is a "render function" that runs over and over again. In Sinwan, your component function is a **"setup function"**.

1.  **Run Once**: The code inside `cc(() => { ... })` runs exactly once when the component is created.
2.  **Initialize**: You create your signals, computeds, and effects in this single run.
3.  **Return a Template**: You return a JSX structure that describes the UI.
4.  **Live Forever**: The renderer looks at your JSX and creates **live bindings** between your signals and the DOM. The component function never needs to run again.

### Comparison: React vs Sinwan

| Concept             | React                        | Sinwan                    |
| ------------------- | ---------------------------- | ------------------------- |
| **Component Run**   | Every state change           | Once at birth             |
| **Logic Placement** | Top-level of function        | Top-level (setup)         |
| **Updates**         | Re-runs function, diffs VDOM | Direct DOM node updates   |
| **Reactivity**      | Hook-based snapshots         | Signal-based live streams |

---

## Thinking in Signals

In Sinwan, **Signals are the source of truth**.

- **Don't calculate values in the return statement**: If you write `{count.value + 1}`, it calculates that number once and renders it as static text.
- **Do use Getters or Computeds**: Use `{() => count.value + 1}` or a `computed()` so the renderer can track the dependency and update the DOM automatically.

### The "Reactive Block" Rule

Whenever you see `{ }` in your JSX, ask yourself: _"Is this a live value or a static snapshot?"_

- `{count}` — Live (Signal object).
- `{() => count.value}` — Live (Function).
- `{count.value}` — **Static** (Current primitive value).

---

## How Components are Rendered

When you call `mount()` or `render()`, Sinwan performs these steps:

1.  **Instantiation**: It creates a `ComponentInstance` to track lifecycle hooks (`onMounted`, etc.).
2.  **Setup**: It runs your setup function.
3.  **DOM Creation**: It converts the returned JSX into real DOM elements.
4.  **Binding**: For every reactive value (Signal or Function) found in the JSX, it creates a small `effect()` that targets only that specific DOM node or attribute.
5.  **Mounting**: The elements are inserted into the page, and `onMounted` hooks are fired.

This "surgical" approach means that if you update a signal used in a single `<span>`, only that `<span>` updates. The rest of the component—and the rest of the application—stays completely still.

---

## Core Values

1.  **Zero Virtual DOM**: No diffing, no patching, no memory overhead for VDOM trees.
2.  **Explicit over Implicit**: We prefer explicit signals and lifecycle hooks over magic auto-tracking that can lead to hidden performance costs.
3.  **SSR & Hydration First**: Sinwan was built from the ground up to support high-performance streaming SSR and seamless hydration.
4.  **TypeScript First**: The framework is built to provide the best possible types for your components and state.
