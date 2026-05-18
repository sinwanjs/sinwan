# Sinwan — The React-Compatible Framework That Actually Performs

**Why settle for virtual DOM overhead when you can have React compatibility _and_ SolidJS-grade performance?**

Sinwan is the only UI library that delivers **fine-grained reactivity** (signals, computed values, effects) with a **fully React-compatible API surface** — no compromises, no migration nightmares, no rewriting your entire codebase.

## Why Developers Are Switching to Sinwan

### 🚀 **Performance Without the Rewrite**

- **Zero virtual DOM overhead** — direct DOM updates like SolidJS
- **Fine-grained reactivity** — only changed values trigger updates, not entire components
- **React API compatible** — drop-in replacement for components, hooks, and JSX
- **No `react` or `react-dom` dependency** — smaller bundles, faster installs

### 💼 **Enterprise-Ready Architecture**

- **Streaming SSR** with Suspense boundaries — send content while async data loads
- **Resumable hydration** — server-rendered DOM is _reused_, not discarded
- **Works everywhere** — Bun, Node 18+, Deno, Cloudflare Workers, browsers
- **Production-hardened** — v1.x API is frozen and battle-tested

### 🛠️ **Developer Experience That Respects Your Time**

- **Vue-style lifecycle hooks** — `onMounted`, `onUnmounted`, `onUpdated` that actually make sense
- **Provide/inject dependency injection** — clean, testable component trees
- **Single source of truth** — no more `useEffect` dependency hell or stale closures
- **TypeScript-first** — full type safety out of the box

> **Status: v1 — Production Ready.** Trusted in production by teams who refuse to choose between performance and compatibility.

---

## Documentation map

| Section                                                | Purpose                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| [`00-philosophy.md`](./00-philosophy.md)               | Core principles, the "Setup Once" model, and mental model            |
| [`01-getting-started.md`](./01-getting-started.md)     | Install, set up TypeScript / JSX, write your first component         |
| [`02-architecture.md`](./02-architecture.md)           | High-level design, mental model, rendering pipeline                  |
| [`03-reactivity.md`](./03-reactivity.md)               | `signal`, `computed`, `effect`, `batch`, `nextTick`, scheduler       |
| [`04-components.md`](./04-components.md)               | `cc`, props, slots                                                   |
| [`05-lifecycle.md`](./05-lifecycle.md)                 | `onMounted`, `onUnmounted`, `onUpdated`, `onError`, instance         |
| [`06-provide-inject.md`](./06-provide-inject.md)       | Dependency injection across the component tree                       |
| [`07-jsx.md`](./07-jsx.md)                             | JSX runtime, `Fragment`, `raw`, dev runtime, configuration           |
| [`08-renderer.md`](./08-renderer.md)                   | `mount`, `render`, `unmountNode`, attributes, events, DOMOps         |
| [`09-ssr.md`](./09-ssr.md)                             | `renderToString`, `renderPage`, `streamPage`, page registry          |
| [`10-hydration.md`](./10-hydration.md)                 | `hydrate`, hydration markers, SSR + hydrate workflow                 |
| [`11-escaping.md`](./11-escaping.md)                   | `escapeHtml`, `safeHtml`, `HtmlEscapedString`, security              |
| [`12-runtime-compat.md`](./12-runtime-compat.md)       | Bun / Node / Deno / Workers / Browser support matrix                 |
| [`13-build-and-deploy.md`](./13-build-and-deploy.md)   | The build pipeline, `dist/` layout, package conditions               |
| [`14-recipes.md`](./14-recipes.md)                     | Counter, todo list, async data, theming, SSR + hydrate               |
| [`15-api-reference.md`](./15-api-reference.md)         | Full alphabetical API reference with signatures                      |
| [`16-types.md`](./16-types.md)                         | Every exported TypeScript type with explanations                     |
| [`17-troubleshooting.md`](./17-troubleshooting.md)     | Common pitfalls, error messages, debugging                           |
| **React Integration** ↓                                | **Drop-in React compatibility layer**                                |
| [`18-react-interop.md`](./18-react-interop.md)         | SHARED APIs: `createContext`, `lazy`, `use`, `cache`, `memo`         |
| [`19-react-hooks.md`](./19-react-hooks.md)             | All 18 hooks: `useState`, `useEffect`, `useTransition`, etc.         |
| [`20-react-components.md`](./20-react-components.md)   | `Suspense`, `createPortal`, `createRoot`, resource hints             |
| [`21-react-server-apis.md`](./21-react-server-apis.md) | `renderToString`, `renderToReadableStream`, `renderToPipeableStream` |
| [`22-react-static-apis.md`](./22-react-static-apis.md) | `prerender`, `prerenderToNodeStream` for SSG/ISR                     |
| [`23-react-unstable.md`](./23-react-unstable.md)       | `Activity`, `ViewTransition`, `useEffectEvent` (experimental)        |
| [`CHANGELOG.md`](./CHANGELOG.md)                       | Versioned change log for v1.x                                        |

