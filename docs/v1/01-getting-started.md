# Getting Started

This guide takes you from zero to a running Sinwan app in five minutes.

## 1. Install

Sinwan ships as a single npm package called `sinwan`.

```bash
# Bun
bun add sinwan

# pnpm
pnpm add sinwan

# npm
npm install sinwan

# Yarn
yarn add sinwan
```

**Peer requirement:** TypeScript `^5`.

Sinwan has zero runtime dependencies. The published bundle includes:

- `dist/index.js` (CJS shim) and `dist/index.mjs` (ESM)
- `dist/cjs/*.{development,production.min}.js`
- `dist/esm/*.{development,production.min}.js`
- Full `.d.ts` declarations

Your bundler (Vite, Webpack, Rollup, esbuild, Bun, …) automatically picks the right variant based on `process.env.NODE_ENV` and the format you import.

## 2. Configure TypeScript & JSX

Add the JSX configuration to your `tsconfig.json` so the TypeScript compiler emits Sinwan-compatible JSX:

```jsonc
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],

    // ─── JSX ───────────────────────────────────────
    "jsx": "react-jsx",
    "jsxImportSource": "sinwan",

    "strict": true,
    "skipLibCheck": true,
  },
}
```

The compiler will inject:

```ts
import { jsx, jsxs, Fragment } from "sinwan/jsx-runtime";
```

For a development build (more debug info, source positions on every JSX call), set:

```jsonc
{ "compilerOptions": { "jsx": "react-jsxdev" } }
```

This pulls `sinwan/jsx-dev-runtime` instead. See [`07-jsx.md`](./07-jsx.md) for the full JSX reference.

## 3. Your first component

Create `src/Counter.tsx`:

```tsx
import { signal, cc, onMounted } from "sinwan";

export const Counter = cc(() => {
  const count = signal(0);

  onMounted(() => {
    console.log("Counter mounted");
  });

  return (
    <div class="counter">
      <p>You clicked the button {count} times.</p>
      <button onClick={() => (count.value += 1)}>Increment</button>
      <button onClick={() => (count.value = 0)}>Reset</button>
    </div>
  );
});
```

Three things to notice:

1. `signal(0)` creates a reactive cell.
2. `{count}` interpolated as a child node creates a **reactive text node** that updates automatically when `count.value` changes — no re-rendering of the surrounding tree.
3. `onClick` is a regular DOM event prop. Handlers are bound directly (not delegated).

## 4. Mount it

```tsx
// src/main.tsx
import { mount } from "sinwan";
import { Counter } from "./Counter";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");

const app = mount(Counter, root);

// Later, to tear everything down (timers, listeners, effects):
// app.unmount();
```

`mount()` returns an `AppInstance`:

```ts
interface AppInstance {
  root: MountedNode;
  unmount(): void;
}
```

Calling `unmount()` fires `onUnmounted` hooks bottom-up, disposes every effect, removes every event listener, and empties the container.

## 5. Render on the server (optional)

```ts
// server.ts
import { renderToString } from "sinwan/react-server";
import { Counter } from "./Counter";

const html = await renderToString(<Counter />);
console.log(html);
// → <div class="counter"><p>You clicked the button 0 times.</p>...</div>
```

For full SSR + hydration, see:

- [`09-ssr.md`](./09-ssr.md) — server-side rendering
- [`10-hydration.md`](./10-hydration.md) — making the SSR HTML interactive

## 6. Build for production

If you’re consuming Sinwan as a library, your bundler picks the right variant automatically. If you’re building **Sinwan itself** from this monorepo:

```bash
bun run build
# → dist/{index,jsx-runtime,jsx-dev-runtime,server,renderer}.{js,mjs,d.ts}
# → dist/{cjs,esm}/...{development,production.min}.js
```

See [`13-build-and-deploy.md`](./13-build-and-deploy.md) for the full pipeline.

## Where to go next

- **Mental model & Philosophy?** Read [`00-philosophy.md`](./00-philosophy.md) and [`02-architecture.md`](./02-architecture.md).
- **Want to understand reactivity?** Jump to [`03-reactivity.md`](./03-reactivity.md).
- **Want a recipe-by-recipe tour?** Open [`14-recipes.md`](./14-recipes.md).
- **Looking for a specific function?** Use [`15-api-reference.md`](./15-api-reference.md).
