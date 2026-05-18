# Server-Side Rendering

Sinwan’s server module renders component trees to **HTML strings** or **byte streams**. It runs on every modern JS runtime: Bun, Node ≥ 18, Deno, Cloudflare Workers — anywhere Web Streams and `TextEncoder` are available.

Import everything from `sinwan/react-server`:

```ts
import {
  renderToString,
  renderPage,
  registerPage,
  getPage,
  hasPage,
  isSlots,
  streamPage,
  streamHydratablePage,
  streamHydratableNode,
  renderToHydratableString,
  renderNodeToHydratableString,
  renderShell,
  streamShell,
} from "sinwan/react-server";
```

---

## `renderToString(node)`

```ts
function renderToString(node: SinwanNode): Promise<string>;
```

Render any node to a complete HTML string. It’s `async` because components and JSX may resolve to `Promise<SinwanNode>`.

```tsx
import { renderToString } from "sinwan/react-server";

const html = await renderToString(<App data={data} />);
// "<!doctype html><html>...</html>"
```

### What it handles

| Input                          | Output                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| `null`, `undefined`, `boolean` | `""`                                                        |
| `string`                       | escaped string (`&`, `<`, `>`, `"`, `'`)                    |
| `number`                       | raw stringified                                             |
| `HtmlEscapedString`            | the underlying string (already trusted)                     |
| Array                          | concatenation of children                                   |
| `Promise<SinwanNode>`          | awaited, then rendered                                      |
| Functional component           | called (possibly async), then rendered                      |
| Intrinsic `<tag>`              | `<tag …attrs>children</tag>` (no closing for void elements) |

Void elements (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `param`, `source`, `track`, `wbr`) emit no closing tag and ignore children.

### Attribute serialisation

- `className` → `class`, `htmlFor` → `for`.
- `value === true` → bare attribute (`disabled`).
- `value` is `null`, `undefined`, or `false` → omitted.
- `dangerouslySetInnerHTML={{__html}}` → injected as inner HTML, **trusted as-is**.
- Other values → escaped string in `key="value"`.

> **Security**: untrusted user input must be passed as `string` children (auto-escaped) or wrapped via `escapeHtml`. Anything inside `dangerouslySetInnerHTML.__html` or `safeHtml(...)`/`raw(...)` is trusted verbatim. See [`11-escaping.md`](./11-escaping.md).

### Async components

```tsx
const Posts = cc(async () => {
  const items = await db.posts.findAll();
  return (
    <ul>
      {items.map((p) => (
        <li>{p.title}</li>
      ))}
    </ul>
  );
});

const html = await renderToString(<Posts />);
```

Async components, async JSX, and async helpers all work as long as you `await` the top-level call.

---

## Page registry

For applications that map route names to renderers, Sinwan ships a tiny in-memory page registry.

```ts
function registerPage<D>(name: string, page: SinwanComponent<D>): void;
function getPage<D>(name: string): SinwanComponent<D> | undefined;
function hasPage(name: string): boolean;
function renderPage<D>(name: string, data: D): Promise<string>;
```

Usage:

```ts
import { cc, registerPage, renderPage } from "sinwan";

const HomePage = cc<{ title: string }>(({ title }) => (
  <Layout title={title}>...</Layout>
));

registerPage("home", HomePage);

// in your route handler:
const html = await renderPage("home", { title: "Home" });
```

Throws `Error: Page "<name>" not found in registry` if the name was never registered. Pages are stored in a process-global `Map`; if you need request-scoped pages, register them before each render or skip the registry and call `renderToString(<HomePage data={...} />)` directly.

---

## Streaming SSR — `streamPage(page, data)`

```ts
function streamPage<D>(
  page: SinwanComponent<D>,
  data: D,
): ReadableStream<Uint8Array>;
```

Returns a Web `ReadableStream<Uint8Array>` that emits HTML chunks as they are produced — no buffering of the full output. The encoder is `TextEncoder` so chunks are UTF-8 bytes ready to send.

