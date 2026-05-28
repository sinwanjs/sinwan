# Changelog

All notable changes to **Sinwan** are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/) and Sinwan adheres to [Semantic Versioning](https://semver.org/) for the 1.x line.

## [1.2.4] — SSR Hydration & Streaming Renderer Fixes

Sinwan 1.2.4 fixes critical race conditions in the SSR hydration renderer and hardens the streaming renderer with missing element type support and proper component root propagation.

### Added

- **React Type Export**: Added new `sinwan/react-type` export that provides React-compatible types from the `_types` directory. Includes type definitions for ReactNode, ReactElement, Ref, ComponentType, Key, and other core React types authored from scratch without React imports.

### Fixed

- **Hydration Race Conditions**: Fixed race conditions on mutable context indices (`textIndex`, `eventIndex`, `componentIndex`) in `renderForElementH`, `renderIndexElementH`, and `renderVirtualElementH` by replacing `Promise.all` with sequential for loops. Concurrent mutations during async component rendering now correctly preserve index ordering for client-side hydration.
- **Fragment Component Root Propagation**: Fixed Fragment blocks in `renderElementH` (hydration-markers.ts) and `streamHydratableElement` (stream.ts) to propagate `isComponentRoot` to the first intrinsic child. Components returning Fragments as root now correctly receive `data-sinwan-id` markers on their first child element.
- **Streaming Component Root Marking**: Fixed `streamHydratableComponent` being called with `isComponentRoot=false` from `streamHydratableElement`. Functional components now correctly receive `data-sinwan-id` markers on their root elements in the streaming renderer.
- **Missing Streaming Element Handlers**: Added missing `isSuspenseElement`, `isActivityElement`, and `isViewTransitionElement` handlers to `streamHydratableElement`. These control flow components now render correctly in hydratable streaming mode with proper `isComponentRoot` propagation.
- **Dead Code Removal**: Removed unused `originalRenderIntrinsic` variable and its comment from `renderer.ts`, a remnant from an incomplete refactoring.
- **React State Getter Hydration**: Fixed client-side hydration not recognizing React-compatible state getters (from `useState`/`useReducer` ...) in text content and attributes. The hydration walker now checks for `STATE_GETTER_MARKER` and uses the underlying signal reference for proper reactivity. This ensures that components using React-style hooks remain interactive after SSR hydration.
- **`<Key>` Component Dynamic Swap**: Fixed `<Key>` destroying and recreating its entire subtree on every key change, which caused loss of event listeners, React hook state, internal signals, and inconsistent lifecycle ordering. The renderer and hydration walker now cache component instances per key using `softHideMountedTree` / `softShowMountedTree` (same preservation model as `<Activity>`). Swapping back to a previously seen key restores the original DOM, effects, hooks, and event bindings without remounting.
- **`useFetch` SSR Auto-Fetch Guard**: Fixed `useFetch` with `immediate: true` (the default) auto-executing `fetch()` during SSR. Because server rendering is async, the request could resolve before the render completed, causing the server to emit populated data (`<ul>`) while the client hydrated with `data = null` and expected the fallback (`"Loading..."`). `useFetch` now forces `immediate: false` when `typeof window === "undefined"`.
- **SSR Context Establishment in Hydratable Renderer**: Fixed `renderToHydratableString` and `renderNodeToHydratableString` not establishing an SSR context during rendering. Hooks like `useFetch` that rely on `getSSRContext()` to detect server-side rendering now work correctly because the renderer sets `setSSRContext(createSSRContext())` before calling the component.
- **Router Hydration Loading Flash**: Fixed `RouterOutlet` setting `isLoading = true` on its initial client effect run during hydration, which caused it to render its loading fallback instead of the already-server-rendered route content. Added an `isFirstRun` flag so the loading state is only shown for subsequent client-side navigations.
- **Lazy Component SSR/Client Mismatch**: Fixed eager vs. lazy route loading divergence between server and client in the test app. The server eagerly loaded route components while the client used `lazy()`, causing the hydration walker to encounter a different component tree. Routes are now eagerly loaded on both sides for consistent initial trees.
- **`useFetch` SSR Promise Race Condition**: Fixed `useFetch` removing its pending promise from `ssrCtx.pendingFetches` via `.finally()` before `renderToHydratableString` could check the set size. This prevented the two-pass SSR from running, leaving the HTML stuck in the loading state.
- **`useFetch` Relative URL Failure on Server**: Fixed server-side `fetch()` failing with `"URL is invalid"` for relative URLs like `/api/dbs`. Added `baseUrl` support to `SSRContext` and `renderToHydratableString` so `useFetch` can resolve relative URLs during SSR.
- **Signal/Computed Brands Unrecognized Across Bundles**: Fixed `isSignal()` and `isComputed()` returning `false` for signals created in the built package but checked in source files. Changed `SIGNAL_BRAND` and `COMPUTED_BRAND` from `Symbol()` to `Symbol.for()` so they are global and consistent across bundle boundaries. This caused `<Show>` to treat signal objects as always-truthy instead of reading `.value`.

---

## [1.2.3] — TypeScript Type Fixes & Event Module

### Added

- **Event Module**: Added new event bus module with type-safe event communication, lifecycle integration, and SSR safety. Includes `SinwanEventBus`, `globalEventBus`, `useEvent`, `useEventNamespace`, `useEventOnce`, and SSR context utilities.

### Fixed

- **TypeScript Type Mismatch**: Fixed `SinwanNode | SinwanSlots` not being assignable to `SinwanNode` in JSX. Updated `HTMLAttributes.children` type to accept `SinwanNode | SinwanSlots`, aligning JSX types with the `SinwanComponent` interface that already supports named slots.

---

## [1.2.2] — Virtual Component Hydration Hardening

Sinwan 1.2.2 production-hardens the `<Virtual>` component hydration with critical bug fixes for memory leaks, type safety, scroll reactivity, and registry persistence.

### Fixed

- **Effect Leak**: Fixed scroll effect dispose function being discarded. The dispose fn is now stored and registered in `mounted.eventCleanups` alongside the scroll listener cleanup, ensuring proper teardown on unmount.
- **Unsafe Cast on Registry Seed**: Added type guards before casting hydrated nodes to `MountedElement` during initial keyMap population, preventing runtime errors when hydrateNode returns non-element nodes.
- **Unsafe Cast on New Item Mount**: Added type guards after `renderElementToDOM` to safely cast to `MountedElement` before accessing the wrapper element, preventing crashes when new items are created during scroll.
- **Position Not Patched on Reuse**: Changed keyMap value type to `VirtualEntry` interface storing `mounted`, `wrapperEl`, and `currentIndex`. Items now correctly update their `style.top` position when their index shifts during reuse.
- **Stale List Capture**: Fixed scroll effect closing over frozen `list` from hydration time. The effect now re-reads `props.each` on each tick via `readReactive()`, properly handling signal-based list updates.
- **Extract Shared resolveRange**: Extracted duplicated range calculation logic into a shared `resolveRange(scrollTop, length)` function, eliminating code duplication between initial hydration and scroll effect.
- **Passive Scroll Listener**: Added `{ passive: true }` to scroll event listener for improved scroll performance.
- **RenderElementToDOM Usage**: Replaced `renderNodeToDOM` with direct `renderElementToDOM` call for new item creation inside the scroll effect, matching the expected SinwanElement input type.
- **Registry Persistence**: Fixed reused entries vanishing from keyMap after first scroll tick. Reused entries are now added to `newKeyMap` during the reuse branch, ensuring they persist across scroll updates.
- **Dynamic List Length Support**: Fixed `resolveRange` closing over stale `list.length`. The function now accepts a `length` parameter, allowing proper range calculation when the list grows dynamically via signal updates.
- **Code Quality**: Changed `let remaining` to `const remaining` in `resolveRange` since the value is never reassigned after initialization.

---

## [1.2.1] — Computed Tracking Fix

Fixed an issue where computed dependencies were not being tracked correctly in certain scenarios, particularly within loops.

**Optimization & Bugfix:**  
Prevent duplicate dependency tracking within the same run. Previously, tracking the same dependency multiple times (such as inside a loop) could lead to issues where, if the loop ran fewer times on subsequent executions, `cleanupDeps()` would completely unsubscribe from a dependency.

```typescript
for (let i = 0; i < effect._depsLength; i++) {
  if (effect.deps[i] === dep) {
    return; // Already tracked, avoid duplicate
  }
}
```

## [1.2.0] — React Integration, Async Suspense & Data Fetching

Sinwan 1.2.0 introduces a full React compatibility layer, virtualized list rendering, data-fetching hooks, and major SSR/hydration improvements for async components.

### Added

- **React Integration Layer**: Complete React API compatibility via `sinwan/react` (`createRoot`, `hydrateRoot`, `useState`, `useEffect`, `useContext`, `useMemo`, `useCallback`, `Suspense`, `memo`, `createPortal`, `flushSync`, `StrictMode`, `Activity`, `ViewTransition`, `useActionState`, `useDeferredValue`, `useImperativeHandle`, `useInsertionEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useTitle`, `useFormStatus`, `useOptimistic`, `Resource Hints`, `prerender`, `renderToString`, `renderToStaticMarkup`, `renderToReadableStream`, `resume`, `resumeAndPrerender`).
- **`<Virtual>` Component**: Virtualized list rendering with windowing support for high-performance long lists.
- **`useFetch` Hook**: Reactive data fetching with automatic JSON/text parsing, HTTP methods, error handling, abort/timeout support, and refetch behavior.
- **`createFetch` Factory**: Configurable fetch instance with `baseUrl`, default options merging, and callback chaining.
- **Bun Plugin & Tree-shaking**: `sinwan()` unified Vite/Rollup plugin with JSX transform, automatic import source, and dead-code elimination for unused exports.
- **`<ErrorBoundary>` Hydration**: Full client hydration support for error boundaries with proper lifecycle recovery.
- **SSR Shell Rendering**: New `renderShell()` and `streamShell()` APIs for streaming HTML shell generation with configurable scripts and stylesheets (`ShellOptions`, `ShellScript`, `ShellStylesheet`).
- **`<Suspense>` Async Component Caching**: `asyncComponentResults` cache inside Suspense boundaries prevents re-execution of resolved async components during hydration and re-renders.
- **`trackPromise` Mechanism**: Promise state tracking (`pending` / `fulfilled` / `rejected`) integrated with `getActiveSuspenseBoundary()` for deterministic async rendering.
- **`on()` Reactive Helper**: Explicit dependency tracking for `effect()` and `computed()` bodies with single or array deps, value change callbacks, and optional deferred initial run.
- **`observable()` Interop**: Converts a reactive getter into an Observable-compatible object (`subscribe()`, `[Symbol.observable]`) for seamless integration with RxJS and other Observable libraries.
- **Reactive Store (`createStore`)**: Fine-grained immutable reactive store with proxy-based reads, typed path-based setters (`setStore('path', 'to', 'key', value)`), and partial merge / function updater support.
- **`createMutable()` / `modifyMutable()`**: Mutable reactive store proxy allowing direct property assignment with automatic fine-grained change tracking.
- **Store Modifiers**: `produce()` (immer-like draft mutations) and `reconcile()` (deep diff merge) for advanced store transformations.
- **`unwrap()`**: Extract the raw underlying value from any store proxy, bypassing reactivity.

### Changed

- SSR route handlers now support simulated async delays for realistic server-side data fetching in test apps.
- Build pipeline migrated to Bun with dual ESM/CJS development and production bundles.
- Documentation v1 expanded with `useFetch` API reference, migration guides, and React integration docs.

### Fixed

- **Virtual Component DOM Reordering**: Fixed incorrect node ordering when virtualized items are inserted, removed, or reordered.
- **Component Unmounting Optimizations**: Reduced overhead during rapid mount/unmount cycles with streamlined cleanup.
- **For/Index Closure Captures**: Fixed stale closures in reactive list rendering when item accessors are used inside nested callbacks.

### Internal

- Added comprehensive test suite for `useFetch` and `createFetch` (343+ lines).
- Added regression tests for async component lifecycle hooks firing on updates.
- Total tests expanded significantly with React integration and Virtual component coverage.

### Planned [1.3.0]

- Add Sinwan Flow — a complete visual flow system inspired by React Flow, featuring node-based editors, edge connections, zoom/pan controls, custom nodes, reactive graph rendering, and full SSR/hydration integration with the Sinwan runtime.

---

## [1.1.2] — Renderer Hardening & Portal Stability

Sinwan 1.1.2 focuses on hardening the client renderer for high-frequency churn scenarios, improving style normalization, and ensuring deterministic Portal reordering.

### Added

- **Portal Reordering Support**: Portals now track their relative position in the source tree and re-synchronize their content order in the target element when moved (e.g., inside a `<For>` loop).
- **Style Normalization**: Introduced a recursive `normalizeStyle` helper that robustly handles arrays of styles, nested objects, and string-style rules, ensuring deterministic property application.

### Fixed

- **Component Context Persistence**: Fixed a bug where child components rendered within reactive blocks (`<Show>`, `<For>`, etc.) could lose their parent component instance during updates, causing lifecycle hooks like `onMounted` to be skipped.
- **Instance Memory Leaks**: Hardened `fireUnmountedHooks` to proactively remove unmounted instances from their parents, preventing infinite growth of the component tree during rapid mount/unmount cycles.
- **Lifecycle Disposal**: Guaranteed that all reactive effects owned by a component are disposed of on unmount, even if the component was unmounted before its initial mount lifecycle completed.
- **Show Component Logic**: Corrected an issue where the `when` prop in `<Show>` blocks was occasionally resolved as a function instead of its underlying reactive value.

---

## [1.1.1] — Reactivity Hardening & Dynamic Content

Sinwan 1.1.1 hardens the reactivity system with a unified normalization layer and adds support for dynamic reactive nodes that can resolve to complex JSX structures.

### Added

- **Unified Normalization Layer**: Introduced `isReactive` and `resolve` helpers to handle Signals, Computeds, and Functional Getters consistently across the renderer and control flow components.
- **Dynamic Reactive Nodes**: Reactive getters `{() => ...}` can now return any `SinwanNode` (Elements, Fragments, Arrays), enabling flexible in-place JSX swapping without explicit `<Show>` wrappers.

### Fixed

- **Functional Getter Consistency**: Fixed an issue where functional getters were treated as static text, causing them to render as `[object Object]` when returning JSX elements.
- **Control Flow Reactivity**: Fixed a bug in `<Show>`, `<Switch>`, and `<Match>` where functional getters in the `when` prop were not correctly tracked, preventing reactive updates.
- **TypeScript Definitions**: Updated `Reactive<T>` and `SinwanNode` to officially support function getters.

---

## [1.1.0] — Reactive helper expansion

Sinwan 1.1.0 expands the built-in helper set for production UI control flow, stable list rendering, dynamic structure, visibility toggles, and portals.

### Added

- `<For fallback={...}>` for built-in empty-state rendering.
- `<Switch>` and `<Match>` for first-match multi-branch conditionals.
- `<Index>` for index-stable list rendering with per-index item accessors.
- `<Key>` for remounting a subtree when a reactive key changes.
- `<Dynamic>` for reactive intrinsic tag or component selection.
- `<Visible>` for CSS `display` toggling without unmounting children.
- `<Portal>` for rendering children into another DOM target and cleaning them up with the owner tree.

### Changed

- Documentation now recommends `<For fallback={...}>` for reactive list empty states.
- `onUpdated` documentation now covers all renderer-owned built-in helper updates.

### Internal

- Added regression coverage for every new helper, including lifecycle cleanup and portal unmount cleanup.

---

## [1.0.0] — Initial stable release

Sinwan 1.0.0 is the first stable public release. It includes the original v1 runtime, the JSX type/runtime fixes, and the feature set that was previously listed as upcoming work.

### Added

- **Reactive control flow**: public `<Show>` and `<For>` helpers exported from `sinwan/component`.
  - `<Show>` swaps between truthy content and fallback content reactively.
  - `<For>` renders signal-backed arrays with keyed insert, remove, reorder, cleanup, and same-key item replacement semantics.
- **Public refs**: JSX `ref` supports callback refs and object refs, sets them after mount, and clears them on unmount.
- **Namespace-aware rendering**: SVG and MathML trees use `createElementNS`; SVG `foreignObject` switches descendants back to HTML.
- **Pluggable DOM operations**: `domOps`, `setDOMOps()`, and `resetDOMOps()` are exported from `sinwan/renderer`.
- **Hydration-aware streaming SSR**: `streamHydratablePage()` and `streamHydratableNode()` stream the same marker protocol used by `renderToHydratableString()`.
- **Reactivity**: `signal`, `computed`, `effect`, `batch`, `nextTick`, type guards `isSignal`/`isComputed`, and the microtask scheduler.
- **Component model**: `cc` (alias for `cc`), component instances, parent/child trees, and JSX-declared component ownership.
- **Lifecycle**: `onMounted`, `onUnmounted`, `onUpdated`, `onError`, and `getCurrentInstance`.
- **Provide / inject**: prototype-chained dependency injection and typed `InjectionKey<T>` symbols.
- **JSX runtime**: `sinwan/jsx-runtime`, `sinwan/jsx-dev-runtime`, `Fragment`, `raw`, `safeHtml`, and `HtmlEscapedString`.
- **Client renderer**: `mount`, `render`, `unmountNode`, reactive text, reactive attributes, direct event binding, and lifecycle cleanup.
- **Server renderer**: `renderToString`, `streamPage`, page registry APIs, and `isSlots`.
- **Hydration**: `hydrate`, `renderToHydratableString`, and `renderNodeToHydratableString` with component, text, and event markers.
- **Packaging**: dual ESM / CJS builds, development and production bundles, declaration files, conditional exports, and React-style JSX entrypoints.
- **Documentation v1**: guides, API reference, runtime support, recipes, troubleshooting, and changelog.

### Changed

- **`SinwanNode` widened** to include `Signal<unknown>` and `Computed<unknown>`, matching renderer behavior.
- **JSX intrinsic attributes** now type reactive values, typed camelCase event handlers, `class` / `className`, style objects, `data-*`, `aria-*`, `key`, and `ref`.
- **`inject()` overloads** infer the value type from `InjectionKey<T>` with or without a default value.
- **`onUpdated` semantics tightened**: renderer-created reactive text, reactive attributes, `<Show>`, and `<For>` queue the owning component’s hooks after DOM updates, deduped per scheduler flush and skipped for initial render.
- **SSR renderers** resolve reactive top-level values and reactive attributes consistently in string and stream modes.

### Fixed

- JSX runtime no longer invokes function components eagerly during element construction. Components are passed through as tags so the renderer, server renderer, and hydrator own instance creation, lifecycle, provide/inject scope, and parent/child relationships.
- Lifecycle callbacks run with their owning component instance active, so synchronous cleanup registration such as `onMounted(() => onUnmounted(cleanup))` targets the same component.
- Importing `sinwan` exposes the global JSX intrinsic element map, preventing TS7026 editor errors when an IDE misses `jsxImportSource`.

### Internal

- Added 1.0.0 regression coverage for control flow, refs, namespaces, pluggable `domOps`, `onUpdated`, hydratable streaming, and release metadata.
- Build pipeline: `tsc` for declarations and Bun.build for ESM/CJS development and production bundles.
- Total tests: **245 pass / 0 fail**.