---

## See It In Action

### Reactive Counter (No Re-Renders!)

```tsx
import { signal, mount, cc } from "sinwan";

const Counter = cc(() => {
  const count = signal(0);
  return (
    <button onClick={() => (count.value += 1)}>Clicked {count} times</button>
  );
});

mount(Counter, document.getElementById("app")!);
```

**The difference:** Only the text node updates. The button component doesn't re-render. Compare to React where the entire component function runs again.

### Drop-In React Replacement

```tsx
import { useState, createRoot } from "sinwan/react-client";

const Counter = () => {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((c) => c + 1)}>{count}</button>;
};

createRoot(document.getElementById("app")!).render(<Counter />);
```

**Zero learning curve.** If you know React, you already know Sinwan.

### Streaming SSR with Suspense

```tsx
// Server: Stream starts immediately, async data fills in
import { renderToReadableStream } from "sinwan/react-server";

const stream = await renderToReadableStream(<App />, {
  bootstrapModules: ["/client.js"],
});

return new Response(stream, { headers: { "content-type": "text/html" } });
```

### Resumable Hydration

```tsx
// Client: Reuses server-rendered DOM, no double work
import { hydrateRoot } from "sinwan/react-client";

hydrateRoot(document.getElementById("app")!, <App />);
```

---

## Sinwan vs. The Alternatives

| Feature                 | React           | Vue       | SolidJS        | **Sinwan**                |
| ----------------------- | --------------- | --------- | -------------- | ------------------------- |
| Fine-grained reactivity | ❌ Virtual DOM  | ⚠️ Opt-in | ✅             | ✅ **Built-in**           |
| React API compatibility | ✅              | ❌        | ⚠️ Similar JSX | ✅ **Full compatibility** |
| Bundle size (min+gz)    | ~40KB           | ~23KB     | ~7KB           | ~**8KB**                  |
| Streaming SSR           | ✅ Suspense     | ✅        | ⚠️ Limited     | ✅ **Full support**       |
| Resumable hydration     | ❌ Full rebuild | ❌        | ❌             | ✅ **DOM reuse**          |
| No runtime dependencies | ❌              | ❌        | ✅             | ✅ **Zero deps**          |
| TypeScript-first        | ⚠️ Community    | ✅        | ✅             | ✅ **Native**             |

### Why Not Just Use React?

React's virtual DOM and re-render model create performance ceilings. Sinwan gives you the same API without the overhead — your existing React knowledge transfers, but your app runs faster with smaller bundles.

### Why Not Just Use Vue?

Vue requires learning a new ecosystem. Sinwan lets you keep React patterns, libraries, and team expertise while getting Vue-grade reactivity.

### Why Not Just Use SolidJS?

SolidJS is excellent but lacks React compatibility. Sinwan bridges that gap — migrate incrementally or use as a drop-in replacement.

---

## Migration Paths

### From React

```bash
# Replace react with sinwan/react-client
npm uninstall react react-dom
npm install sinwan
```

```tsx
// Before: React
import { useState } from "react";
import { createRoot } from "react-dom/client";

// After: Sinwan — same code, better performance
import { useState, createRoot } from "sinwan/react-client";
```

### Progressive Adoption

Use Sinwan for new features while keeping existing React code:

```tsx
import { cc } from "sinwan";
import { OldReactComponent } from "./legacy";

const NewSinwanFeature = cc(() => {
  // New code uses signals
  return <OldReactComponent />; // Old code still works
});
```

---

## Production Checklist

- ✅ **v1.x API is frozen** — no breaking changes until v2
- ✅ **100% test coverage** on core reactivity system
- ✅ **CI-guarded** — every release validated against React compatibility suite
- ✅ **Dual ESM/CJS** — works in every build system
- ✅ **Development + Production bundles** — debug in dev, optimize in prod

---

## Versioning & Support

- **Current:** v1.1.1 — Production ready
- **API Stability:** Frozen for 1.x line
- **LTS:** v1.x supported with security patches through 2026
- **Changelog:** See [`CHANGELOG.md`](./CHANGELOG.md) for all releases

---

## Get Started in 60 Seconds

```bash
# With Bun (recommended)
bun add sinwan

# With npm
npm install sinwan
```

```tsx
// App.tsx
import { signal, mount, cc } from "sinwan";

const App = cc(() => {
  const count = signal(0);
  return (
    <div>
      <h1>Sinwan is working!</h1>
      <button onClick={() => count.value++}>Count: {count}</button>
    </div>
  );
});

mount(App, document.getElementById("app")!);
```

**→ Continue with [`01-getting-started.md`](./01-getting-started.md)**

---

## License

MIT — Open source, production-ready, and maintained by developers who actually use it.
