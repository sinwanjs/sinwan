# Contributing to Sinwan

Thank you for your interest in contributing to Sinwan. This document describes the design system, conventions, and workflow we expect every contributor to follow.

---

## 1. The Sinwan Design System

Before writing code, internalize the four core values:

1. **Zero Virtual DOM** — No diffing, no patching, no VDOM trees.
2. **Explicit over Implicit** — Prefer explicit signals and lifecycle hooks over magic auto-tracking.
3. **SSR & Hydration First** — Every feature must work on the server and hydrate cleanly on the client.
4. **TypeScript First** — Types are not an afterthought; they shape the API.

### The Mental Model: "Setup Once, Update Forever"

In Sinwan, a component function is a **setup function**, not a render function.

- It runs **exactly once** when the component is created.
- It initializes signals, computeds, and effects.
- It returns a JSX structure that describes the UI.
- The renderer creates **live bindings** between signals and the DOM. The component function never runs again.

If your change causes a component function to re-run on state change, it is likely wrong.

---

## 2. Architecture Conventions

### Reactivity

- **Signals are the source of truth.**
- Use `signal()`, `computed()`, and `effect()` from the core reactivity system.
- Effects are **scheduled**, not synchronous. They flush in a microtask queue sorted parent-before-child.
- `batch(fn)` groups multi-signal updates into a single flush.
- Always use `Object.is` for equality checks in signal setters to avoid redundant triggers.

### DOM & Renderer

- The renderer is **DOM-first**. It mutates the DOM directly using comment anchors to delimit reactive regions.
- Reactive blocks use start/end anchors (`"Sinwan-r"` / `"/Sinwan-r"`).
- Async blocks use start/end anchors (`"Sinwan-a"` / `"/Sinwan-a"`).
- Control-flow blocks use start/end anchors (`"Sinwan-b"` / `"/Sinwan-b"`).
- Unmounting must be **precise and leak-averse**. Every mounted node type must know how to dispose its effects, events, and refs, then recursively descend.

### Components

- Define components with `cc<P>(setup)`.
- The setup function receives props and may return a `SinwanNode`.
- Lifecycle hooks (`onMounted`, `onUnmounted`, `onUpdated`, `onError`, etc.) are scoped to the component instance.
- `onUpdated` hooks run once per flush, deduplicated per instance.
- `fireMountedHooks` is bottom-up (children first).

### JSX & Signals

| Context              | Syntax                                               | Why                                                           |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| JSX text content     | `{count}`                                            | Renderer detects the signal/function and binds it reactively. |
| JSX native attribute | `value={count}`                                      | Renderer creates an effect and calls `resolve(count)`.        |
| Arithmetic / logic   | `count.value > 5` or `count() > 5`                   | No automatic resolution outside JSX.                          |
| Callback body        | `console.log(count.value)` or `console.log(count())` | Explicit read required.                                       |

- **Inside JSX** (children & HTML attributes): pass the getter/signal **directly**.
- **Outside JSX** (logic, arithmetic, callbacks): call it explicitly.
- Avoid mixing native `signal()` with React-style `useState()` in the same component.

### Async

- `Promise<SinwanNode>` is a first-class node type.
- The renderer owns async placeholders, swaps, and disposal via the `disposed` flag on `MountedAsync`.
- Suspense is implemented as a renderer boundary that intercepts thrown promises and schedules a retry on resolution.

---

## 3. React Integration Structure

Sinwan ships a React-compatible API layer under `src/integrations/react/`. It is **not a wrapper around React** — every hook, component, and type is authored from scratch and backed by Sinwan's native signals, effects, and lifecycle system.

### Entry points

| Subpath                                       | File         | Purpose                                                                                                                       |
| --------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `sinwan/react-client`                         | `_client.ts` | DOM-side hooks (`useState`, `useEffect`, …), components (`Suspense`, `Activity`), and DOM APIs (`createRoot`, `hydrateRoot`). |
| `sinwan/react-server`                         | `_server.ts` | SSR streaming (`renderToString`, `renderToReadableStream`), shell helpers, and islands.                                       |
| `sinwan/react-static`                         | `_static.ts` | Build-time prerendering (`prerender`, `resumeAndPrerender`).                                                                  |
| `sinwan/react-client` & `sinwan/react-server` | `_shared.ts` | APIs that run on both client and server (`createContext`, `memo`, `lazy`, `use`, `cache`).                                    |

### Directory layout

