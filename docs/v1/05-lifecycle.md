# Lifecycle Hooks

Sinwan exposes Vue-style lifecycle hooks that register on the **current component instance**. They must be called synchronously while a component instance is active: inside a component’s setup function, or inside another lifecycle hook owned by that component.

```ts
import {
  onMounted,
  onUnmounted,
  onUpdated,
  onDispose,
  onHydrated,
  onServer,
  onClient,
  onError,
} from "sinwan";
```

| Hook          | Fires when                                   | Order                             |
| ------------- | -------------------------------------------- | --------------------------------- |
| `onMounted`   | After the component's DOM is in the document | Bottom-up (children → parent)     |
| `onUnmounted` | When the component is removed                | Bottom-up (children → parent)     |
| `onUpdated`   | After a reactive update inside the component | Per-component, in scheduler order |
| `onDispose`   | When the component's effects are disposed    | Bottom-up (children → parent)     |
| `onHydrated`  | After hydration completes (not fresh mount)  | Bottom-up (children → parent)     |
| `onServer`    | Immediately during setup, **server only**    | Synchronous                       |
| `onClient`    | Immediately during setup, **client only**    | Synchronous                       |
| `onError`     | When this component or a descendant throws   | Bubbles up the tree               |

All hooks follow the same rule: **register synchronously while a component instance is active**. Calling them from module scope, event handlers, timers, promise continuations, or other code with no active component instance throws synchronously.

---

## Async Components and Lifecycle Hooks

Sinwan supports async components as first-class rendering primitives — you can make a component async and return a `Promise<SinwanNode>`. However, lifecycle hooks have specific requirements in async contexts:

### Lifecycle hooks must be called before `await`

Lifecycle hooks (`onMounted`, `onUpdated`, `onUnmounted`, etc.) must be called **synchronously before any `await`** in an async component. After an `await`, the component instance context is lost and calling lifecycle hooks will throw:

```tsx
// ❌ WRONG - onUpdated called after await
const Counter = cc(async () => {
  const count = signal(0);

  const data = await fetch("/api/data"); // context lost here

  onUpdated(() => {
    console.log("updated", count.value); // Error: onUpdated() called outside of component setup
  });

  return <div>{count}</div>;
});

// ✅ CORRECT - onUpdated called before await
const Counter = cc(async () => {
  const count = signal(0);

  onUpdated(() => {
    console.log("updated", count.value); // registered while context is active
  });

  const data = await fetch("/api/data"); // safe to await after hooks are registered

  return <div>{count}</div>;
});
```

### React hooks in async components

React-compatible hooks from `sinwan/react-client` (e.g., `useState`, `useEffect`) **do not work in async components** for the same reason — they rely on the component instance context which is lost after `await`. Use Sinwan's native signals instead:

```tsx
// ❌ WRONG - React hooks in async component
import { useState } from "sinwan/react-client";

const Counter = cc(async () => {
  const [count, setCount] = useState(0); // Error: Hook called outside of component setup
  const data = await fetch("/api/data");
  return <div>{count()}</div>;
});

// ✅ CORRECT - Use Sinwan signals
import { signal } from "sinwan";

const Counter = cc(async () => {
  const count = signal(0); // signals work fine in async components
  const data = await fetch("/api/data");
  return <div>{count}</div>;
});
```

### Signals work in async components

Sinwan's native `signal()`, `computed()`, and `effect()` work correctly in async components because they don't depend on the component instance context:

```tsx
const AsyncComponent = cc(async () => {
  const count = signal(0);
  const doubled = computed(() => count.value * 2);

  const data = await fetch("/api/data"); // await is safe

  effect(() => {
    console.log("count changed:", count.value);
  });

  return <div>{doubled}</div>;
});
```

---

## `onMounted(fn)`

```ts
function onMounted(fn: () => void): void;
```

Runs after the component is fully mounted to the DOM. Useful for:

- Reading layout (`getBoundingClientRect`)
- Initialising third-party widgets that need a real element
- Starting timers, intervals, or external subscriptions
- Logging analytics page views

```tsx
const Card = cc(() => {
  const ref = signal<HTMLElement | null>(null);

  onMounted(() => {
    console.log("card mounted at", performance.now());
  });

  return <div>...</div>;
});
```

### Multiple `onMounted` calls

You can call `onMounted` multiple times in the same setup. The hooks fire in **registration order**:

```tsx
cc(() => {
  onMounted(() => console.log("first"));
  onMounted(() => console.log("second"));
  return <div />;
});
// logs:
//   first
//   second
```

### Order across the tree

