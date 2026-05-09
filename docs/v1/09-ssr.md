# Server-Side Rendering

Sinwan’s server module renders component trees to **HTML strings** or **byte streams**. It runs on every modern JS runtime: Bun, Node ≥ 18, Deno, Cloudflare Workers — anywhere Web Streams and `TextEncoder` are available.

Import everything from `sinwan/server`:

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
} from "sinwan/server";
```

---

## `renderToString(node)`

```ts
function renderToString(node: SinwanNode): Promise<string>;
```

Render any node to a complete HTML string. It’s `async` because components and JSX may resolve to `Promise<SinwanElement>`.

```tsx
import { renderToString } from "sinwan/server";

const html = await renderToString(<App data={data} />);
// "<!doctype html><html>...</html>"
```

### What it handles

| Input | Output |
|---|---|
| `null`, `undefined`, `boolean` | `""` |
| `string` | escaped string (`&`, `<`, `>`, `"`, `'`) |
| `number` | raw stringified |
| `HtmlEscapedString` | the underlying string (already trusted) |
| Array | concatenation of children |
| `Promise<SinwanElement>` | awaited, then rendered |
| Functional component | called (possibly async), then rendered |
| Intrinsic `<tag>` | `<tag …attrs>children</tag>` (no closing for void elements) |

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
const Posts = createComponent(async () => {
  const items = await db.posts.findAll();
  return <ul>{items.map(p => <li>{p.title}</li>)}</ul>;
});

const html = await renderToString(<Posts />);
```

Async components, async JSX, and async helpers all work as long as you `await` the top-level call.

---

## Page registry

For applications that map route names to renderers, Sinwan ships a tiny in-memory page registry.

```ts
function registerPage<D>(name: string, page: SinwanPage<D>): void;
function getPage<D>(name: string): SinwanPage<D> | undefined;
function hasPage(name: string): boolean;
function renderPage<D>(name: string, data: D): Promise<string>;
```

Usage:

```ts
import { createPage, registerPage, renderPage } from "sinwan";

const HomePage = createPage<{ title: string }>(({ title }) => (
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
function streamPage<D>(page: SinwanPage<D>, data: D): ReadableStream<Uint8Array>;
```

Returns a Web `ReadableStream<Uint8Array>` that emits HTML chunks as they are produced — no buffering of the full output. The encoder is `TextEncoder` so chunks are UTF-8 bytes ready to send.

```ts
import { streamPage } from "sinwan/server";

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
app.get("/", c => c.body(streamPage(HomePage, { title: "Home" }), 200, {
  "Content-Type": "text/html; charset=utf-8",
}));
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
import { renderToHydratableString } from "sinwan/server";

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
const Layout = createComponent(({ children }) => {
  if (isSlots(children)) {
    return (
      <div>
        <header>{children.header}</header>
        <main>{children.main}</main>
      </div>
    );
  }
  return <div>{children}</div>;  // single child or array
});
```

Slots are documented in [`04-components.md`](./04-components.md#named-slots-advanced).

---

## Examples

### Bun + page registry

```ts
import { Bun } from "bun";
import { registerPage, renderPage } from "sinwan/server";
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
import { streamPage } from "sinwan/server";
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
import { renderToString } from "sinwan/server";
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

## Limitations of v1

- **No automatic shell hydration**: you’re responsible for inserting your client `<script>` tag and a `hydrate()` call.
- **Streaming + hydration markers** is supported via `renderToHydratableString` followed by streaming the result, but `streamPage` itself does not emit markers (the marker numbering depends on tree-walk order, which streaming doesn’t change but the API split makes the use cases explicit).
- **No partial hydration** (islands) yet — hydrate the whole component or none of it.

These are tracked for a 1.x minor release.

---

## See also

- [`10-hydration.md`](./10-hydration.md) — making SSR HTML interactive
- [`11-escaping.md`](./11-escaping.md) — security & trusted HTML
- [`12-runtime-compat.md`](./12-runtime-compat.md) — what runs where
