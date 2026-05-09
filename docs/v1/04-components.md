# Components

Sinwan components are **plain functions** that take a `props` object and return a JSX tree (or a `Promise` of one). Three small factories add metadata for the renderer:

- `createComponent` — generic component
- `createPage` — top-level page (registered for `renderPage` / `streamPage`)
- `createLayout` — component that always receives `children`

All three are pure type/metadata wrappers. The runtime treats them identically: every component is just a function.

---

## `createComponent<P>(setup)`

```ts
function createComponent<P extends object = {}>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => RenderResult,
): SinwanComponent<P>;

type RenderResult = SinwanElement | Promise<SinwanElement>;
```

### Defining a component

```tsx
import { createComponent, signal } from "sinwan";

interface CardProps {
  title: string;
  subtitle?: string;
}

export const Card = createComponent<CardProps>(({ title, subtitle, children }) => (
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
const Counter = createComponent(() => {
  console.log("setup runs once");
  const count = signal(0);
  return <button onClick={() => count.value++}>{count}</button>;
});
```

### Returning async JSX

A component may return `Promise<SinwanElement>`:

```tsx
const Posts = createComponent(async () => {
  const posts = await fetch("/api/posts").then(r => r.json());
  return (
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  );
});
```

On the **client**, an async component briefly renders an empty placeholder; once the promise resolves, the renderer mounts the resolved tree in place. On the **server** (`renderToString`, `streamPage`), the renderer awaits the result before continuing — both APIs are `async`. For hydration, `renderToHydratableString` awaits the top-level call but does not stream nested promises (treat them as data fetched ahead of time).

### Display name

`createComponent` reads `fn.name` and stores it on `component._displayName`. Useful for debugging and dev tools:

```ts
console.log(Card._displayName);  // "Card" (or "AnonymousComponent")
```

You can override it for anonymous components:

```ts
const X = createComponent(() => <div />);
X._displayName = "X";
```

### The internal flag

Every component returned by `createComponent` carries `_SinwanComponent: true`. The JSX runtime uses this flag to decide whether to call the function during element construction (it doesn’t, by default — the renderer does). User code shouldn’t depend on this flag.

---

## `createPage<D>(setup)`

```ts
function createPage<D extends object = {}>(
  fn: (data: D) => RenderResult,
): SinwanPage<D>;
```

A **page** is a component-shaped function that takes a plain `data` object. Pages exist to give SSR a clean API where the framework hands the page a serialised state:

```tsx
import { createPage } from "sinwan";

interface HomeData {
  title: string;
  posts: { id: number; title: string }[];
}

export const HomePage = createPage<HomeData>(({ title, posts }) => (
  <Layout title={title}>
    <h1>{title}</h1>
    <ul>
      {posts.map(p => <li key={p.id}>{p.title}</li>)}
    </ul>
  </Layout>
));
```

### Registering and rendering pages

```ts
import { registerPage, renderPage } from "sinwan/server";

registerPage("home", HomePage);

const html = await renderPage("home", { title: "Home", posts: [] });
```

The page registry is a process-global `Map<string, SinwanPage>`. See [`09-ssr.md`](./09-ssr.md) for the full registry API (`getPage`, `hasPage`, `streamPage`).

Pages are not required for SSR — you can pass any element directly to `renderToString(<HomePage data={...} />)`. The registry is just a convenience pattern for routing frameworks (e.g. Hono, Bun.serve, Express) that map a route name to a renderer.

---

## `createLayout<P>(setup)`

```ts
function createLayout<P extends object = {}>(
  fn: (props: P & { children: SinwanNode }) => RenderResult,
): SinwanComponent<P & { children: SinwanNode }>;
```

A layout is a component whose `children` prop is **required** (typed as `SinwanNode`, never `undefined`). It’s ideal for HTML scaffolding:

```tsx
import { createLayout } from "sinwan";

interface LayoutProps {
  title?: string;
  lang?: string;
}

export const RootLayout = createLayout<LayoutProps>(({
  title = "App",
  lang = "en",
  children,
}) => (
  <html lang={lang}>
    <head>
      <meta charset="utf-8" />
      <title>{title}</title>
    </head>
    <body>{children}</body>
  </html>
));
```

Internally, `createLayout` is just `createComponent` with the children type tightened. There is no runtime difference.

---

## Props

Component props are a **plain object**. Sinwan does not clone or proxy them.

### Default values

Use destructuring defaults:

```tsx
const Button = createComponent<{ label?: string }>(({ label = "Click" }) => (
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

type Props = PropsWithChildren<{ title: string }>;  // children?: SinwanNode
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
interface Props { name: string | Signal<string> }
```

…or wrap it in a `computed` if you need a single reactive value internally.

---

## Children & slots

Children are typed as `SinwanNode | SinwanSlots`:

```ts
type SinwanNode =
  | string | number | boolean | null | undefined
  | SinwanElement
  | Promise<SinwanElement>
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
    main:   <Main />,
    footer: <Footer />,
  }}
/>
```

Inside the layout:

```tsx
const Layout = createComponent(({ children }) => {
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

Use `isSlots(children)` from `sinwan/server` to discriminate at runtime.

> Slots are a low-level mechanism. v1 doesn’t ship a `<Slot name="…" />` helper — you read keys off the object directly.

---

## Conditionals

Plain JS expressions:

```tsx
{isOpen && <Dialog />}
{user ? <UserCard {...user} /> : <Login />}
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

---

## Structural helpers

```tsx
import { Dynamic, Key, Portal, Visible } from "sinwan";

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

`<Key>` remounts its subtree when the key changes. `<Dynamic>` swaps the rendered tag/component. `<Visible>` toggles CSS `display` without unmounting children. `<Portal>` renders children into another DOM target and cleans them up with the owner tree.

---

## Errors during setup

If a component’s setup function throws, Sinwan walks up the parent chain looking for an `onError` handler:

```tsx
const Boundary = createComponent(({ children }) => {
  onError(err => console.error("caught in boundary:", err));
  return <>{children}</>;
});
```

If no handler is found, the error is logged via `console.error`. The faulty component is replaced by an empty text node so the rest of the tree continues to render. See [`05-lifecycle.md`](./05-lifecycle.md#onerror).

---

## Type reference

```ts
interface SinwanComponent<P extends object = {}> {
  (props: P & { children?: SinwanNode | SinwanSlots }):
    | SinwanElement
    | Promise<SinwanElement>;
  _SinwanComponent?: true;
  _displayName?: string;
}

interface SinwanPage<D extends object = {}> {
  (data: D): SinwanElement | Promise<SinwanElement>;
  _SinwanPage?: true;
  _displayName?: string;
}

type SinwanLayout<P extends object = {}> = SinwanComponent<P & { children: SinwanNode }>;
```

For the full set of exported types, see [`16-types.md`](./16-types.md).
