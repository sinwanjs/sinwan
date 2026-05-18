# React Server APIs

> Status: **Phase 4 — complete.** All entries below are imported from `sinwan/react-server`.

> **Why a separate sub-path?** Sinwan's existing `sinwan/react-server` already exports its own `renderToString` (no hydration markers). To avoid breaking that public API while also delivering a React-named `renderToString` (which **does** include hydration markers), the React server adapters live behind `sinwan/react-server`. The two are completely independent.

---

## Signature Deviation

React `renderToString` is synchronous. Sinwan's renderer awaits async children, so all string-producing adapters return `Promise<string>`. Stream and pipe adapters match React's signatures exactly.

---

## APIs

### `renderToString(node)`

**Signature:** `function renderToString(node: ReactNode): Promise<string>`

**Description:** Renders a React/Sinwan element tree to an HTML string with **hydration markers**. The returned HTML is meant to be served to the browser and rehydrated with `hydrateRoot`. Includes markers necessary for Sinwan's hydration system to attach event listeners and restore component state. Async components are awaited during rendering.

**Returns:** `Promise<string>` — HTML string with hydration markers.

**SSR:** Server-only — throws on client.

**Reactivity:** Pass-through to `renderNodeToHydratableString`.

**Example:**

```ts
import { renderToString } from "sinwan/react-server";

// Basic usage
const html = await renderToString(<App />);

// With Bun.serve
Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      const html = await renderToString(<HomePage />);
      return new Response(html, {
        headers: { "content-type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
});

// Complete HTML document
const renderPage = async (Component: ComponentType, props: any) => {
  const content = await renderToString(<Component {...props} />);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <title>My App</title>
  </head>
  <body>
    <div id="app">${content}</div>
    <script type="module" src="/client.js"></script>
  </body>
</html>`;
};

// Error handling
const safeRender = async (node: ReactNode) => {
  try {
    return await renderToString(node);
  } catch (error) {
    console.error("Render failed:", error);
    return await renderToString(<ErrorPage />);
  }
};
```

---

### `renderToStaticMarkup(node)`

**Signature:** `function renderToStaticMarkup(node: ReactNode): Promise<string>`

**Description:** Renders a React/Sinwan element tree to an HTML string **without hydration markers**. Use for purely static HTML output where rehydration is not needed — emails, PDF generation, RSS feeds, static snapshots, or when generating HTML for external systems. Async components are still awaited.

**Returns:** `Promise<string>` — HTML string without hydration markers.

**SSR:** Server-only — throws on client.

**Reactivity:** Pass-through to `renderToString` (Sinwan native, no markers).

**Example:**

```ts
import { renderToStaticMarkup } from "sinwan/react-server";

// Email generation
const generateEmail = async (template: string, data: any) => {
  const html = await renderToStaticMarkup(
    <EmailTemplate template={template} data={data} />
  );

  return html;
};

// Static snapshot for CMS
const generateSnapshot = async (page: string) => {
  const content = await renderToStaticMarkup(<ContentPage slug={page} />);
  await Bun.write(`snapshots/${page}.html`, content);
};

// PDF generation (via external tool)
const generatePDF = async (invoice: Invoice) => {
  const html = await renderToStaticMarkup(<InvoiceTemplate invoice={invoice} />);
  const pdf = await htmlToPDF(html);
  return pdf;
};

// RSS feed generation
const generateRSS = async () => {
  const items = await getRecentPosts();
  const html = await renderToStaticMarkup(<RSSFeed items={items} />);
  return html;
};

