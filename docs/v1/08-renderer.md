# Client Renderer

The client renderer turns a `SinwanElement` tree into real DOM nodes, attaches reactivity, and gives you a handle to unmount everything later.

```ts
import { mount, render, unmountNode } from "sinwan";
```

There is **no virtual DOM**. The renderer creates DOM nodes directly during `mount()` and binds reactivity to them via `effect()`.

---

## `mount(component, container, props?)`

```ts
function mount(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
): AppInstance;

interface AppInstance {
  root: MountedNode;
  unmount(): void;
}
```

Mounts a top-level **component** into the given DOM container.

```tsx
import { mount } from "sinwan";
import { App } from "./App";

const root = document.getElementById("app")!;
const app = mount(App, root, { initialUser: "Ada" });

// Tear everything down (timers, effects, listeners, DOM):
// app.unmount();
```

### What `mount` does

1. **Empties the container** (`container.innerHTML = ""`).
2. Creates a root `ComponentInstance` for this component.
3. Marks it as the current instance so lifecycle hooks and DI calls register on it.
4. Calls the component function once with the props.
5. Renders the returned element tree into the container, recursively. Each child component creates its own instance, registered as a child of the parent instance.
6. Restores the previous current instance.
7. Fires `onMounted` hooks **bottom-up** (children first, then parent). Each lifecycle callback runs with its owning instance active.
8. Returns the `AppInstance`.

### Async components

If the component returns a `Promise<SinwanNode>`, `mount()` inserts an empty placeholder `Text` node, then swaps in the real tree once the promise resolves. `onMounted` fires after the swap.

```tsx
const Posts = cc(async () => {
  const data = await fetch("/api/posts").then((r) => r.json());
  return (
    <ul>
      {data.map((p) => (
        <li>{p.title}</li>
      ))}
    </ul>
  );
});

mount(Posts, document.getElementById("app")!);
// → <span></span> immediately, then replaced with the <ul>...</ul>
```

### Unmounting

```ts
app.unmount();
```

This walks the entire mounted tree, fires `onUnmounted` bottom-up, disposes every effect (reactive text, reactive attributes, manual ones registered via `instance.effects`), removes every event listener, and clears the container.

After `unmount()`, the `AppInstance` is no longer usable.

---

## `render(node, container)`

```ts
function render(node: SinwanNode, container: Element): AppInstance;
```

Lower-level than `mount`: takes any `SinwanNode` (not necessarily a component) and renders it into the container. Useful for:

- Mounting a single element without wrapping it in a component
- Library code that wants to bypass the component instance machinery

```tsx
import { render } from "sinwan";

render(<h1>Hello, world!</h1>, document.body);
```

`render` does **not** create a `ComponentInstance` for the root — there is no `onMounted`/`onUnmounted` for the root level when you use it. It still recurses into child components, which do get instances and lifecycle hooks.

Returned `AppInstance.unmount()` cleans up everything just like `mount()`.

---

## `unmountNode(node)`

```ts
function unmountNode(node: MountedNode): void;
```

Recursively unmount a single `MountedNode`. You rarely need this directly — it’s used by `AppInstance.unmount()`. Exposed for advanced cases (custom mount strategies, partial unmounts, tests).

---

## `MountedNode`

The renderer returns a tagged-union `MountedNode` describing what was created:

```ts
type MountedNode =
  | MountedText // { type: "text", node: Text }
  | MountedReactiveText // { type: "reactive-text", node: Text, dispose }
  | MountedElement // { type: "element", node: Element, children, eventCleanups, attrDisposers, refCleanup }
  | MountedFragment // { type: "fragment", children, anchor?: Comment | null }
  | MountedReactiveBlock // { type: "reactive-block", dispose, children, startAnchor, endAnchor }
  | MountedComponent; // { type: "component", children, disposers, instance }
```

You almost never need to inspect this directly. It’s exposed for:

- Custom unmount sequences
- Test introspection (which DOM node corresponds to which signal)
- Future framework integrations

The `MountedReactiveBlock` variant is used by reactive helpers such as `<Show>`, `<For>`, `<Switch>`, `<Index>`, `<Key>`, and `<Dynamic>` to track anchored reactive subtrees. `<Portal>` uses a portal descriptor so its out-of-tree children can be cleaned up with the owner tree.

---

## Attributes

The renderer maps JSX props to DOM attributes/properties via the rules already covered in [`07-jsx.md`](./07-jsx.md). The relevant module is `src/renderer/attributes.ts`. Key behaviours:

- **Aliases**: `className → class`, `htmlFor → for`, `tabIndex → tabindex`, `crossOrigin → crossorigin`.
- **DOM properties** (set as `el.foo = value`): `value`, `checked`, `selected`, `disabled`, `readOnly`, `multiple`, `indeterminate`.
- **Style objects**: each key set via `el.style[key] = value`, except keys containing `-` use `el.style.setProperty(key, value)` for custom CSS properties.
- **Class arrays / objects**:

  ```tsx
  <div class={["btn", primary && "btn--primary"]} />
  <div class={{ btn: true, "btn--active": isActive }} />
  ```