```ts
import { streamPage } from "sinwan/react-server";

// Bun
Bun.serve({
  fetch(req) {
    const stream = streamPage(HomePage, { title: "Home" });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});
```

```ts
// Node (with web fetch / Hono)
import { Hono } from "hono";
const app = new Hono();
app.get("/", (c) =>
  c.body(streamPage(HomePage, { title: "Home" }), 200, {
    "Content-Type": "text/html; charset=utf-8",
  }),
);
```

```ts
// Cloudflare Workers
export default {
  fetch(req: Request) {
    return new Response(streamPage(HomePage, data), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
```

### Behaviour

- Open tag → enqueued immediately, before children are resolved.
- Children → streamed left-to-right as each one resolves.
- Async children pause the stream until they resolve, then push their chunk.
- Closing tag → enqueued after all children.
- An error inside the page propagates as `controller.error(err)` and tears down the stream.

This means a slow async leaf doesn’t block the rest of the document’s top — useful for time-to-first-byte (TTFB) and progressive rendering.

---

## Hydration-aware SSR

Hydration-aware functions emit HTML with **hydration markers** so the client `hydrate()` can pair signals/effects/events to the right DOM nodes without re-rendering.

```ts
function renderToHydratableString<P>(
  component: SinwanComponent<P>,
  props?: P,
): Promise<string>;

function renderNodeToHydratableString(node: SinwanNode): Promise<string>;

function streamHydratablePage(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
): ReadableStream<Uint8Array>;

function streamHydratableNode(node: SinwanNode): ReadableStream<Uint8Array>;
```

```tsx
import { renderToHydratableString } from "sinwan/react-server";

const html = await renderToHydratableString(App, { user });
// '<div data-sinwan-id="c0"><p>Count: <!--sinwan-t:0-->5<!--/sinwan-t--></p>...</div>'
```

The full marker protocol is documented in [`10-hydration.md`](./10-hydration.md).

Use standard `renderToString` / `streamPage` when **no client-side reactivity** is needed (static SSR pages). Use hydratable string or stream helpers when the same component will be hydrated on the client.

---

## Slots helper — `isSlots(children)`

```ts
function isSlots(children: unknown): children is SinwanSlots;
```

A type-guard that returns `true` for plain objects (not arrays, not `HtmlEscapedString`, not nullish):

```tsx
const Layout = cc(({ children }) => {
  if (isSlots(children)) {
    return (
      <div>
        <header>{children.header}</header>
        <main>{children.main}</main>
      </div>
    );
  }
  return <div>{children}</div>; // single child or array
});
```