// Comparing with renderToString
const comparison = async () => {
  const withMarkers = await renderToString(<App />);
  const withoutMarkers = await renderToStaticMarkup(<App />);

  console.log(`With markers: ${withMarkers.length} bytes`);
  console.log(`Without markers: ${withoutMarkers.length} bytes`);
  console.log(`Savings: ${withMarkers.length - withoutMarkers.length} bytes`);
};
```

---

### `renderToReadableStream(node, options?)`

**Signature:** `function renderToReadableStream(node: ReactNode, options?: RenderToReadableStreamOptions): Promise<ReactReadableStream>`

Where `ReactReadableStream` extends `ReadableStream<Uint8Array>` with:

```ts
{
  allReady: Promise<void>; // resolves when stream closes
}
```

**Description:** Streams the rendered HTML as a Bun-native `ReadableStream<Uint8Array>`. Suitable for HTTP responses in modern runtimes (Bun, Deno, Node 18+). Supports streaming Suspense boundaries — fallback content is streamed first, then resolved content as async components complete. The `allReady` promise resolves when the entire stream has closed.

**Options:**

| Option                   | Type                          | Description                                 |
| ------------------------ | ----------------------------- | ------------------------------------------- |
| `signal`                 | `AbortSignal`                 | Aborts the stream and propagates the reason |
| `bootstrapScriptContent` | `string`                      | Inlined `<script>` after markup             |
| `bootstrapScripts`       | `string \| BootstrapScript[]` | `<script src="...">` tags                   |
| `bootstrapModules`       | `string \| BootstrapScript[]` | `<script type="module" src="...">` tags     |
| `nonce`                  | `string`                      | CSP nonce applied to all scripts            |
| `onError`                | `(err: unknown) => void`      | Called on stream errors                     |
| `onShellReady`           | `() => void`                  | Called when shell (non-Suspense) is ready   |
| `onAllReady`             | `() => void`                  | Called when entire stream closes            |

**Returns:** `Promise<ReactReadableStream>` — streaming response.

**SSR:** Server-only — throws on client.

**Reactivity:** Pass-through to `streamHydratableNode` + bootstrap appender.

**Example:**

```ts
import { renderToReadableStream } from "sinwan/react-server";
import type { BootstrapScript } from "sinwan/react-server";

// Basic streaming with Bun
Bun.serve({
  async fetch(req) {
    const stream = await renderToReadableStream(<App />, {
      bootstrapModules: ["/client.js"],
    });

    return new Response(stream, {
      headers: { "content-type": "text/html" },
    });
  },
});

