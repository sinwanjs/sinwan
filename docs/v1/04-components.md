# Components

Sinwan components are **plain functions** that take a `props` object and return a JSX tree (or a `Promise` of one). A single factory adds metadata for the renderer:

- `cc` — the universal component factory

`cc` is a pure type/metadata wrapper. The runtime treats all components identically: every component is just a function.

---

## `cc<P>(setup)`

```ts
function cc<P extends object = {}>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => RenderResult,
): SinwanComponent<P>;

type RenderResult = SinwanNode | Promise<SinwanNode>;
```

### Defining a component

```tsx
import { cc, signal } from "sinwan";

interface CardProps {
  title: string;
  subtitle?: string;
}

export const Card = cc<CardProps>(({ title, subtitle, children }) => (
  <article class="card">
    <h2>{title}</h2>
    {subtitle && <h3>{subtitle}</h3>}
    <div class="body">{children}</div>
  </article>
));
```

Use it like any function-component-shaped value:

```tsx
<Card title="Hello" subtitle="World">
  <p>Card body content.</p>
</Card>
```

### Setup runs **once** per mount/hydrate

The setup function executes once, when the component is mounted (or hydrated). It is **not** re-run when reactive values change — the renderer already wired them to the DOM. This is the SolidJS pattern.

```tsx
const Counter = cc(() => {
  console.log("setup runs once");
  const count = signal(0);
  return <button onClick={() => count.value++}>{count}</button>;
});
```

### Returning async JSX

A component may return `Promise<SinwanNode>`:

```tsx
const Posts = cc(async () => {
  const posts = await fetch("/api/posts").then((r) => r.json());
  return (
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  );
});
```

On the **client**, an async component briefly renders an empty placeholder; once the promise resolves, the renderer mounts the resolved tree in place. On the **server** (`renderToString`, `streamPage`), the renderer awaits the result before continuing — both APIs are `async`. For hydration, `renderToHydratableString` awaits the top-level call but does not stream nested promises (treat them as data fetched ahead of time).

### Display name

`cc` reads `fn.name` and stores it on `component._displayName`. Useful for debugging and dev tools:

```ts
console.log(Card._displayName); // "Card" (or "AnonymousComponent")
```

You can override it for anonymous components:

```ts
const X = cc(() => <div />);
X._displayName = "X";
```

### The internal flag