`onMounted` fires **bottom-up** — children before parent — so by the time a parent’s hook runs, every descendant is already mounted and its hooks have fired:

```text
mount(App)
  ├─ Header              ─┐
  ├─ Body                  │ children mount first
  │   ├─ Item              │
  │   └─ Item              │
  └─ Footer              ─┘
fireMountedHooks(App):
  Item.onMounted   ←┐
  Item.onMounted    │ bottom-up
  Body.onMounted    │
  Header.onMounted  │
  Footer.onMounted  │
  App.onMounted   ←─┘ root last
```

---

## `onUnmounted(fn)`

```ts
function onUnmounted(fn: () => void): void;
```

Runs when the component is removed from the DOM (via `app.unmount()` or by being replaced in a parent). Use it to clean up:

```tsx
const Clock = cc(() => {
  const now = signal(new Date());
  const id = setInterval(() => (now.value = new Date()), 1000);

  onUnmounted(() => clearInterval(id));

  return <time>{now}</time>;
});
```

### What runs automatically vs manually

- **Effects created by the renderer** (reactive text, reactive attributes) are disposed automatically — you don’t need `onUnmounted` for them.
- **Effects you create with `effect()` during setup** are **not** auto-disposed in v1. Either store the disposer and call it from `onUnmounted`, or push it onto `getCurrentInstance().effects` (advanced):

```tsx
import { effect, onUnmounted } from "sinwan";

cc(() => {
  const dispose = effect(() => {
    document.title = `App (${count.value})`;
  });
  onUnmounted(dispose);
  return <div>...</div>;
});
```

### Order

`onUnmounted` runs **bottom-up**, just like `onMounted`. After all hooks have fired, the renderer disposes the instance’s effects, and the DOM is removed.

---

## `onUpdated(fn)`

```ts
function onUpdated(fn: () => void): void;
```

Runs after renderer-owned reactive DOM updates inside the component. Reactive text, reactive attributes, and built-in helpers such as `<Show>`, `<For>`, `<Switch>`, `<Index>`, `<Key>`, `<Dynamic>`, and `<Portal>` queue the owning component’s hook after DOM writes finish. Multiple updates in the same scheduler flush are deduped, and the initial render does not fire `onUpdated`.

If you need to react to a specific signal change outside renderer-owned DOM work, use an explicit effect:

```tsx
effect(() => {
  count.value; // track
  // do something after the next flush
  nextTick(() => measure());
});
```

---

## `onDispose(fn)`

```ts
function onDispose(fn: () => void): void;
```

Runs when the component's reactive effects are disposed. Unlike `onUnmounted`, this also fires during **Activity soft-hide** — when `<Activity mode="hidden">` hides a subtree but keeps the DOM mounted. Use it to clean up anything tied to the reactive scope rather than just DOM presence:

```tsx
const Widget = cc(() => {
  onDispose(() => {
    console.log("reactive scope disposed");
  });
  return <div>...</div>;
});
```

### `onDispose` vs `onUnmounted`

| Scenario             | `onUnmounted`        | `onDispose`          |
| -------------------- | -------------------- | -------------------- |
| Component unmounted  | Fires                | Fires                |
| Activity hidden      | Fires                | Fires                |
| Activity shown again | Re-register in setup | Re-register in setup |

---

## `onHydrated(fn)`

```ts
function onHydrated(fn: () => void): void;
```

Runs after the component is **hydrated** from server-rendered HTML. Only fires during hydration; it does **not** fire on a fresh client-side `mount()`. Useful for:

- Starting animations that should only play on hydrated pages
- Measuring hydration time
- Initialising client-only libraries that need the pre-existing DOM

```tsx
const Page = cc(() => {
  onHydrated(() => {
    console.log("hydrated, DOM preserved from server");
  });
  return <div>...</div>;
});
```

---

## `onServer(fn)`

```ts
function onServer(fn: () => void): void;
```

Executes **immediately during setup** if running on the server (`typeof window === "undefined"`). No-op on the client. Useful for:

- Server-only data fetching
- Logging on the server
- Generating server-specific metadata

```tsx
const Article = cc(({ id }) => {
  let data: ArticleData;

  onServer(() => {
    data = fetchArticleOnServer(id);
  });

  onClient(() => {
    data = fetchArticleOnClient(id);
  });

  return <article>{data.title}</article>;
});
```

---

## `onClient(fn)`

```ts
function onClient(fn: () => void): void;
```

Executes **immediately during setup** if running on the client (`typeof window !== "undefined"`). No-op on the server. Use it for:

- Client-only libraries (browser APIs, `localStorage`, `IntersectionObserver`)
- Lazy-loading client-side features
- Analytics or tracking that only makes sense in a browser

