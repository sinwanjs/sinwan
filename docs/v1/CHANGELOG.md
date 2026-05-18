# Changelog

All notable changes to **Sinwan** are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/) and Sinwan adheres to [Semantic Versioning](https://semver.org/) for the 1.x line.

---

## [Unreleased]

No unreleased changes.

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

- **Reactive control flow**: public `<Show>` and `<For>` helpers exported from `sinwan`.
  - `<Show>` swaps between truthy content and fallback content reactively.
  - `<For>` renders signal-backed arrays with keyed insert, remove, reorder, cleanup, and same-key item replacement semantics.
- **Public refs**: JSX `ref` supports callback refs and object refs, sets them after mount, and clears them on unmount.
- **Namespace-aware rendering**: SVG and MathML trees use `createElementNS`; SVG `foreignObject` switches descendants back to HTML.
- **Pluggable DOM operations**: `domOps`, `setDOMOps()`, and `resetDOMOps()` are exported from `sinwan` and `sinwan/renderer`.
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