```
src/integrations/react/
  _client.ts              # Re-exports SHARED + CLIENT hooks/components
  _server.ts              # Re-exports SHARED + SERVER streaming APIs
  _static.ts              # Re-exports SHARED + STATIC prerender APIs
  _shared.ts              # APIs safe on both client and server

  _internal/
    bridge.ts             # Signal ↔ React state bridge (useSlot, useSignalSlot, createStateGetter, applyUpdate)
    is-server.ts          # Runtime environment guard
    scheduler.ts          # Transition / deferred-value scheduling helpers
    symbols.ts            # Sinwan-owned React type tags (Symbol.for("sinwan.react.*"))

  _types/
    core.ts               # ReactElement, ReactNode, Ref, FC, ComponentType, …
    context.ts            # Context, Provider, Consumer types
    hooks.ts              # Dispatch, SetStateAction, EffectCallback, GetterDependencyList, …
    server.ts             # RenderToReadableStreamOptions, PipeableStream, …
    static.ts             # PrerenderOptions, PostponedState, …
    dom.ts                # DOM event / prop types
    jsx.ts                # JSX-specific type helpers
    events.ts             # Event handler type mappings
    index.ts              # Barrel re-export for internal type consumption

  use-state.ts            # useState → signal + StateGetter
  use-effect.ts           # useEffect → lifecycle + sinwanEffect
  use-layout-effect.ts    # useLayoutEffect → lifecycle + sinwanEffect (flushSync schedule)
  use-insertion-effect.ts # useInsertionEffect → onMounted + effect
  use-memo.ts             # useMemo → computed / useSlot caching
  use-callback.ts         # useCallback → useSlot caching
  use-reducer.ts          # useReducer → signal + reducer
  use-ref.ts              # useRef → useSlot mutable ref object
  use-context.ts          # useContext → inject()
  use-id.ts               # useId → identifierPrefix + instance uid
  use-transition.ts       # useTransition → startTransition bridge
  use-deferred-value.ts   # useDeferredValue → signal + transition scheduling
  use-optimistic.ts       # useOptimistic → signal + optimistic reducer
  use-action-state.ts     # useActionState → async action + pending signal
  use-form-status.ts      # useFormStatus → pending signal read
  use-imperative-handle.ts# useImperativeHandle → ref callback + cleanup
  use-sync-external-store.ts # useSyncExternalStore → signal subscription
  use-title.ts            # useTitle → document.title effect
  use-debug-value.ts      # useDebugValue → dev-only label
  use-effect-event.ts     # useEffectEvent → stable callback ref
  use.ts                  # use() → Promise / Context resolution

  create-context.ts       # createContext → provide/inject key
  create-portal.ts        # createPortal → Portal control-flow
  create-root.ts          # createRoot → mount()
  hydrate-root.ts         # hydrateRoot → hydrate()
  render-to-string.ts     # renderToString → server renderer
  render-to-readable-stream.ts
  render-to-pipeable-stream.ts
  render-to-static-markup.ts
  prerender.ts
  resume.ts
  resume-and-prerender.ts

  suspense.ts             # Suspense component
  activity.ts             # Activity boundary
  strict-mode.ts          # StrictMode no-op
  profiler.ts             # Profiler onRender callback
  view-transition.ts      # ViewTransition component
  fragment.ts             # Fragment re-export
  memo.ts                 # memo() shallow-compare wrapper
  lazy.ts                 # lazy() promise wrapper
  flush-sync.ts           # flushSync → batch + flush
  start-transition.ts     # startTransition → transition scheduling
  add-transition-type.ts  # addTransitionType helper
  capture-owner-stack.ts  # captureOwnerStack dev helper
  act.ts                  # act() test helper
  resource-hints.ts       # preload, preconnect, prefetchDNS, …
  elements.ts             # Form, Input, Button, Link, Meta, Script, Style, Title wrappers
```

### Bridge patterns (critical)

Every client hook stores state in **slots** on the current `ComponentInstance` via `useSlot<T>()` and `useSignalSlot<T>()`. These live in `_internal/bridge.ts`.

- `useSlot(init)` — array-based slot storage (cursor advances per call, like React hooks).
- `useSignalSlot(init)` — `useSlot` but returns a `Signal<T>` owned by the instance.
- `createStateGetter(sig)` — wraps a signal in a getter function marked with `STATE_GETTER_MARKER`. The renderer treats this as a reactive node in JSX; outside JSX you must call it: `count()`.
- `applyUpdate(prev, action)` — handles both plain values and updater functions (`setCount(c => c + 1)`).

### Hook classification

When adding or modifying a React-compatible hook, classify it correctly:

| Classification | Rule                                                           | Example                                    |
| -------------- | -------------------------------------------------------------- | ------------------------------------------ |
| `[SHARED]`     | Safe on client and server; no DOM access.                      | `createContext`, `memo`, `lazy`, `use`     |
| `[CLIENT]`     | Needs DOM, scheduler, or lifecycle; guarded with `isServer()`. | `useState`, `useEffect`, `useLayoutEffect` |
| `[SERVER]`     | Only runs during SSR/streaming.                                | `renderToString`, `renderToReadableStream` |
| `[STATIC]`     | Only runs at build time.                                       | `prerender`, `resumeAndPrerender`          |

### Symbol namespace

React element identity uses **Sinwan-owned** symbols (`Symbol.for("sinwan.react.element")`, etc.), not React's. This prevents collisions if a host app also installs React. Never change these to `react.*` namespaces.

### State getter convention

Inside JSX, pass getters directly (`{count}`). Outside JSX, call them (`count()`). This is enforced by the renderer and by `STATE_GETTER_MARKER` resolution in `resolveDeps()`.

### Testing React integration hooks

React integration tests live in `__tests__/integrations/react/`:

```
__tests__/integrations/react/
  hooks/                  # One test file per hook
    use-state.test.ts
    use-effect.test.ts
    …
  component/              # Component-level integration tests
  elements/               # Form/Input/Link/etc. wrapper tests
  api/                    # Streaming / SSR API tests
  all-in-one-file/        # Bundled sanity tests
```

Patterns to follow:

- Import hooks from the entry file (e.g., `from "../../../../src/integrations/react/_client.ts"`).
- Use the standard `happy-dom` + `beforeEach` DOM setup.
- Mount components with `cc()` + `mount()` — never call hooks outside a component.
- Use `resetHookCursor()` + `createComponentInstance()` / `withInstance()` to simulate multiple renders in unit tests.
- Always `await tick()` (or `await nextTick()`) when asserting reactive DOM updates.
- For SSR tests, import from `_server.ts` and assert string output.

---

## 5. Code Style

- **TypeScript strict mode** is required.
- Use explicit types for public APIs. Internal helpers may infer, but prefer readability.
- File naming: lowercase with dashes for multi-word files (`render-control-flow.ts`).
- One export per file for core primitives, grouped by domain (`reactivity/`, `renderer/`, `component/`).
- Keep functions focused. If a renderer block exceeds ~60 lines, extract a helper.
- Use `//` comments for section dividers in long files (`// ─── Signal ────────────────────────────────────────────────`).

---

## 4. Testing Conventions

We use **Bun** (`bun:test`) and **happy-dom** for all tests.

### Test file structure

```ts
/**
 * Feature Name — Test Scope
 *
 * Tests: list of what is covered.
 * Run with: bun test __tests__/file-name.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
```

### DOM setup for client tests

```ts
import { Window } from "happy-dom";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  container = doc.createElement("div");
  doc.body.appendChild(container);
});
```

### Key testing rules

- **Always await `nextTick()`** when asserting effects or reactive updates that happen in a microtask.
- Use `batch(() => { ... })` to test coalesced updates.
- Test cleanup: assert that `dispose()` stops effects and runs cleanup functions.
- Test dynamic dependencies: switch branches and verify only the active branch retriggers.
- For lifecycle tests, assert the order of hooks (`onMounted`, `onUpdated`, `onUnmounted`).
- For control-flow tests, assert DOM anchor presence and correct keyed list reconciliation.
- For SSR tests, assert output strings and hydration marker integrity.

### Running tests

```bash
# All tests
bun test

# Specific file
bun test __tests__/reactivity.test.ts

# Type check
bun run typecheck
```

---

## 6. Adding a Feature

1. **Start with the docs.** Write the API design and behavior in a doc snippet before coding.
2. **Add tests first.** Write failing tests that describe the expected behavior.
3. **Implement the minimal change.** Prefer a single-line upstream fix over a downstream workaround.
4. **Verify SSR and hydration.** If the feature touches the renderer, it must work in `renderToString` and `hydrate`.
5. **Add a regression test.** Every bug fix must include a test that fails before the fix and passes after.
6. **Run the full suite.** `bun test && bun run typecheck`

---

## 7. Commit & PR Guidelines

- Keep commits focused. One logical change per commit.
- Write clear commit messages: `area: what changed and why`.
- Example: `renderer: dispose async nodes on unmount to prevent late-insert leaks`
- Reference the design system. If a change breaks "Setup Once, Update Forever," explain why the tradeoff is necessary.
- Ensure CI passes (`bun test`, `bun run typecheck`, `bun run build`).

---

## 8. Where to Ask Questions

- Open a **Discussion** for architecture questions or design proposals.
- Open an **Issue** for bugs, with a minimal reproduction test case.
- Tag `@sinwanjs/maintainers` if a PR is stalled.

---

## 9. License

By contributing to Sinwan, you agree that your contributions will be licensed under the MIT License.
