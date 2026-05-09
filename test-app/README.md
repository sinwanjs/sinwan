# Sinwan Test App

A small Vite + TypeScript app that consumes the published `sinwan` package from npm.

## What it demonstrates

- `signal` — reactive cell (Counter, TempConverter)
- `computed` — derived value (TempConverter, Counter "isZero")
- `effect` (implicit, via the renderer) — reactive text & attributes
- `onMounted` / `onUnmounted` — Clock starts/stops a `setInterval`
- `provide` / `inject` — Theme toggle propagated through the tree
- `mount` / `render` / `unmount` — coarse-grained list rebuild in `TodoList`
- Full SSR-shaped JSX with Sinwan's `jsx-runtime`

## Run

```bash
cd test-app
npm install
npm run dev
```

Vite opens `http://localhost:5173/` automatically.

## Build for production

```bash
npm run build
npm run preview
```

## Project layout

```
test-app/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx          — entry point: mount(App, #app)
    ├── App.tsx           — top-level component + ThemeProvider
    ├── styles.css
    └── components/
        ├── Counter.tsx
        ├── Clock.tsx
        ├── TempConverter.tsx
        ├── TodoList.tsx
        └── LifecycleLog.tsx
```

## TypeScript / JSX configuration

`tsconfig.json` contains:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "sinwan"
  }
}
```

Vite mirrors that in `vite.config.ts` so esbuild produces the right
`jsx`/`jsxs`/`Fragment` import paths.

## Notes on the v1 todo list

v1 of Sinwan does not yet auto-diff arrays in JSX (a `<For>` helper is
on the roadmap). The `TodoList` component sidesteps this by re-rendering
the inner `<ul>` whenever the `todos` signal changes, using `render()`
+ `unmount()`. This is a perfectly valid pattern for v1.
