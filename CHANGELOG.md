# Changelog

All notable changes to **Sinwan** are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/) and Sinwan adheres to [Semantic Versioning](https://semver.org/) for the 1.x line.

## [1.2.6] — Template Slot Resolution, JSXFragment Compiler Fix, For Reconciliation Optimization & React API Expansion

Sinwan 1.2.6 fixes two compiler/runtime bugs — incorrect slot target resolution after child mutations and JSXFragment children being silently dropped in hoisted templates — optimizes `<For>` list reconciliation to minimize DOM mutations on array updates, tightens JSX runtime type safety, fixes README errors, adds `forwardRef` and `Children` to the React-compatible API surface, and brings pro-grade native HTML/SVG attribute typing and cast-free typed event handlers to JSX elements.

### Added

- **`forwardRef` (`sinwan/react`)**: React-compatible `forwardRef<T, P>(render)` that wraps a render function to receive a `ref` as its second argument, allowing parent components to access the underlying DOM element or imperative handle of a child component. Uses `REACT_FORWARD_REF_TYPE` symbol for identity. The wrapper transparently strips `ref` from props and passes it to the render function — no renderer changes needed. Supports ref objects, callback refs, `useImperativeHandle` composition, nested forwardRef, and SSR. Added `ForwardRefExoticComponent<P>` and `ForwardRefRenderFunction<P, T>` types to `_types/core.ts`. 15 tests covering reference metadata, ref forwarding (object + callback), props passthrough, no-ref rendering, useImperativeHandle integration, children handling, ref stripping, nesting, and SSR safety.
- **`Children` (`sinwan/react`)**: React-compatible `Children` utilities — `map`, `forEach`, `count`, `only`, `toArray`. Flattens nested arrays, filters out null/undefined/boolean nodes, and matches React's API exactly. 31 tests covering all five methods with single child, multiple children, null/undefined/boolean, nested arrays, and edge cases.

### Fixed

- **Template Slot Index-Shift Bug (`template.ts`)**: Fixed attr/event slot targets resolving to the wrong DOM element when a reactive child slot preceded them. Previously, `walkToSlot` traversed the live DOM tree after child slots had already inserted anchor comment nodes, shifting element indices. The template renderer now pre-collects all child slot comment markers (`collectSlotMarkers`) and pre-resolves attr/event slot targets before any child slot processing, ensuring slot paths remain stable regardless of insertion order.
- **JSXFragment Children Dropped in Compiler (`transform.ts`)**: Fixed `elementToHtml` silently dropping `JSXFragment` (`<>...</>`) children in hoisted templates. The child processing loop only handled `JSXText`, `JSXExpressionContainer`, and `JSXElement` — fragments had no case, so their children were skipped entirely (no HTML generated, no slot created, `childIndex` not incremented). This also corrupted slot paths for any siblings after the fragment. Extracted child processing into a reusable `childrenToHtml` helper that recursively inlines fragment children at the parent's path level, with correct `childIndex` tracking. Supports arbitrary nesting (fragments inside fragments). Affected only the compiler's template hoisting path; runtime, SSR, and hydration already handled `tag === ""` fragments correctly.

### Changed

- **`<For>` DOM Reconciliation Optimization (`render-control-flow.ts`)**: Replaced the full fragment shuffle (moving ALL nodes into a `DocumentFragment` and re-inserting at `block.endAnchor`) with per-node insertion that only moves nodes that are out of position. The new approach walks the new list right-to-left, tracking a `refNode` (starting at `block.endAnchor`), and for each record checks if its DOM nodes are already in the correct position before `refNode` — skipping the move if so. This reduces DOM mutations from O(2n) (remove + re-add all nodes) to O(k) where k is the number of actually displaced nodes. For a single item append, mutations drop from 8 to 2 (1 new item insertion + 1 text update for the count display). Applies to both client-side rendering and post-hydration updates via the shared `renderForBlock` function.

### Changed (cont.)

- **`<For>` Append-Only Fast Path (`render-control-flow.ts`)**: Added a dedicated fast path for the common case of appending items to the end of a list (e.g., `setArr(a => [...a, item])`). When the new array shares an identical prefix with the previous array and only has additional items at the end, the `<For>` renderer now renders only the new items into a `DocumentFragment` and inserts them once at `block.endAnchor` — skipping the full keyed diff and reorder loop entirely. Previously, appending a single item triggered the full diff path, which removed and re-inserted existing DOM nodes via the reorder loop, producing spurious `remove` + `insert` mutations. Now matches SolidJS `<For>` behavior: only the new item is inserted, existing nodes are never touched. Verified with `sinwan-scan` — no `removed child` mutations on append.

### Fixed (cont.)

- **`<For>` Swap Path Premature Return (`render-control-flow.ts`)**: Fixed two premature `return` statements in the swap DOM reorder path that left `lastList` stale and skipped `onMounted`/`onUpdated` lifecycle hooks when DOM nodes were missing (`nodeI`/`nodeJ` null) or detached (`parentNode` null). The swap path now updates `lastList`, fires `queueUpdatedHooks`, and sets `initialized = true` before returning, matching the contract of all other exit paths in `renderForBlock`.
- **`cc` Children Type Error (`create.ts`, `types.ts`)**: Fixed `Type 'SinwanNode | SinwanSlots' is not assignable to type 'SinwanNode'` — the `cc` factory and `SinwanComponent` interface typed `children` as `SinwanNode | SinwanSlots`, but `SinwanSlots` (a `Record<string, SinwanNode>`) is not a `SinwanNode`, so embedding `{children}` in JSX failed. Introduced `PropsWithAutoChildren<P>` conditional type that injects `children?: SinwanNode` only when `P` doesn't already declare a `children` key, letting users opt into named slots via `children?: SinwanSlots` in their props type. Constrained `R extends SinwanNode` and removed both `as any` casts from `cc`.
- **README Duplicate `mount` Import**: The Quick Start example imported `mount` twice — once from `sinwan/component` (which does not export it) and once from `sinwan/renderer`. Removed the incorrect `sinwan/component` import.
- **README Missing Positioning Section**: Added a "Why Sinwan?" section explaining the library's value proposition (no virtual DOM, fine-grained reactivity, React-compatible JSX, SSR/hydration, single dependency) — critical context for new users evaluating the library.

### Changed (cont.)

- **Shared Component Detection (`sinwan-compiler`, `vite-plugin-sinwan`)**: Extracted `collectExportedComponents` from `vite-plugin-sinwan/src/compiler/hmr.ts` into `sinwan-compiler/src/exports.ts` as a shared utility. Both Vite and Bun plugins can now import it from `sinwan-compiler` instead of duplicating Babel parsing logic. The Vite plugin's HMR module went from 135 to 51 lines. Added 9 tests covering named functions, named variables, default exports, export specifiers with rename, multiple components, non-component exports, unparseable code, and re-exports.
- **Unified React Export Cleanup (`react/`)**: Removed dead/duplicate exports found during an audit of the unified `sinwan/react` barrel (originally consolidated in 1.2.5):
  - **Duplicate `use` export**: `use` was exported from both `_client.ts` and `_shared.ts`. Removed from `_client.ts` (it's a shared API that runs on both client and server).
  - **Redundant `_shared.ts` re-exports**: `_server.ts` and `_static.ts` both re-exported `_shared.ts` via `export *`, but `index.ts` already exports `_shared.ts` directly — causing triple re-export. Removed the redundant re-exports from `_server.ts` and `_static.ts`.
  - **Duplicate `Usable` type**: `Usable` was exported from `_shared.ts` (via `_types/hooks.ts`) and also from `_type.ts` (via `_types/index.ts` → `_types/hooks.ts`). Removed from `_shared.ts` since `_type.ts` covers all types.
  - Updated all doc comments in `src/react/*.ts` from `sinwan/react-client` / `sinwan/react-server` to `sinwan/react`.
  - Fixed 3 test files (`use.test.ts`, `suspense.test.ts`, `use-deferred-value.test.ts`) that imported `use` from `_client.ts` directly — updated to import from `_shared.ts`.
- **JSX Runtime Type Safety (`jsx-runtime.ts`)**: Replaced all `any` types in the JSX factory functions with proper typed aliases. Introduced `JSXElementType` (`string | symbol | SinwanComponent<any>`), `JSXProps` (`Record<string, unknown>`), and `EnhancerFn` types. Updated signatures for `jsx`, `jsxs`, `jsxDEV`, `buildElement`, `jsxIntrinsic`, `normalizeChildren`, `stripChildrenProp`, `registerEnhancedElements`, and the `enhancedRegistry` variable. `normalizeChildren` now accepts `unknown` with explicit `SinwanNode` casts at the boundary instead of `any` passthrough. Key parameters now include `null` to match the TypeScript JSX transform's output for missing keys.
- **Scheduler `extractEffects` Simplification (`scheduler.ts`)**: Replaced the 14-line implementation with a 5-line version. Removed the redundant `size <= 1` early-return branch — sorting a 0-1 element array is trivially fast, so the optimization was unnecessary complexity.

### Internal

- Added 6 compiler tests for slot path generation: reactive child + attr sibling ordering, multiple reactive children, JSXFragment basic children, JSXFragment with reactive children (slot path verification), nested JSXFragments, and attr + event on same element after reactive sibling.
- Compiler tests: 102 pass / 0 fail.
- Added 9 tests for `collectExportedComponents` in `sinwan-compiler/__tests__/exports.test.ts`.

### Added (cont.)

- **Auto-`cc` Component Wrapping (`sinwan-compiler/src/auto-cc.ts`)**: New `autoWrapComponents()` compiler pass that detects exported uppercase functions returning JSX (0–1 params) and automatically wraps them with `cc(...)`, injecting `import { cc } from "sinwan/component"` only when needed. Previously, only functions explicitly wrapped with `cc(fn)` were treated as components by the compiler — a bare `export function App() { return <div/> }` was skipped entirely, so reactive expressions inside it were never wrapped. The pass is idempotent: it skips functions already wrapped with `cc(...)`. Wired into both `transform.ts` (before `wrapReactiveExpressions`) and `analyze.ts` (before `trackReactiveImports`). Exported from `sinwan-compiler/src/index.ts`.
- **`useFetch` as a Reactive Source (`sinwan-compiler/src/reactive-wrap.ts`)**: Added `sinwan/hook` to `REACTIVE_SOURCE_MODULES` and `useFetch` to `ImportNames` / `isReactiveSourceCall`. Previously, `const { data } = useFetch(...)` produced zero bindings because `sinwan/hook` was not in the reactive source module list, so `scope.bindings.size === 0` caused the function body to be skipped — reactive reads of `data.value` were never wrapped. Also added a `signalObject` binding kind for whole-shell useFetch returns used via property access (e.g., `const f = useFetch(...).json(); const { data } = f`).
- **`signalObject` Binding Kind (`sinwan-compiler/src/reactive-wrap.ts`)**: New binding kind for variables that hold a reactive shell object (e.g., the return of `useFetch(...).json()`), so that destructured members like `data`, `error`, `isLoading` are tracked as reactive signals and member-access reads (`data.value`, `error.value`) are wrapped in zero-arity getters.

### Fixed (cont.)

- **Optional Chaining (`?.`) and Non-Null (`!.`) Not Recognized as Reactive Reads (`sinwan-compiler/src/reactive-wrap.ts`)**: `isReactiveRead` / `getMemberExpressionRootAndPath` only matched `MemberExpression`, never `OptionalMemberExpression` or `TSNonNullExpression`. So `data.value?.message` and `state.user!.name` produced zero wrapped reads — the expression was passed through as-is, breaking reactivity for any code using optional chaining or non-null assertions on reactive sources. `getMemberExpressionRootAndPath`, `isReactiveRead`, `isReactiveValue`, and `transformPropMemberAccess` now walk `OptionalMemberExpression` and `TSNonNullExpression` nodes, unwrapping them to find the underlying reactive root.
- **Built-in Control-Flow Direct Reactive Children Not Wrapped (`sinwan-compiler/src/reactive-wrap.ts`)**: `isReactiveComponentProp` required a non-null `attributeName`, so direct child expressions of any component (including built-in control-flow like `<Show>`, `<For>`, `<Dynamic>`, `<Index>`) were skipped — `<Show when={data.value}>{data.value?.message}</Show>` compiled with `when` wrapped but `children` passed through as a bare expression, so `<Show>` rendered nothing even when `data` resolved. Direct reactive children of built-in control-flow components are now wrapped in zero-arity getters, matching the behavior of attribute props.
- **HMR Effect Duplication — `effect()` in Component Body Leaked Across Hot-Swaps (`reactivity/effect.ts`, `component/instance.ts`, `renderer/mount.ts`, `renderer/render-element.ts`, `react/create-root.ts`, `react/use-effect.ts`)**: `effect()` created directly in a component body returned a dispose function that was never captured, so the effect was never torn down on HMR hot-swap / unmount / Activity soft-hide. Each hot-swap added another live effect, so a single state change logged N times (once per accumulated version) — the exact bug reported in the Bun and Vite test apps (`[App] appCount changed` firing 2, 3, 4... times after successive edits). Introduced an **effect scope** (Vue/SolidJS pattern): `setActiveEffectScope`/`getActiveEffectScope` manage a global active scope anchored on `globalThis` via `Symbol.for("sinwan.effectScope")` (shared across bundle boundaries); `effect()` auto-registers its dispose on the active scope; `ComponentInstance` structurally satisfies the new `EffectScope` interface via its existing `effects: CleanupFn[]` field. Added `runComponentSetup`/`restoreEffectScope` helpers — the component instance is set as the active scope **only during the setup call**, then the scope is cleared before the render phase so renderer-internal DOM-binding effects (reactive text/attribute expressions) still go to `node.disposers` and survive Activity/Key soft-hide (which disposes `instance.effects` but preserves the DOM). Wired into all four setup call sites: `mount()`, `renderComponentToDOM()`, `hotSwapRootInstance()`, and `softShowInstance()`, plus `useEffect`'s `runEffect` so effects created inside a `useEffect` callback are also owned by the component. `ReactiveEffect.dispose()` is idempotent, so a manual `dispose()` call by the caller remains safe alongside scope disposal. 16 new tests across `__tests__/reactivity-effect-scope.test.ts` (scope API, auto-registration, idempotent double-dispose, no-registration outside a scope, computed unaffected) and `__tests__/hmr/effect-disposal.test.ts` (no duplication across repeated hot-swaps, disposal on unmount, body runs once on mount, DOM bindings survive Activity soft-hide/show, effects in `useEffect` callbacks, error-path scope restoration).

### Internal (cont.)

- Added 18 compiler tests in `sinwan-compiler/__tests__/transform.test.ts`: auto-cc wraps exported JSX-returning function, auto-cc skips already-cc-wrapped function, auto-cc injects `cc` import only when needed, useFetch destructure tracks `data.value` as reactive, useFetch whole-shell property access tracks `data.value`, optional chaining `?.` on reactive signal wrapped, optional chaining on mutable proxy wrapped, non-null assertion `!.` on reactive signal wrapped, `<Show>` direct reactive child wrapped, `<Show>` `when` prop wrapped, non-regression for plain (non-reactive) children, non-regression for event handlers, non-regression for plain identifiers, auto-cc + useFetch combined, nested optional chaining, `<For>` direct reactive child, `<Dynamic>` direct reactive child, and useFetch with `.json()` chain.
- Compiler tests: 137 pass / 0 fail (119 existing + 18 new). `bunx tsc --noEmit` clean.
- Rebuilt `sinwan-compiler/dist`, `bun-plugin-sinwan/dist`, and `sinwan/dist`.

### Added (cont.)

- **Native HTML/SVG Attribute Typing for JSX (`jsx-types.ts`)**: Wired curated, IDE-friendly attribute unions into every Sinwan intrinsic element so JSX feels native and pro-grade. Introduced a `MergeAttrs<P, Attrs>` helper that lets a curated attribute interface override the looser DOM-derived types from `NativeProps` (via `Omit<P, keyof Attrs> & Attrs`) while preserving `children`, `style`, `class`, `ref`, `key`, `data-*`, and all other native DOM properties. Added `AriaAttributes`, `HTMLAttributes`, and element-specific interfaces (`AnchorHTMLAttributes`, `ImgHTMLAttributes`, `InputHTMLAttributes`, `LinkHTMLAttributes`, `ScriptHTMLAttributes`, `StyleHTMLAttributes`, `OlHTMLAttributes`, `TableHTMLAttributes`, `TdHTMLAttributes`, `ThHTMLAttributes`, `DialogHTMLAttributes`, `IframeHTMLAttributes`, `AreaHTMLAttributes`, `MediaHTMLAttributes`) plus helper types (`Booleanish`, `AriaRole`, `HTMLAttributeReferrerPolicy`, `HTMLAttributeAnchorTarget`, `HTMLInputTypeAttribute`, the `AutoFill*` autocomplete union family, `CrossOrigin`). Every HTML intrinsic element now exposes its correct attribute unions (e.g. `<a target="_blank" referrerPolicy="no-referrer">`, `<img loading="lazy" fetchPriority="high" crossOrigin="anonymous">`, `<input type="email" autocomplete="off">`, `<ol type="a">`, `<td align="center" valign="top">`, `<dialog closedby="any">`) and every element gets the global `role`, `aria-*`, `popover`, `popoverTargetAction`, `inputMode`, `enterKeyHint`, `autocapitalize`, `contentEditable`, and `translate` attributes. All SVG intrinsic elements now expose `SVGAttributes` (`fillRule`, `strokeLinecap`, `strokeLinejoin`, `textAnchor`, `dominantBaseline`, `alignmentBaseline`, `colorInterpolationFilters`, `focusable`, etc.). Enhanced element props (`FormProps.action`, `InputProps.defaultValue`/`defaultChecked`/`formAction`, `ButtonProps.type`/`formAction`, `SelectProps.defaultValue`, `TextareaProps.defaultValue`, `OptionProps.selected`, `ProgressProps.value`, `LinkProps.precedence`/`disabled`, `StyleProps.precedence`/`href`, `TitleProps.children`) are preserved alongside the native attribute unions.
- **Cast-Free Typed Event Handlers (`jsx-types.ts`)**: Event handlers on JSX elements now automatically narrow `currentTarget` and `target` to the bound element type, eliminating the `event.target as HTMLInputElement` boilerplate. `<input oninput={(e) => { state.name = e.currentTarget.value; }} />` now compiles with no cast and no explicit annotation. Introduced `EventOf<H>` (extracts the native DOM event class from an `on*` handler property — the DOM lib already maps `onclick`→`PointerEvent`, `oninput`→`InputEvent`, `onkeydown`→`KeyboardEvent`, `onsubmit`→`SubmitEvent`, etc.) and `SinwanEventHandler<T, H>` (narrows `currentTarget: T` and `target: T` on the event). `NativeProps<T>` was restructured into two key-remapped mapped-type halves: event keys (`on${string}`) map to `SinwanEventHandler<T, T[K]>`, all other keys keep `AllowString<T[K]>`. This is honest with Sinwan's direct-binding model (`addEventListener` per element, no delegation) — `currentTarget` is always the bound element at runtime. Backward-compatible: parameter-less handlers (`onclick={() => ...}`) and explicit `event: Event` annotations still compile.

### Fixed (cont.)

- **`HTMLFormElement` Index-Signature `any`-Leak (`jsx-types.ts`)**: Fixed `HTMLFormElement`'s legacy `[name: string]` index signature (for `form["fieldName"]` access) silently leaking into `NativeProps` as a `[key: string]: any` member, which widened _every_ form prop — including all event handlers and non-event attributes — back to `any`, defeating typed events and attribute unions on `<form>`. Introduced `StripIndex<T>` (filters out `string`/`number` index signatures via key remapping: `[K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]`) and mapped over `Omit<StripIndex<T>, …>` in both halves of `NativeProps`. This also fixed form's non-event props being silently `any` — a regression no runtime test could catch since `any` accepts everything.

### Internal (cont.)

- Added 12 type-level + runtime tests in `sinwan/__tests__/jsx-native-attrs.test.tsx` verifying native attribute unions are exposed on `<a>`, `<img>`, `<input>`, `<button>`, `<video>`, `<dialog>`, `<ol>`, `<td>`, `<div>`/`<span>` (global ARIA + popover), and SVG `<circle>`/`<line>`/`<svg>`, plus runtime passthrough of native attributes through `jsx(...)`.
- Added 10 type-level + runtime tests in `sinwan/__tests__/jsx-typed-events.test.tsx` verifying `currentTarget`/`target` narrowing on `<input oninput>`, `<button onclick>`, `<a onclick>`, native event class preservation (`PointerEvent` for `onclick`, `KeyboardEvent` for `onkeydown`, `SubmitEvent` for `onsubmit`), back-compat (parameter-less handlers and explicit `event: Event` annotations), and runtime handler passthrough.
- `sinwan` tests: 2470 pass / 0 fail (2448 existing + 22 new). `bun run typecheck` clean (only 3 pre-existing unrelated errors in `compiler-protocol-drift.test.ts` and `hydration-template.test.tsx`). `bun run build:types` clean — merged types ship in `dist/jsx/jsx-types.d.ts`.

---

## [1.2.5] — Fragment SSR, Hydration Control-Flow Fixes & Plugin-Free Fast Refresh

Sinwan 1.2.5 fixes a bug where JSX Fragments (`<>...</>`) were incorrectly rendered as literal text in the non-hydratable SSR string renderer, and brings hydrated control-flow components to parity with client-side rendering. After SSR hydration, editing, adding, or removing a single list item no longer destroys and recreates the whole subtree — preserving focus, scroll position, component state, and event bindings. This release also introduces **plugin-free Fast Refresh**: HMR updates now preserve component state without a compiler/Babel plugin.

### Added

- **Unified React Export (`sinwan/react`)**: Consolidated the React integration exports, which were previously split across four separate entry points (`sinwan/react-client`, `sinwan/react-server`, `sinwan/react-static`, `sinwan/react-type`), into a single `sinwan/react` barrel. All client hooks, server rendering APIs, shared adapters, static prerendering APIs, and React-compatible types are now importable from `sinwan/react`. The old sub-path entries were removed from `package.json` exports. The internal barrel structure (`_client.ts`, `_server.ts`, `_shared.ts`, `_static.ts`, `_type.ts`) remains for organization, but `index.ts` re-exports all of them.
- **Compiler Pass (`sinwan-compiler`)**: Auto-wraps reactive JSX expressions (`state.name`, `signal.value`, `getter()` calls, derived expressions) in zero-arity functions. Event handlers and plain identifiers are not double-wrapped. Added to `vite-plugin-sinwan` and `bun-plugin-sinwan`.
- **Plugin-Free Fast Refresh (HMR State Preservation)**: `createRoot().render()` and `hydrateRoot().render()` now detect when they are called again on an already-mounted (or hydrated) root and **hot-swap** the component function on the existing `ComponentInstance` instead of unmounting and remounting the tree. Because Sinwan stores hook state in slots on the instance, this preserves state across HMR edits without any compiler plugin (unlike React Fast Refresh / `solid-refresh`, which require a Babel transform). Works for both **client-only (`createRoot`)** and **SSR-hydrated (`hydrateRoot`)** apps. Preserved across an edit:
  - React-compatible hooks — `useState`, `useReducer`, `useRef`, `useMemo`, `useCallback` (all backed by `hook_slots` via `useSlot`).
  - Native Sinwan signals created inside a component — `signal()` now auto-registers on the current `ComponentInstance` (`signal_slots`) so its value survives a hot-swap. Module-level signals are preserved by the bundler's HMR data, as before.
  - State of **nested child components**, matched by position in the component tree and re-attached before each child's setup re-runs.
  - Effects (`useEffect`) and lifecycle hooks (`onMounted` / `onUnmounted`) are correctly cleaned up and re-registered against the new code.
- **`AppInstance._instance`**: `mount()` and `hydrate()` now expose the root `ComponentInstance` on the returned `AppInstance` (internal field) so the React `createRoot` / `hydrateRoot` adapters can drive the hot-swap.
- **Per-Component HMR Boundaries (`vite-plugin-sinwan`)**: The Vite plugin now injects a self-accepting Fast Refresh footer into every component module in the dev server (`fastRefresh` option, default `true`). Each component file becomes its **own** HMR boundary, so Vite reports the actual edited file (`hmr update /src/Foo.tsx`) instead of falling back to the entry — and editing the entry no longer full-reloads the page. A new dev-only **component registry** (`src/hmr/component-registry.ts`) maps each pre-edit component function to its latest hot-swapped version via a `WeakMap` chain; `renderComponentToDOM` resolves to the latest version, so even though an unedited parent still holds the old function through a stale ESM import binding, the freshest code runs. On edit, the injected footer records `oldExport → newExport` (`$$sinwanReplace`) and re-renders every mounted root (`$$sinwanRefresh`), preserving state through the same slot mechanism. Detection is conservative (top-level exports whose name starts with an uppercase letter); the runtime ignores anything not used as a component. Active only in `vite serve`; production builds are never touched. Works without `@vitejs/plugin-react` (which must stay disabled).

  **Production safety**: the entire Fast Refresh path is gated behind the `__DEV__` define and is **dead-code-eliminated from production bundles** (verified: `*.production.min.js` contains none of the hot-swap or `signal_slots` code). In production, `render()` keeps its original unmount + remount behaviour, and `signal()` compiles to `new SignalImpl(initial)` with zero added overhead.

  **SSR safety**: `createRoot` is client-only (`assertClient` throws on the server), and the renderer hook + signal-slot logic are dev-only. SSR string, streaming, and hydration output are unaffected.

  **Bundler wiring** (no library code required from users, only entry/dev-server setup): under **Bun**, remove `react`/`react-dom` from dependencies so Bun does not inject React Fast Refresh (which cannot drive Sinwan components and would otherwise swallow the update), and call `import.meta.hot.accept()` in the entry; under **Vite**, add the `vite-plugin-sinwan` plugin — it injects per-component HMR boundaries automatically, so no manual `import.meta.hot.accept` is needed for component files (the only thing left to the app is to self-accept the **entry** with `import.meta.hot.accept()`, since the entry has no importer and would otherwise full-reload). React Fast Refresh must not be active, as it owns the HMR boundary for `.tsx` files.

  **Known limitations** (honest scope — narrower than React Fast Refresh's signature-based refresh):
  - Child state is matched by **tree position**, so conditionally adding/removing or reordering components between edits can misalign preserved state for the affected subtree.
  - There is **no hook-signature detection**; changing the number or order of hooks in a component between edits can misalign slots. Any error thrown during a hot-swap falls back to a full remount.
  - Async (Promise-returning) root components are not special-cased in the hot-swap path and fall back to a full remount.
  - `computed()` declared inside a component is intentionally re-created on hot-swap (it re-derives from the preserved signals).

### Fixed

- **Fast Refresh `useState` + `signal()` State Cross-Wiring**: Fixed a hot-swap bug where a component mixing `useState` (or any hook backed by `useSignalSlot` — `useReducer`, `useOptimistic`, `useDeferredValue`, `useSyncExternalStore`, `useTransition`, `useActionState`) with a native `signal()` could end up sharing a single underlying signal after an HMR edit — mutating one changed the other. Hook-internal signals were leaking into the user-land `signal_slots`; because the hook slot's init runs only on the first render (not on hot-swap reuse), the signal cursor drifted and a user `signal()` was re-bound onto a `useState` signal. `useSignalSlot` now creates its signal via `withoutSignalSlotRegistration(...)` so hook-internal signals are preserved through `hook_slots` only and never pollute `signal_slots`. Only manifested when **mixing** `useState` with `signal()` (pure `useState`+`useState` or `signal()`+`signal()` were unaffected), in both Bun and Vite.
- **Fragment Rendering in `renderer.ts`**: JSX Fragments (`tag === ""`) were falling through to the intrinsic element path in `renderElement`, producing escaped HTML like `&lt;&gt;...&lt;/&gt;`. Added an explicit fragment check to `renderElement` in `renderer.ts` so fragments render their children directly without a wrapper, matching the behavior of the streaming (`stream.ts`) and hydratable (`hydration-markers.ts`) renderers.
- **`<Index>` Hydration Granular Updates**: Fixed hydrated `<Index>` re-executing its children callback and re-mounting every item whenever the source array changed. The hydration walker (`walk.ts`) now creates a per-position `Signal<T>` for each item and, on update, writes only the changed signals (`records[i].item.value = newList[i]`) — matching the client-side `renderIndexBlock`. Adding or removing items now only mounts/unmounts the affected rows.
- **`<Show>` / `<Dynamic>` Hydration Re-render Guard**: Fixed hydrated `<Show>` (and `<Dynamic>`) destroying and recreating their entire subtree whenever an effect re-ran, even if the resolved value was unchanged. For example, a `<Show when={computed(() => items.length > 0)}>` wrapping a list would nuke the list on every item edit. `makeReactiveBlock` now accepts a comparison getter and skips re-rendering when the value (`when` / component `tag`) is unchanged via `Object.is`, mirroring the existing `renderShowBlock` / `renderDynamicBlock` optimizations.
- **`<For>` Hydration Keyed Reconciliation**: Fixed hydrated `<For>` performing a full list destroy/recreate on any array change. `renderForBlock` now accepts an optional hydration seed (`ForHydrationSeed`) so the hydration walker can adopt the server-rendered DOM into keyed records and reuse the exact same keyed reconciler as the client renderer — reusing unchanged rows by key and re-rendering only changed/added/removed rows.
- **`<For>` Single-Item Update Ordering**: Fixed the `renderForBlock` single-item fast path re-inserting a re-rendered row at the block end anchor, which moved any non-last edited row to the end of the list (e.g. `Abc` became `bcA`). The replacement is now inserted at the row's original DOM position. Affected both client-side and hydrated `<For>`.
- **`<For>` Single-Item Update Missing `onMounted`**: Fixed the `renderForBlock` single-item fast path firing only updated hooks, so a newly-created row component never fired `onMounted`. It now calls `fireMountedAndQueueUpdated`, consistent with the initial-render and full-diff paths.

---

## [1.2.4] — SSR Hydration & Streaming Renderer Fixes

Sinwan 1.2.4 fixes critical race conditions in the SSR hydration renderer and hardens the streaming renderer with missing element type support and proper component root propagation.

### Added

- **React Type Export**: Added new `sinwan/react-type` export that provides React-compatible types from the `_types` directory. Includes type definitions for ReactNode, ReactElement, Ref, ComponentType, Key, and other core React types authored from scratch without React imports. _(Note: consolidated into `sinwan/react` in 1.2.5)_

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