Every component returned by `cc` carries `_SinwanComponent: true`. The JSX runtime uses this flag to decide whether to call the function during element construction (it doesn't, by default — the renderer does). User code shouldn't depend on this flag.

---

## Using `cc` for pages and layouts

`cc` is the universal component factory. Use it for all components, including pages and layouts.

### Pages

A **page** is a component that takes a plain `data` object. Pages exist to give SSR a clean API where the framework hands the page a serialised state:

```tsx
import { cc } from "sinwan";

interface HomeData {
  title: string;
  posts: { id: number; title: string }[];
}

export const HomePage = cc<HomeData>(({ title, posts }) => (
  <Layout title={title}>
    <h1>{title}</h1>
    <ul>
      {posts.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  </Layout>
));
```

### Registering and rendering pages

```ts
import { registerPage, renderPage } from "sinwan/react-server";

registerPage("home", HomePage);

const html = await renderPage("home", { title: "Home", posts: [] });
```

The page registry is a process-global `Map<string, SinwanComponent>`. See [`09-ssr.md`](./09-ssr.md) for the full registry API (`getPage`, `hasPage`, `streamPage`).

Pages are not required for SSR — you can pass any element directly to `renderToString(<HomePage data={...} />)`. The registry is just a convenience pattern for routing frameworks (e.g. Hono, Bun.serve, Express) that map a route name to a renderer.

### Layouts

A layout is a component whose `children` prop is **required** (typed as `SinwanNode`, never `undefined`). It's ideal for HTML scaffolding:

```tsx
import { cc } from "sinwan";

interface LayoutProps {
  title?: string;
  lang?: string;
}

export const RootLayout = cc<LayoutProps>(
  ({ title = "App", lang = "en", children }) => (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  ),
);
```

Layouts are just regular components with the children type tightened. There is no runtime difference.

---

## Props

Component props are a **plain object**. Sinwan does not clone or proxy them.

### Default values

Use destructuring defaults:

```tsx
const Button = cc<{ label?: string }>(({ label = "Click" }) => (
  <button>{label}</button>
));
```

### Required vs optional

Type your props interface like any TS type. Sinwan adds `children` automatically:

```ts
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}
```

The injected `children` field is `SinwanNode | SinwanSlots | undefined`. Use the helpers:

```ts
import type { PropsWithChildren, PropsWithSlots } from "sinwan";

type Props = PropsWithChildren<{ title: string }>; // children?: SinwanNode
type SlotProps = PropsWithSlots<{ title: string }>; // children?: SinwanSlots
```

### Passing reactive props

Signals can be passed as props:

```tsx
const username = signal("Ada");

<Greeting name={username} />;
```

Inside `Greeting`, treat `name` as a `Signal<string>` if you want reactivity. If your component types `name` as `string`, it will see the **string at construction time** (because reading `name.value` happens once during setup) and lose reactivity. Prefer typing reactive props explicitly:

```tsx
interface Props {
  name: string | Signal<string>;
}
```

…or wrap it in a `computed` if you need a single reactive value internally.

---

## Children & slots

Children are typed as `SinwanNode | SinwanSlots`:

```ts
type SinwanNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | SinwanElement
  | Promise<SinwanNode>
  | HtmlEscapedString
  | SinwanNode[];

type SinwanSlots = Record<string, SinwanNode>;
```

### Single-child or array

```tsx
<Card>
  <p>Single child</p>
</Card>

<Card>
  <p>First</p>
  <p>Second</p>
</Card>
```

Both work. JSX flattens `children` into an array transparently.

### Named slots (advanced)

`SinwanSlots` lets you pass an object whose keys are slot names:

```tsx
<Layout
  children={{
    header: <Header />,
    main: <Main />,
    footer: <Footer />,
  }}
/>
```

Inside the layout:

```tsx
const Layout = cc(({ children }) => {
  const slots = children as SinwanSlots;
  return (
    <div>
      <header>{slots.header}</header>
      <main>{slots.main}</main>
      <footer>{slots.footer}</footer>
    </div>
  );
});
```

Use `isSlots(children)` from `sinwan/react-server` to discriminate at runtime.

> Slots are a low-level mechanism. v1 doesn’t ship a `<Slot name="…" />` helper — you read keys off the object directly.

---

## Conditionals

Plain JS expressions:

```tsx
{
  isOpen && <Dialog />;
}
{
  user ? <UserCard {...user} /> : <Login />;
}
```

For **reactive** conditionals, use `<Show>`:

```tsx
import { Match, Show, Switch } from "sinwan";

<Show when={user} fallback={<Login />}>
  {u => <UserCard {...u} />}
</Show>

<Switch fallback={<Idle />}>
  <Match when={loading}><Spinner /></Match>
  <Match when={error}>{err => <ErrorPanel error={err} />}</Match>
  <Match when={user}>{u => <UserCard {...u} />}</Match>
</Switch>
```

`<Show>` swaps one truthy/fallback branch. `<Switch>` renders the first truthy `<Match>`, or its fallback. Both swap branches between comment anchors, unmount the old branch, and fire lifecycle hooks for newly inserted component trees.

---

## Lists

```tsx
import { computed, For, Index } from "sinwan";

<ul>
  <For
    each={items}
    key={item => item.id}
    fallback={<li>No items yet.</li>}
  >
    {(item, index) => (
      <li>{index() + 1}. {item.label}</li>
    )}
  </For>
</ul>

<Index each={rows}>
  {(row, index) => {
    const label = computed(() => row().label);
    return <div>{index + 1}. {label}</div>;
  }}
</Index>
```

`<For>` performs keyed insert, remove, reorder, fallback, and cleanup work for signal-backed arrays. If `key` is omitted, item identity is used. `<Index>` keeps DOM rows stable by index and updates per-index item accessors, which is useful when list order is stable.

### Virtual scrolling

```tsx
import { Virtual } from "sinwan";

<Virtual
  each={items}
  key={(item) => item.id}
  itemHeight={50}
  containerHeight={400}
  overscan={5}
  fallback={<p>No items yet.</p>}
>
  {(item, index) => (
    <div>
      {index()}. {item.label}
    </div>
  )}
</Virtual>;
```

`<Virtual>` renders only the items visible inside a fixed-height scrollable container. It computes a window from `scrollTop`, `itemHeight`, `containerHeight`, and `overscan`, mounts only the rows in that window, and reuses keyed rows as the user scrolls. The total scrollable height is set automatically (`items.length * itemHeight`). Items are positioned absolutely at their correct `top` offset inside a relative content wrapper.

| Prop              | Type                                           | Required | Default | Description                                   |
| ----------------- | ---------------------------------------------- | -------- | ------- | --------------------------------------------- |
| `each`            | `Reactive<readonly T[]>`                       | Yes      | —       | Source array (signal, computed, or getter)    |
| `key`             | `(item: T, index: number) => unknown`          | No       | item    | Key function for stable row identity          |
| `itemHeight`      | `number`                                       | Yes      | —       | Fixed height of each row in pixels            |
| `containerHeight` | `number`                                       | Yes      | —       | Height of the scrollable viewport in pixels   |
| `overscan`        | `number`                                       | No       | `3`     | Extra rows to render above and below viewport |
| `fallback`        | `SinwanNode`                                   | No       | —       | Shown when `each` is empty or not an array    |
| `children`        | `(item: T, index: () => number) => SinwanNode` | Yes      | —       | Row renderer (same signature as `<For>`)      |

---

## Structural helpers

```tsx
import { Dynamic, Key, Portal, Visible, Virtual } from "sinwan";

<Key when={routeId}>
  {id => <RoutePage id={id} />}
</Key>

<Dynamic component={as} href="/docs">Docs</Dynamic>

<Visible when={isOpen} as="section">
  <Panel />
</Visible>

<Portal mount={document.body}>
  <Dialog />
</Portal>
```

`<Key>` remounts its subtree when the key changes. `<Dynamic>` swaps the rendered tag/component. `<Visible>` toggles CSS `display` without unmounting children. `<Portal>` renders children into another DOM target and cleans them up with the owner tree. `<Virtual>` renders only the visible slice of a large list with absolute positioning and scroll tracking (see [Virtual scrolling](#virtual-scrolling)).

---

## Errors during setup

If a component’s setup function throws, Sinwan walks up the parent chain looking for an `onError` handler:

```tsx
const Boundary = cc(({ children }) => {
  onError((err) => console.error("caught in boundary:", err));
  return <>{children}</>;
});
```

If no handler is found, the error is logged via `console.error`. The faulty component is replaced by an empty text node so the rest of the tree continues to render. See [`05-lifecycle.md`](./05-lifecycle.md#onerror).

---

## `ErrorBoundary`

A control-flow primitive that catches errors thrown during **rendering** of its children and displays a fallback UI instead.

```ts
import { ErrorBoundary } from "sinwan";
```

### Props

```ts
interface ErrorBoundaryProps {
  /** Fallback to display when an error is caught. */
  fallback?: SinwanNode | ((error: Error, reset: () => void) => SinwanNode);
  /** The child tree to render (and protect). */
  children?: SinwanNode;
}
```

| Prop       | Type                                         | Description                                     |
| ---------- | -------------------------------------------- | ----------------------------------------------- |
| `fallback` | `SinwanNode \| (error, reset) => SinwanNode` | Static node or function receiving error + reset |
| `children` | `SinwanNode`                                 | The subtree being error-protected               |

---

### Basic usage — static fallback

When a child throws during rendering, the fallback is shown instead:

```tsx
import { cc, ErrorBoundary } from "sinwan";

const App = cc(() => (
  <ErrorBoundary fallback={<p>Something went wrong.</p>}>
    <DangerousComponent />
  </ErrorBoundary>
));
```

If `DangerousComponent` throws, the user sees "Something went wrong." instead of a broken page.

---

### Function fallback — accessing the error

Pass a function to `fallback` to receive the `Error` object and a `reset` function:

```tsx
const App = cc(() => (
  <ErrorBoundary
    fallback={(error, reset) => (
      <div class="error-panel">
        <h2>Error</h2>
        <pre>{error.message}</pre>
        <button onClick={reset}>Try again</button>
      </div>
    )}
  >
    <DangerousComponent />
  </ErrorBoundary>
));
```

| Parameter | Type         | Description                                     |
| --------- | ------------ | ----------------------------------------------- |
| `error`   | `Error`      | The caught error instance                       |
| `reset`   | `() => void` | Re-renders the children tree (clears the error) |

---

### Reset behavior

Calling `reset()` re-renders the protected children from scratch. If the error was transient (e.g. a race condition), the component may recover:

```tsx
let attempts = 0;

const Flaky = cc(() => {
  attempts++;
  if (attempts < 3) throw new Error("not ready");
  return <span>Loaded on attempt {attempts}</span>;
});

const App = cc(() => (
  <ErrorBoundary
    fallback={(err, reset) => (
      <button onClick={reset}>Retry ({err.message})</button>
    )}
  >
    <Flaky />
  </ErrorBoundary>
));
```

After clicking "Retry" twice, `Flaky` successfully renders.

---

### How it works internally

1. `ErrorBoundary` is a **control-flow primitive** (`Symbol.for("Sinwan.ErrorBoundary")`).
2. The renderer pushes itself onto an internal `errorBoundaryStack` before rendering children.
3. If a child throws during render, the `catch` block:
   - Converts the thrown value to an `Error` instance.
   - Evaluates the `fallback` (static or function).
   - Renders the fallback content in place of the children.
4. A `resetSignal` (internal signal) is tracked by the effect. Calling `reset()` increments the signal, which triggers a re-run of the entire boundary effect — clearing old children and re-attempting the render.
5. The boundary is popped off the stack in a `finally` block, ensuring nested boundaries work correctly.

```
┌─ ErrorBoundary ────────────────────────────────┐
│                                                │
│  Push self onto errorBoundaryStack             │
│  try {                                         │
│    renderChildren → DOM                        │
│  } catch (err) {                               │
│    renderFallback(err, reset) → DOM            │
│  } finally {                                   │
│    Pop self from stack                         │
│  }                                             │
│                                                │
│  reset() → resetSignal++ → re-run effect       │
└────────────────────────────────────────────────┘
```

---

### Nesting boundaries

Error boundaries can be nested. The **nearest** boundary catches the error:

```tsx
<ErrorBoundary fallback={<p>Outer fallback</p>}>
  <Header />
  <ErrorBoundary fallback={<p>Inner fallback</p>}>
    <Sidebar />
  </ErrorBoundary>
  <Main />
</ErrorBoundary>
```

- If `Sidebar` throws → "Inner fallback" is shown, `Header` and `Main` remain intact.
- If `Main` throws → "Outer fallback" replaces the entire tree.

---

### What ErrorBoundary does NOT catch

| Scenario                         | Caught? | Why                                               |
| -------------------------------- | ------- | ------------------------------------------------- |
| Error in component render        | ✅      | Thrown during synchronous setup/render            |
| Error in child component         | ✅      | Propagates up the render tree                     |
| Error in event handler           | ❌      | Event handlers run asynchronously, outside render |
| Error in `useEffect`             | ❌      | Effects run after render (microtask)              |
| Error in `setTimeout`            | ❌      | Asynchronous, not part of render                  |
| Promise rejection (non-Suspense) | ❌      | Use try/catch in async code                       |

For async errors, use try/catch inside the handler itself:

```tsx
const App = cc(() => {
  const handleClick = async () => {
    try {
      await riskyOperation();
    } catch (err) {
      showToast(err.message);
    }
  };

  return <button onClick={handleClick}>Do it</button>;
});
```

---

### Server-side rendering

`ErrorBoundary` works identically during SSR (`renderToString`, `streamPage`, `streamHydratablePage`):

- If a child throws on the server, the fallback is rendered into the HTML stream.
- The `reset` function is a no-op in the server context (no interactivity).

```tsx
// Works in SSR — fallback is serialized into the HTML
const html = await renderToString(
  <ErrorBoundary fallback={<p>Server error</p>}>
    <DataComponent />
  </ErrorBoundary>,
);
```

---

### Best practices

1. **Place boundaries around isolated features** — not the entire app. This keeps the rest of the UI functional when one section fails.
2. **Use function fallbacks** for production — log the error and provide a retry button.
3. **Combine with `<Suspense>`** — use Suspense for loading states and ErrorBoundary for failures:

```tsx
<ErrorBoundary fallback={(err) => <ErrorDisplay error={err} />}>
  <Suspense fallback={<Spinner />}>
    <AsyncContent />
  </Suspense>
</ErrorBoundary>
```

4. **Don't rely on boundaries for event handlers** — handle those errors locally.
5. **Log errors** in the fallback function for observability:

```tsx
<ErrorBoundary
  fallback={(error, reset) => {
    reportError(error); // Send to monitoring
    return <RetryPanel onRetry={reset} />;
  }}
>
  <App />
</ErrorBoundary>
```

---

## Type reference

```ts
interface SinwanComponent<P extends object = {}> {
  (
    props: P & { children?: SinwanNode | SinwanSlots },
  ): SinwanNode | Promise<SinwanNode>;
  _SinwanComponent?: true;
  _displayName?: string;
}
```

For the full set of exported types, see [`16-types.md`](./16-types.md).
