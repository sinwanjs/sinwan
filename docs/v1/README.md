# Sinwan — Documentation v1

**Sinwan** is a small, modern UI library combining:

- **Fine-grained reactivity** (signals, computed, effects) à la SolidJS / Vue 3
- **A React-shaped JSX runtime** (`react-jsx` / `react-jsxdev` compatible)
- **A client renderer** that mounts components directly to real DOM (no virtual DOM)
- **Streaming SSR** via `ReadableStream`
- **Resumable hydration** — the server emits markers, the client reuses the existing DOM
- **Vue-style component lifecycle** (`onMounted`, `onUnmounted`, `onUpdated`, `onError`)
- **Provide / inject** dependency injection
- **Runtime-agnostic core** (Bun, Node ≥ 18, Deno, Cloudflare Workers, browsers)

Sinwan ships as a dual ESM / CJS package with separate **development** and **production** bundles, mirroring the React publication model.

> Status: **v1 — production ready**. Public API frozen for the 1.x line.

---

## Documentation map

| Section                                              | Purpose                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [`00-philosophy.md`](./00-philosophy.md)             | Core principles, the "Setup Once" model, and mental model      |
| [`01-getting-started.md`](./01-getting-started.md)   | Install, set up TypeScript / JSX, write your first component   |
| [`02-architecture.md`](./02-architecture.md)         | High-level design, mental model, rendering pipeline            |
| [`03-reactivity.md`](./03-reactivity.md)             | `signal`, `computed`, `effect`, `batch`, `nextTick`, scheduler |
| [`04-components.md`](./04-components.md)             | `createComponent`, `createPage`, `createLayout`, props, slots  |
| [`05-lifecycle.md`](./05-lifecycle.md)               | `onMounted`, `onUnmounted`, `onUpdated`, `onError`, instance   |
| [`06-provide-inject.md`](./06-provide-inject.md)     | Dependency injection across the component tree                 |
| [`07-jsx.md`](./07-jsx.md)                           | JSX runtime, `Fragment`, `raw`, dev runtime, configuration     |
| [`08-renderer.md`](./08-renderer.md)                 | `mount`, `render`, `unmountNode`, attributes, events, DOMOps   |
| [`09-ssr.md`](./09-ssr.md)                           | `renderToString`, `renderPage`, `streamPage`, page registry    |
| [`10-hydration.md`](./10-hydration.md)               | `hydrate`, hydration markers, SSR + hydrate workflow           |
| [`11-escaping.md`](./11-escaping.md)                 | `escapeHtml`, `safeHtml`, `HtmlEscapedString`, security        |
| [`12-runtime-compat.md`](./12-runtime-compat.md)     | Bun / Node / Deno / Workers / Browser support matrix           |
| [`13-build-and-deploy.md`](./13-build-and-deploy.md) | The build pipeline, `dist/` layout, package conditions         |
| [`14-recipes.md`](./14-recipes.md)                   | Counter, todo list, async data, theming, SSR + hydrate         |
| [`15-api-reference.md`](./15-api-reference.md)       | Full alphabetical API reference with signatures                |
| [`16-types.md`](./16-types.md)                       | Every exported TypeScript type with explanations               |
| [`17-troubleshooting.md`](./17-troubleshooting.md)   | Common pitfalls, error messages, debugging                     |
| [`CHANGELOG.md`](./CHANGELOG.md)                     | Versioned change log for v1.x                                  |

---

## Quick taste

```tsx
import { signal, mount, createComponent } from "sinwan";

const Counter = createComponent(() => {
  const count = signal(0);
  return (
    <button onClick={() => (count.value += 1)}>Clicked {count} times</button>
  );
});

mount(Counter, document.getElementById("app")!);
```

```ts
// SSR (Node / Bun / Deno)
import { renderToString } from "sinwan/server";
const html = await renderToString(<App />);
```

```ts
// Hydrate the server-rendered HTML on the client
import { hydrate } from "sinwan";
hydrate(App, document.getElementById("app")!);
```

---

## Versioning

- This documentation describes **Sinwan v1.1.1**.
- Every breaking change between minor releases is listed in [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT — see the project root.