```tsx
const Analytics = cc(() => {
  onClient(() => {
    import("analytics-lib").then(({ track }) => track("page"));
  });
  return <div />;
});
```

---

## `onError(fn)`

```ts
function onError(fn: (err: Error) => void): void;
```

Register a handler that catches errors thrown during the **setup** of this component or any descendant.

```tsx
const Boundary = cc(({ children }) => {
  onError((err) => {
    console.error("Boundary caught:", err);
    // optionally surface in UI by writing to a signal
  });
  return <>{children}</>;
});
```

### Bubbling

When a component throws during setup, Sinwan walks up the parent chain looking for the **first** instance with at least one `onError` handler:

```text
   App                ← no handler
    └─ Page           ← onError handler  ← caught here
        └─ Section
            └─ Card   ← throws
```

If no handler is found anywhere in the chain, Sinwan logs `[Sinwan] Unhandled component error: <err>` to `console.error` and the faulty component is replaced by an empty text node — the rest of the tree continues rendering.

### Multiple handlers

Multiple `onError` calls on the same instance all fire (in registration order) for a single error.

### What `onError` does **not** catch

- Errors thrown **outside** setup, e.g. inside a click handler. Use a regular `try/catch` there or a global `window.onerror`.
- Errors inside an `effect()` callback. Wrap them yourself if you need recovery.
- Errors during **server** rendering (`renderToString` rejects the promise instead).

---

## `getCurrentInstance()`

```ts
import { getCurrentInstance, type ComponentInstance } from "sinwan";

const instance: ComponentInstance | null = getCurrentInstance();
```

Returns the active component instance during setup or a synchronous lifecycle callback, or `null` when no component instance is active. Power users can read its fields for advanced use cases:

```ts
interface ComponentInstance {
  uid: number;
  component: SinwanComponent<any>;
  props: Record<string, any>;
  parent: ComponentInstance | null;
  children: ComponentInstance[];
  effects: CleanupFn[];
  isMounted: boolean;
  isUnmounted: boolean;
  _mountedHooks: (() => void)[];
  _unmountedHooks: (() => void)[];
  _updatedHooks: (() => void)[];
  _disposeHooks: (() => void)[];
  _hydratedHooks: (() => void)[];
  _errorHooks: ((err: Error) => void)[];
  provides: Record<string | symbol, unknown>;
  // ...element ref...
}
```

`getCurrentInstance()` returning `null` is how lifecycle hooks decide to throw — don’t call them from utility helpers that run later; call them from component setup or synchronously from a lifecycle callback.

### Pushing your own dispose into `instance.effects`

If you have a long-lived effect or subscription, you can register its dispose function for automatic cleanup on unmount:

```ts
import { getCurrentInstance, effect } from "sinwan";

const dispose = effect(() => {
  /* ... */
});
const i = getCurrentInstance();
if (i) i.effects.push(dispose);
```

The renderer already pushes its own internal effects this way. Doing it yourself is fully supported.

---

## Idempotency rules

- `onMounted` only fires once per instance — calling `mount()` twice on the same instance is not supported.
- `onUnmounted` only fires once. Subsequent unmount attempts are no-ops.
- After unmount, `instance.isMounted` is `false` and `instance.isUnmounted` is `true`.

---

## Cheat sheet

```tsx
import {
  signal,
  effect,
  batch,
  nextTick,
  cc,
  onMounted,
  onUnmounted,
  onUpdated,
  onDispose,
  onHydrated,
  onServer,
  onClient,
  onError,
  getCurrentInstance,
} from "sinwan";

const Widget = cc(() => {
  // 1. State
  const count = signal(0);

  // 2. Side effects with auto-cleanup
  onMounted(() => {
    const id = setInterval(() => count.value++, 1000);
    onUnmounted(() => clearInterval(id));
  });

  // 3. Dispose fires on both unmount AND Activity soft-hide
  onDispose(() => console.log("reactive scope cleaned up"));

  // 4. Hydration-only setup
  onHydrated(() => console.log("hydrated from server HTML"));

  // 5. Environment-aware setup
  onServer(() => console.log("runs during SSR"));
  onClient(() => console.log("runs in the browser"));

  // 6. Errors
  onError((err) => console.error("[Widget]", err));

  // 7. Reactive effect outside the renderer
  const stopTitleSync = effect(() => {
    document.title = `count: ${count.value}`;
  });
  onUnmounted(stopTitleSync);

  // 8. Wait for the next flush
  count.value++;
  nextTick(() => console.log("count is now", count.peek()));

  return <button onClick={() => batch(() => count.value++)}>{count}</button>;
});
```
