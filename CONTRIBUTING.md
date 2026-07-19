# Contributing to Sinwan

## Design System

1. **Zero Virtual DOM** — Direct DOM mutations, no diffing.
2. **Explicit over Implicit** — Signals and lifecycle hooks, no magic tracking.
3. **SSR & Hydration First** — Every feature works on server and hydrates cleanly.
4. **TypeScript First** — Types shape the API.

**Mental model:** Component = setup function (runs once). Returns JSX; renderer creates live bindings. Component never re-runs.

## Architecture

- Signals (`signal`, `computed`, `effect`) are source of truth. Effects flush in microtask queue (parent-before-child). `batch()` coalesces updates. `Object.is` for equality.
- Renderer is DOM-first (`Sinwan-r` / `Sinwan-a` / `Sinwan-b` anchors). Unmounting must be precise and leak-averse.
- Components: `cc<P>(setup)`. Lifecycle hooks (`onMounted`, `onUnmounted`, `onUpdated`, `onError`) scoped per instance.
- JSX: pass getters directly (`{count}`). Outside JSX, call explicitly (`count()`).
- Async: `Promise<SinwanNode>` is first-class. Suspense is a renderer boundary.

## React Integration (`sinwan/react`)

Unified entry (`src/react/index.ts`) exports all client, server, shared, static, and type APIs. Not a React wrapper — authored from scratch with native signals.

- `[SHARED]`: `createContext`, `memo`, `lazy`, `use` — safe on client and server.
- `[CLIENT]`: `useState`, `useEffect`, etc. — guarded with `isServer()`.
- `[SERVER]`: `renderToString`, `renderToReadableStream` — SSR/streaming only.
- `[STATIC]`: `prerender`, `resumeAndPrerender` — build-time only.

State stored in slots (`useSlot`, `useSignalSlot`). `createStateGetter(sig)` marks getters for JSX binding; call explicitly outside JSX (`count()`).

Tests in `__tests__/react/`. Import from entry file. Use `happy-dom` + `beforeEach`. Mount with `cc()` + `mount()`. Always `await tick()` for reactive assertions.

## Code Style

- TypeScript strict mode required.
- Explicit types for public APIs.
- Lowercase dashed filenames (`render-control-flow.ts`).
- One export per file for core primitives; grouped by domain.
- Functions focused; extract helpers if >60 lines.
- Section dividers with `//`.

## Testing

- `bun:test` + `happy-dom`.
- Always `await nextTick()` for effects/reactive updates.
- Test cleanup (`dispose()` stops effects).
- Dynamic dependencies: verify only active branch retriggers.
- Lifecycle order assertions (`onMounted`, `onUpdated`, `onUnmounted`).
- SSR: assert output strings and hydration markers.

Run: `bun test` / `bun test __tests__/file.test.ts` / `bun run typecheck` / `bun run build`.

## Adding a Feature

1. Write API design doc snippet first.
2. Add failing tests.
3. Minimal upstream fix preferred over downstream workaround.
4. Verify SSR + hydration.
5. Add regression test.
6. Run full suite: `bun test && bun run typecheck`.

## Commit & PR

- One logical change per commit.
- Message format: `area: what changed and why`.
- Example: `renderer: dispose async nodes on unmount to prevent late-insert leaks`
- Reference design system. If change breaks "Setup Once, Update Forever," explain tradeoff.
- Ensure CI passes (`bun test`, `bun run typecheck`, `bun run build`).

## License

MIT. Contributions licensed under MIT.
