# Runtime Compatibility

Sinwan is designed to run on every modern JS runtime. The core (reactivity, components, escaper, JSX) has **no runtime-specific code**; the renderers depend on standard Web APIs that are available everywhere relevant.

## Compatibility matrix

| Runtime                                   | Core | Client renderer | SSR (string) | SSR (stream) | Hydration | Notes                                                        |
| ----------------------------------------- | ---- | --------------- | ------------ | ------------ | --------- | ------------------------------------------------------------ |
| **Bun** ≥ 1.0                             | ✅   | ✅              | ✅           | ✅           | ✅        | Uses `Bun.escapeHTML` (native fast path)                     |
| **Node.js** ≥ 18                          | ✅   | n/a             | ✅           | ✅           | n/a       | `ReadableStream` and `TextEncoder` are global since 18       |
| **Node.js** ≥ 22                          | ✅   | n/a             | ✅           | ✅           | n/a       | Recommended for best perf                                    |
| **Deno** ≥ 1.30                           | ✅   | n/a             | ✅           | ✅           | n/a       | Web APIs are first-class                                     |
| **Cloudflare Workers**                    | ✅   | n/a             | ✅           | ✅           | n/a       | Streaming responses work natively                            |
| **Browsers** (Chrome/Firefox/Safari/Edge) | ✅   | ✅              | ✅\*         | ✅\*         | ✅        | \*can render to a string client-side; not a typical use case |

“n/a” means the feature requires a DOM — only the browser provides one.

## What Sinwan needs from the runtime

- **ECMAScript ES2020+** (optional chaining, nullish coalescing, BigInt, weak refs not required).
- `globalThis` (universal since Node 12, Deno 1, ES2020).
- `queueMicrotask` (universal since Node 11, all browsers since 2018).
- `WeakMap`, `Set`, `Map` (universal since ES2015).
- `Promise.all`, `async`/`await` (ES2017).

For the **server / streaming** path:

- `ReadableStream` (Node ≥ 18, Bun, Deno, Workers, browsers).
- `TextEncoder` (Node ≥ 11, all browsers since 2017, Bun, Deno, Workers).

For the **client** path:

- A browser-style DOM (`document`, `Element`, `Text`, `Comment`, `Node`).
- `addEventListener`/`removeEventListener`.

## Optional native fast paths

`escapeHtml` probes `globalThis.Bun?.escapeHTML` once at module load:

```ts
const _bun = (globalThis as any).Bun as
  | { escapeHTML?: (s: string) => string }
  | undefined;
const _nativeEscape =
  typeof _bun?.escapeHTML === "function"
    ? _bun.escapeHTML.bind(_bun)
    : undefined;
```

- If `Bun.escapeHTML` is present → use it (fast C path).
- Otherwise → portable JS implementation that short-circuits when the input has no HTML metacharacters.

There is **no `if (typeof Bun !== "undefined")` at runtime**: the probe runs once and stores the chosen function. Module evaluation is safe under every runtime.

## Browser & DOM-only modules

These modules touch the DOM directly and are intended for the browser only:

- `sinwan/renderer` (`mount`, `render`, `unmountNode`, `domOps`, …)
- `sinwan/hydration` (`hydrate`, `walk`, `markers`)

Importing them in pure-server code is harmless **as long as you don’t call** the DOM-touching functions. Tree-shaking by your bundler removes the unused code from server bundles automatically.

## Server-only modules

- `sinwan/react-server` (`renderToString`, `renderPage`, `streamPage`, `renderToHydratableString`, …)

These have no browser-specific dependencies but are usually unused in client bundles. Import them under a server-only entry point in your app.

## TypeScript types

`tsconfig.json` recommended setup:

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "strict": true,

    "jsx": "react-jsx",
    "jsxImportSource": "sinwan",
  },
}
```

If you target Node-only with TypeScript ≥ 5.5, replace `"DOM"` with the runtime-specific lib (e.g. `"WebWorker"` for Workers).

## Bundlers tested

| Bundler           | Status                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| **Bun bundler**   | First-class (Sinwan builds itself with it)                              |
| **Vite**          | ✅ — picks ESM + the `development`/`production` condition automatically |
| **Webpack** ≥ 5   | ✅ — uses CJS shim or ESM via conditions                                |
| **esbuild**       | ✅                                                                      |
| **Rollup** ≥ 3    | ✅                                                                      |
| **tsc-only emit** | ✅ — Sinwan already ships pre-bundled                                   |

`process.env.NODE_ENV` substitution is the standard way to pick the production bundle. Most bundlers do this for you (`vite build`, `webpack --mode=production`, etc.).

## Conditional exports

The package’s `exports` field uses nested conditions so each consumer gets the optimal artefact:

```jsonc
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": {
      "development": "./dist/esm/index.development.js",
      "production": "./dist/esm/index.production.min.js",
      "default": "./dist/esm/index.production.min.js",
    },
    "require": {
      "development": "./dist/cjs/index.development.js",
      "production": "./dist/cjs/index.production.min.js",
      "default": "./dist/index.js",
    },
    "default": "./dist/index.js",
  },
}
```

- **ESM consumers** (modern bundlers, Node 22 ESM): pick the right file via `development` / `production` conditions.
- **CJS consumers** (Node `require`, older Webpack): the top-level `dist/index.js` is a tiny CJS shim that branches on `process.env.NODE_ENV`, identical to React’s pattern.

The same scheme applies to `sinwan/jsx-runtime`, `sinwan/jsx-dev-runtime`, and `sinwan/react-server`.

## Worker / Edge specifics

### Cloudflare Workers

```ts
import { renderToString, streamPage } from "sinwan/react-server";
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

`streamPage` returns a Web `ReadableStream`, which Workers accept directly as a `Response` body — no adapter needed.

### Deno Deploy

```ts
import { renderToString } from "https://esm.sh/sinwan/react-server";
import { App } from "./App.tsx";

Deno.serve({ port: 8000 }, async () => {
  const html = await renderToString(<App />);
  return new Response("<!doctype html>" + html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});
```

### Node ≥ 18 with Express

Convert the Web stream to a Node stream using `Readable.fromWeb`:

```ts
import { Readable } from "node:stream";
import { streamPage } from "sinwan/react-server";

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.write("<!doctype html>");
  Readable.fromWeb(streamPage(HomePage, data) as any).pipe(res);
});
```

## Upgrading runtime versions

Sinwan does not pin a runtime; it adapts to whichever it’s running in. Upgrading Bun / Node / Deno is safe — every API used is part of the long-stable Web API surface.

## See also

- [`13-build-and-deploy.md`](./13-build-and-deploy.md) — how `dist/` is built and selected
- [`11-escaping.md`](./11-escaping.md) — the only runtime-conditional fast path