Slots are documented in [`04-components.md`](./04-components.md#named-slots-advanced).

---

## Examples

### Bun + page registry

```ts
import { Bun } from "bun";
import { registerPage, renderPage } from "sinwan/react-server";
import { HomePage } from "./pages/Home";

registerPage("home", HomePage);

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      const html = await renderPage("home", { title: "Welcome" });
      return new Response("<!doctype html>" + html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});
```

### Node + Express + streaming

```ts
import express from "express";
import { Readable } from "node:stream";
import { streamPage } from "sinwan/react-server";
import { HomePage } from "./pages/Home";

const app = express();

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.write("<!doctype html>");
  // Convert Web ReadableStream → Node Readable
  Readable.fromWeb(streamPage(HomePage, { title: "Home" }) as any).pipe(res);
});

app.listen(3000);
```

### Cloudflare Workers

```ts
import { renderToString } from "sinwan/react-server";
import { App } from "./App";

export default {
  async fetch(req: Request): Promise<Response> {
    const html = await renderToString(<App />);
    return new Response("<!doctype html>" + html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
```

---

## Automatic shell hydration — `renderShell` / `streamShell`

`renderShell` and `streamShell` wrap a hydratable component render in a complete HTML document. They auto-inject:

- `<!doctype html>` plus the `<html>` / `<head>` / `<body>` scaffolding.
- A configurable mount container (default `<div id="app">`) carrying a `data-sinwan-root` marker.
- A `<script type="application/json" data-sinwan-props>…</script>` block carrying the JSON-serialised props.
- Any `<script>` / `<link rel="stylesheet">` you ask for.
- An optional inline boot snippet that dynamically imports your client bundle and calls `hydrate(Component, container, props)` — no more wiring `<script>` tags or `hydrate()` calls by hand.

```ts
function renderShell<P>(options: ShellOptions<P>): Promise<string>;
function streamShell<P>(options: ShellOptions<P>): ReadableStream<Uint8Array>;
```

### Minimal example

```tsx
// server.ts
import { renderShell } from "sinwan/react-server";
import App from "./App";

const html = await renderShell({
  component: App,
  props: { user: { name: "Ada" } },
  title: "Home",
  scripts: [{ src: "/assets/styles.css" }],
  bootScript: { module: "/assets/client.js" },
});

return new Response(html, {
  headers: { "Content-Type": "text/html; charset=utf-8" },
});
```

The client bundle simply re-exports `App` (and `hydrate`) so the auto boot snippet can wire them up:

```ts
// client.ts
export { hydrate } from "sinwan";
export { default } from "./App";
```

That’s it — no manual `<script>` or `hydrate()` calls.

### Streaming variant

```ts
import { streamShell } from "sinwan/react-server";

return new Response(
  streamShell({
    component: App,
    props,
    title: "Home",
    bootScript: { module: "/assets/client.js" },
  }),
  { headers: { "Content-Type": "text/html; charset=utf-8" } },
);
```

`streamShell` flushes the document head and opening container immediately, then streams the hydratable body left-to-right (same semantics as `streamHydratablePage`), then closes the shell with the props block, scripts, and boot snippet.

### `ShellOptions`

| Option           | Default                                 | Description                                                                                                                                                                   |
| ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `component`      | _required_                              | Component to render and hydrate.                                                                                                                                              |
| `props`          | `{}`                                    | Props passed to the component on the server and embedded for the client.                                                                                                      |
| `title`          | _none_                                  | Document `<title>`.                                                                                                                                                           |
| `lang`           | `"en"`                                  | `<html lang>` attribute.                                                                                                                                                      |
| `charset`        | `"utf-8"`                               | `<meta charset>`.                                                                                                                                                             |
| `viewport`       | `"width=device-width, initial-scale=1"` | `<meta name="viewport">`. Pass `null` to omit.                                                                                                                                |
| `head`           | `""`                                    | Trusted HTML inserted verbatim at the end of `<head>`.                                                                                                                        |
| `stylesheets`    | `[]`                                    | `[{ href, crossOrigin?, integrity? }]` rendered as `<link rel="stylesheet">` in `<head>`.                                                                                     |
| `scripts`        | `[]`                                    | Strings or `{ src, module?, defer?, async?, crossOrigin?, integrity?, placement? }`. `placement: "head"` puts the script in `<head>`, otherwise it lands at body end.         |
| `containerId`    | `"app"`                                 | `id` of the mount element.                                                                                                                                                    |
| `containerTag`   | `"div"`                                 | Tag of the mount element.                                                                                                                                                     |
| `htmlAttrs`      | `{}`                                    | Extra attributes on `<html>`.                                                                                                                                                 |
| `bodyAttrs`      | `{}`                                    | Extra attributes on `<body>` (e.g. `{ className: "dark" }`).                                                                                                                  |
| `embedProps`     | `true`                                  | Emit the `<script type="application/json" data-sinwan-props>` block.                                                                                                          |
| `serializeProps` | `JSON.stringify`                        | Custom serialiser if your props contain non-JSON values.                                                                                                                      |
| `bootScript`     | `true`                                  | `false` to skip; `string` to inline a custom snippet; or `{ module, componentExport?, hydrateModule?, hydrateExport? }` to auto-import a module and call `hydrate()` for you. |

### Boot snippet semantics

When `bootScript` is an object the shell emits an inline `<script type="module">` that:

1. Dynamically imports the given `module` URL (and `hydrateModule` if separate).
2. Resolves the component as `module[componentExport ?? "default"]`.
3. Reads the embedded props JSON via `document.querySelector("script[data-sinwan-props]")`.
4. Calls `hydrate(Component, document.getElementById(containerId), props)`.

If you’d rather control hydration yourself, pass `bootScript: false` and emit your own `<script>` via the `scripts` option.

### Security

- Props are escaped to neutralise `</script>` and similar sequences inside the JSON block. If you stringify untrusted data into props, prefer the default serialiser — it sanitises `<`, `>`, `&`, `\u2028`, `\u2029`.
- `head` is inserted verbatim. Treat it as trusted HTML.
- Stylesheet and script URLs are HTML-escaped but not validated. Don’t feed user input straight in.

---

## Partial hydration — `island()` / `hydrateIslands()`

Use **islands** when you want a mostly-static page with pockets of interactivity. Wrap any component with `island()` and the renderer:

- emits the surrounding markup as plain static HTML (no hydration markers);
- emits the island subtree with a fresh hydration-marker counter — independent of every other island;
- wraps the island in `<tag data-sinwan-island="<name>" data-sinwan-island-props="<json>">…</tag>`.

On the client, `hydrateIslands(registry)` walks the document, finds every island, deserialises its props, looks up the matching component in `registry`, and calls `hydrate(Component, el, props)` — only those subtrees become interactive, everything else stays static.

### Server

```ts
import { island } from "sinwan";
import { renderToString } from "sinwan/react-server";

const Counter = cc<{ initial: number }>(({ initial }) => {
  const count = signal(initial);
  return <button onClick={() => count.value++}>n={count}</button>;
});

const CounterIsland = island(Counter, { name: "counter" });

const App = () => (
  <main>
    <h1>Static heading</h1>
    <CounterIsland initial={5} />
  </main>
);

const html = await renderToString(<App />);
// <main><h1>Static heading</h1><div data-sinwan-island="counter"
//   data-sinwan-island-props="{&quot;initial&quot;:5}"
//   ><button data-sinwan-id="c0" data-sinwan-ev="click:0">n=<!--sinwan-t:0-->5<!--/sinwan-t--></button></div></main>
```

`island()` works with every server entry point — `renderToString`, `streamPage`, `renderToHydratableString`, `streamHydratablePage`, `renderShell`, and `streamShell`. The wrapper element is the same in all of them.

### Client

```ts
import { hydrateIslands } from "sinwan";
import { Counter } from "./Counter";
import { ProductGallery } from "./ProductGallery";

hydrateIslands({
  counter: Counter,
  gallery: ProductGallery,
});
// → returns [{ name, element, instance }, …] for every hydrated island.
```

Pass a `root` element as the second argument to scope hydration (e.g. an Astro/Eleventy partial). Use the third `options` argument to override `onMissing` / `onError` callbacks.

### `island(Component, options?)`

| Option           | Default                          | Description                                                      |
| ---------------- | -------------------------------- | ---------------------------------------------------------------- |
| `name`           | `Component.name` or `island_<n>` | Identifier used to look the component up in the client registry. |
| `tag`            | `"div"`                          | HTML tag rendered around the island.                             |
| `serializeProps` | `JSON.stringify`                 | Custom prop serialiser. Throwing surfaces a server error.        |

Notes & contracts:

- The `children` prop is stripped before serialisation — it has already been rendered into the island markers and would not survive `JSON.stringify` if it contained JSX.
- Each island has its own marker counter (`c0`, `t0`, `click:0`, …), so islands can be hydrated independently and in any order.
- The wrapper element is HTML-escaped: untrusted strings inside props are safe inside the `data-sinwan-island-props` attribute.

### Why this fixes the v1 limitation

Previously you could only hydrate the whole component tree (`hydrate(App, container)`) or none of it. With `island()` + `hydrateIslands()` you can ship mostly-static HTML and hydrate just the interactive parts — the canonical "islands architecture" pattern.

---

## See also

- [`10-hydration.md`](./10-hydration.md) — making SSR HTML interactive
- [`11-escaping.md`](./11-escaping.md) — security & trusted HTML
- [`12-runtime-compat.md`](./12-runtime-compat.md) — what runs where