// With abort signal
const handleRequest = async (req: Request) => {
  const controller = new AbortController();

  // Abort if client disconnects
  req.signal.addEventListener("abort", () => controller.abort());

  const stream = await renderToReadableStream(<App />, {
    signal: controller.signal,
    onError: (err) => {
      console.error("Stream error:", err);
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/html" },
  });
};

// With all bootstrap options
const streamWithBootstrap = await renderToReadableStream(<App />, {
  bootstrapScriptContent: `
    window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};
    console.log("Hydrating...");
  `,
  bootstrapScripts: [
    "/vendor/react.js",
    { src: "/app.js", integrity: "sha384-..." },
  ],
  bootstrapModules: [
    "/entry-client.js",
    { src: "/lazy-module.js", crossOrigin: "anonymous" },
  ],
  nonce: "random-nonce-123",
  onShellReady: () => {
    console.log("Shell ready — page is interactive");
  },
  onAllReady: () => {
    console.log("All content streamed");
  },
});

// Await all content (for debugging or caching)
const stream = await renderToReadableStream(<App />);
await stream.allReady;
const html = await new Response(stream).text();
console.log(`Total size: ${html.length} bytes`);

// Progressive enhancement pattern
const progressiveStream = await renderToReadableStream(
  <App />,
  {
    bootstrapScriptContent: `
      // Check for JavaScript support
      document.documentElement.classList.add('js');

      // Register service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js');
      }
    `,
    bootstrapModules: ["/client.js"],
  }
);
```

---

### `renderToPipeableStream(node, options?)`

**Signature:** `function renderToPipeableStream(node: ReactNode, options?: RenderToPipeableStreamOptions): PipeableStream`

Where `PipeableStream` is:

```ts
{
  pipe<W extends NodeJS_WritableStream>(destination: W): W;
  abort(reason?: unknown): void;
}
```

**Description:** Pumps Sinwan's hydratable stream into a Node.js `Writable` stream. Returns a `PipeableStream` object with `pipe()` to connect to a response stream and `abort()` to cancel rendering. Fires `onShellReady` when the first chunk is ready (non-Suspense content) and `onAllReady` when all async content has resolved.

**Options:**

| Option                   | Type                               | Description                           |
| ------------------------ | ---------------------------------- | ------------------------------------- |
| `signal`                 | `AbortSignal`                      | Aborts the stream                     |
| `bootstrapScriptContent` | `string`                           | Inlined `<script>` after markup       |
| `bootstrapScripts`       | `string \| BootstrapScript[]`      | Script URLs                           |
| `bootstrapModules`       | `string \| BootstrapScript[]`      | Module script URLs                    |
| `nonce`                  | `string`                           | CSP nonce                             |
| `onError`                | `(err: unknown) => string \| void` | Called on errors, can return error ID |
| `onShellError`           | `(err: unknown) => void`           | Called when shell rendering errors    |
| `onShellReady`           | `() => void`                       | Called when shell is ready to stream  |
| `onAllReady`             | `() => void`                       | Called when all content is ready      |

**Returns:** `PipeableStream` — with `pipe()` and `abort()` methods.

**SSR:** Server-only — throws on client.

**Reactivity:** Pass-through to `streamHydratableNode` + Node `Writable` adapter.

**Example:**

```ts
import { renderToPipeableStream } from "sinwan/react-server";
import { createServer } from "node:http";

// Basic Node.js server
createServer((req, res) => {
  res.setHeader("content-type", "text/html");

  const { pipe } = renderToPipeableStream(<App />, {
    onShellReady() {
      // Start streaming immediately
      pipe(res);
    },
    onShellError(err) {
      console.error("Shell error:", err);
      res.statusCode = 500;
      res.end("Server error");
    },
  });
}).listen(3000);

// With abort handling
createServer((req, res) => {
  const { pipe, abort } = renderToPipeableStream(<App />, {
    onShellReady() {
      pipe(res);
    },
    onError(err) {
      // Return error digest for client
      return `error-${Date.now()}`;
    },
  });

  req.on("close", () => {
    if (!res.writableEnded) {
      abort("Client disconnected");
    }
  });
});

// Full-featured example
const server = createServer((req, res) => {
  let didError = false;

  const { pipe, abort } = renderToPipeableStream(<App url={req.url} />, {
    bootstrapModules: ["/client.js"],
    onShellReady() {
      res.statusCode = didError ? 500 : 200;
      res.setHeader("content-type", "text/html");
      pipe(res);
    },
    onShellError(err) {
      console.error("Shell error:", err);
      res.statusCode = 500;
      res.setHeader("content-type", "text/html");
      res.send("<h1>Something went wrong</h1>");
    },
    onError(err) {
      didError = true;
      console.error("Render error:", err);
      // Return digest for error UI
      return `error-${Math.random().toString(36).slice(2)}`;
    },
    onAllReady() {
      console.log("Fully rendered");
    },
  });

  // Handle client disconnect
  setTimeout(() => {
    if (res.socket?.destroyed) {
      abort("Timeout");
    }
  }, 30000);
});

// Express-compatible
import express from "express";
const app = express();

app.get("/", (req, res) => {
  const { pipe } = renderToPipeableStream(<App />, {
    onShellReady() {
      res.setHeader("content-type", "text/html");
      pipe(res);
    },
  });
});
```

---

### `resume(node, postponedState, options?)`

**Signature:** `function resume(node: ReactNode, postponedState: unknown, options?: ResumeOptions): Promise<ReactReadableStream>`

**Description:** React uses `resume` to continue a render previously paused by a `prerender` call. Sinwan's renderer is single-pass and never produces a `postponed` state, so this adapter **re-renders `node` from scratch**. The `postponedState` argument is accepted for API compatibility and ignored. Returns a readable stream like `renderToReadableStream`.

**Parameters:**

| Parameter        | Type            | Description                             |
| ---------------- | --------------- | --------------------------------------- |
| `node`           | `ReactNode`     | The element tree to render              |
| `postponedState` | `unknown`       | Ignored (for API compatibility)         |
| `options`        | `ResumeOptions` | Same as `RenderToReadableStreamOptions` |

**Returns:** `Promise<ReactReadableStream>` — streaming response.

**SSR:** Server-only — re-renders from scratch.

**Reactivity:** Best-effort fresh render (no postpone in v1).

**Example:**

```ts
import { resume, prerender } from "sinwan/react-server";

// Attempting to resume (will re-render from scratch)
const { prelude, postponed } = await prerender(<App />);

// Even with postponed state, Sinwan re-renders fresh
const stream = await resume(<App />, postponed, {
  bootstrapModules: ["/client.js"],
});

// For API compatibility with existing React code
const handlePrerender = async () => {
  // Phase 1: Prerender
  const prerenderResult = await prerender(<App />);

  // Store postponed state (undefined in Sinwan)
  await savePostponedState(prerenderResult.postponed);

  // Phase 2: Resume (fresh render in Sinwan)
  return await resume(<App />, prerenderResult.postponed);
};
```

---

### `resumeToPipeableStream(node, postponedState, options?)`

**Signature:** `function resumeToPipeableStream(node: ReactNode, postponedState: unknown, options?: ResumeToPipeableStreamOptions): PipeableStream`

**Description:** Pipeable stream variant of `resume`. Like `resume`, Sinwan's implementation re-renders from scratch since there is no postponed state support. The `postponedState` argument is accepted for API compatibility and ignored.

**Parameters:**

| Parameter        | Type                            | Description                             |
| ---------------- | ------------------------------- | --------------------------------------- |
| `node`           | `ReactNode`                     | The element tree to render              |
| `postponedState` | `unknown`                       | Ignored (for API compatibility)         |
| `options`        | `ResumeToPipeableStreamOptions` | Same as `RenderToPipeableStreamOptions` |

**Returns:** `PipeableStream` — with `pipe()` and `abort()` methods.

**SSR:** Server-only — re-renders from scratch.

**Reactivity:** Best-effort fresh render.

**Example:**

```ts
import { resumeToPipeableStream, prerenderToNodeStream } from "sinwan/react-server";

// Compatibility with React's resume pattern
createServer(async (req, res) => {
  // Load previously saved postponed state (will be undefined in Sinwan)
  const postponedState = await loadPostponedState();

  const { pipe } = resumeToPipeableStream(<App />, postponedState, {
    onShellReady() {
      res.setHeader("content-type", "text/html");
      pipe(res);
    },
  });
});
```

---

## Request-Scoped Abort Signal

`renderToReadableStream` and `renderToPipeableStream` register `options.signal` (or `null`) as the request-scoped signal exposed by `cacheSignal()`. Any call to `cacheSignal()` during the SSR render returns this signal, so user `fetch` calls inside loaders are cancelled when the request aborts.

**Example:**

```ts
import { renderToReadableStream, cache, cacheSignal } from "sinwan/react-server";

// Data loader with automatic cancellation
const fetchUser = cache(async (id: string) => {
  const res = await fetch(`https://api.example.com/users/${id}`, {
    signal: cacheSignal(), // Uses the request's AbortSignal
  });
  return res.json();
});

const UserPage = async ({ params }: { params: { id: string } }) => {
  const user = await fetchUser(params.id);
  return <UserProfile user={user} />;
};

// Server handler with proper cancellation
Bun.serve({
  async fetch(req) {
    const controller = new AbortController();

    // Link request signal to our controller
    req.signal.addEventListener("abort", () => {
      controller.abort();
    });

    const stream = await renderToReadableStream(<UserPage params={extractParams(req)} />, {
      signal: controller.signal,
    });

    return new Response(stream, {
      headers: { "content-type": "text/html" },
    });
  },
});
```

---

## SSR Safety / Reactivity

| API                                 | SSR         | Reactivity decision                                                                                                  |
| ----------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `renderToString`                    | server-only | pass-through to `renderNodeToHydratableString`                                                                       |
| `renderToStaticMarkup`              | server-only | pass-through to `renderToString` (Sinwan, no markers)                                                                |
| `renderToReadableStream`            | server-only | pass-through to `streamHydratableNode` + bootstrap appender                                                          |
| `renderToPipeableStream`            | server-only | pass-through to `streamHydratableNode` + Node `Writable` adapter                                                     |
| `resume` / `resumeToPipeableStream` | server-only | best-effort fresh render (no postpone in v1)                                                                         |
| `renderShell` / `streamShell`       | server-only | full-document wrapper around `renderToHydratableString` / `streamHydratablePage` (auto-injects shell + hydrate boot) |

---

## `renderShell(options)` / `streamShell(options)`

> Re-exported from `sinwan/react-server` so React-style consumers don't need to import from two sub-paths. The implementation is shared with `sinwan/react-server` — see [`09-ssr.md`](./09-ssr.md#automatic-shell-hydration--rendershell--streamshell) for the full option reference.

**Signatures:**

```ts
function renderShell<P>(options: ShellOptions<P>): Promise<string>;
function streamShell<P>(options: ShellOptions<P>): ReadableStream<Uint8Array>;
```

**Description:** Both helpers wrap a hydratable component render in a complete HTML document — `<!doctype html>`, `<head>`, mount container, embedded props JSON, configurable `<script>` / `<link>` tags, and an inline boot snippet that dynamically imports the client bundle and calls `hydrate(Component, container, props)` for you. Together they replace the manual `<!doctype html>…<script>…</script>` boilerplate shown in the `renderToString` examples above and fix v1's "no automatic shell hydration" limitation.

**Why not `renderToReadableStream` + `bootstrapModules`?** `renderToReadableStream` mirrors React signature 1:1: it appends raw `<script>` tags after the streamed body and otherwise leaves the document chrome to you. `streamShell` is opinionated — it emits the full doctype/`<html>`/`<head>`/`<body>` scaffolding, embeds props as JSON, and writes the `hydrate()` call. Pick the one that matches your migration path:

| Use case                                                            | Pick                          |
| ------------------------------------------------------------------- | ----------------------------- |
| Drop-in replacement for `react-dom/server.renderToReadableStream`   | `renderToReadableStream`      |
| Drop-in replacement for `react-dom/server.renderToString`           | `renderToString`              |
| You want Sinwan to author the full document and wire up `hydrate()` | `renderShell` / `streamShell` |

**Compatibility with React:** `renderShell` / `streamShell` are **Sinwan-specific**. React has no equivalent — its closest analogue is the bootstrap script options on `renderToReadableStream`. Treat the shell helpers as additive ergonomics; `renderToString` / `renderToReadableStream` / `renderToPipeableStream` continue to mirror the official React surface and remain unchanged.

**Example (React-style component + JSX):**

```tsx
import { renderShell } from "sinwan/react-server";
import App from "./App";

Bun.serve({
  async fetch() {
    const html = await renderShell({
      component: App,
      props: { user: { name: "Ada" } },
      title: "Home",
      stylesheets: [{ href: "/assets/styles.css" }],
      bootScript: { module: "/assets/client.js" },
    });

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});
```

```tsx
// /assets/client.ts — what the boot snippet imports
export { hydrate } from "sinwan";
export { default } from "./App";
```

**Streaming variant:**

```tsx
import { streamShell } from "sinwan/react-server";

const response = new Response(
  streamShell({
    component: App,
    props,
    title: "Home",
    bootScript: { module: "/assets/client.js" },
  }),
  { headers: { "content-type": "text/html; charset=utf-8" } },
);
```

**Options:** `ShellOptions<P>` covers `component`, `props`, `title`, `lang`, `charset`, `viewport`, `head`, `stylesheets`, `scripts`, `containerId`, `containerTag`, `htmlAttrs`, `bodyAttrs`, `embedProps`, `serializeProps`, and `bootScript`. The full reference (including the boot-snippet contract and the `<script type="application/json" data-sinwan-props>` payload) lives in [`09-ssr.md`](./09-ssr.md#shelloptions).

**Returns:**

- `renderShell` → `Promise<string>` (full document including doctype).
- `streamShell` → `ReadableStream<Uint8Array>` (flushes head + container immediately, streams the hydratable body, closes with props + scripts + boot snippet).

**SSR:** Server-only.

**Reactivity:** Pass-through to `renderToHydratableString` / `streamHydratablePage`.

---

## Islands (partial hydration)

`sinwan/react-server` re-exports `island()` so React-style components can opt
into the islands architecture without importing from a second sub-path. The
matching client runtime, `hydrateIslands`, ships from `sinwan/react-client`.

```tsx
// server.tsx — React JSX, Sinwan adapters
import { island, renderToString } from "sinwan/react-server";
import { Counter } from "./components/Counter";

const CounterIsland = island(Counter, { name: "counter" });

const html = await renderToString(
  <main>
    <h1>Static heading</h1>
    <CounterIsland initial={5} />
  </main>,
);
```

```tsx
// client.tsx — runs once at boot
import { hydrateIslands } from "sinwan/react-client";
import { Counter } from "./components/Counter";

hydrateIslands({ counter: Counter });
```

**Compatibility with React:** islands are **Sinwan-specific**. React
has no equivalent (its closest parallel is `'use client'` boundaries in RSC,
which require a bundler/runtime split Sinwan does not impose). The standard
React server entry points — `renderToString`, `renderToReadableStream`,
`renderToPipeableStream`, `resume`, and `resumeToPipeableStream` — keep their
React-shaped signatures and do not change behaviour when an `island()` is
present in the tree: they emit the same `<wrapper data-sinwan-island=…>`
output that `sinwan/react-server` produces, and existing `hydrateRoot` calls
continue to work.

See [`09-ssr.md`](./09-ssr.md#partial-hydration--island--hydrateislands) for
the full `island(Component, options?)` reference, the marker contract, and
the security notes for prop serialisation.