- **Reactive attributes**: passing a `Signal` or `Computed` wraps the attribute set in an `effect`, so future writes update only that one attribute.
- **Skipped props**: `children`, `key`, `ref`, `dangerouslySetInnerHTML`, and any `on…` event handler.

---

## Events

Direct binding via `el.addEventListener` (not delegation). Handler removal happens automatically on unmount.

Helpers exposed for advanced users:

```ts
import { bindEvent, bindEvents, isEventProp, toEventName } from "sinwan";

isEventProp("onClick"); // → true
toEventName("onMouseEnter"); // → "mouseenter"

const cleanup = bindEvent(el, "click", handler);
// later...
cleanup();
```

`bindEvents(el, props)` binds every `on…` prop on a props object, returning an array of cleanups.

---

## DOMOps

`src/renderer/dom-ops.ts` exposes a thin abstraction over native DOM APIs so the renderer can be unit tested or pointed at a server-side DOM implementation (`happy-dom`, `linkedom`, …):

```ts
import { domOps, setDOMOps, resetDOMOps, type DOMOps } from "sinwan";

interface DOMOps {
  createElement(tag: string): Element;
  createElementNS(namespace: string, tag: string): Element;
  createDocumentFragment(): DocumentFragment;
  createTextNode(text: string): Text;
  createComment(text: string): Comment;
  setAttribute(el: Element, key: string, value: string): void;
  removeAttribute(el: Element, key: string): void;
  setProperty(el: Element, key: string, value: unknown): void;
  insertBefore(parent: Node, child: Node, anchor: Node | null): void;
  appendChild(parent: Node, child: Node): void;
  remove(node: Node): void;
  setTextContent(node: Text, text: string): void;
  addEventListener(el: Element, event: string, handler: EventListener): void;
  removeEventListener(el: Element, event: string, handler: EventListener): void;
  parentNode(node: Node): Node | null;
  nextSibling(node: Node): Node | null;
}
```

The exported `domOps` object is live: renderer modules read from the same object. Use `setDOMOps(partial)` to override methods for tests or custom DOM hosts, and `resetDOMOps()` to restore native browser behavior.

---

## Lifecycle ↔ renderer interplay

| Renderer event                                                 | Hook fired                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Component setup begins (synchronous)                           | none — but `getCurrentInstance()` returns the new instance, so `onMounted` etc. register on it |
| Sub-component mounted                                          | child’s `onMounted` (children before parent overall)                                           |
| Component fully in DOM                                         | `onMounted` (bottom-up, owner instance active while the callback runs)                         |
| Reactive attribute / text / control-flow helper effect re-runs | owner’s `onUpdated`, queued after DOM writes and deduped per flush                             |
| Element removed via `unmount()`                                | `onUnmounted` (bottom-up, owner instance active while the callback runs)                       |
| Setup throws                                                   | walks parents, fires the first `onError` it finds                                              |

---

## Performance notes

- **Mount cost** is roughly one DOM operation per node + one effect per reactive binding.
- **Update cost** is O(1) per signal change. The renderer never walks the whole tree on update.
- **Unmount cost** is proportional to the number of MountedNodes; each one runs its disposers exactly once.
- **Memory**: each `MountedNode` is a tiny object with up to ~5 fields; one `ReactiveEffect` per reactive binding.

If you mount and unmount large subtrees frequently (e.g. modals), use `<Show>` when the subtree should follow reactive state and should be cleaned up when hidden.

---

## Common patterns

### Conditional UI

```tsx
import { Show } from "sinwan";

<Show when={isOpen}>
  <Modal />
</Show>;
```

### Hot-replace a sub-tree

```tsx
const container = document.getElementById("widget")!;

let current = mount(WidgetA, container);
function swap(next: SinwanComponent) {
  current.unmount();
  current = mount(next, container);
}
```

### Custom focus management on mount

```tsx
const Input = cc<{ initialValue?: string }>(({ initialValue = "" }) => {
  let el!: HTMLInputElement;
  onMounted(() => el.focus());
  return <input value={initialValue} ref={(n) => (el = n!)} />;
});
```

The renderer sets the ref before `onMounted` runs and clears it during unmount.

---

## See also

- [`05-lifecycle.md`](./05-lifecycle.md) — what runs when, in what order
- [`07-jsx.md`](./07-jsx.md) — JSX → element rules
- [`10-hydration.md`](./10-hydration.md) — alternative to `mount` for SSR’d HTML
- [`16-types.md`](./16-types.md) — full `MountedNode` and `AppInstance` type definitions
