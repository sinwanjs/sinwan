# Architecture

This document explains how Sinwan works internally. It’s the mental model you need to use the framework effectively and to debug it when something behaves unexpectedly.

## High-level layers

```
┌─────────────────────────────────────────────────────────────┐
│                         Public API                          │
│       (src/index.ts — re-exports of every layer below)      │
└───────┬───────────────┬───────────────┬───────────────┬─────┘
        │               │               │               │
┌───────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐  ┌─────▼─────┐
│  Reactivity  │  │ Components │  │   JSX      │  │  Escaper  │
│  signals,    │  │ instance,  │  │ runtime +  │  │  HTML     │
│  computed,   │  │ lifecycle, │  │ dev runtime│  │  escaping │
│  effects,    │  │ provide/   │  │ Fragment,  │  │  raw,     │
│  scheduler   │  │ inject     │  │ raw        │  │  safeHtml │
└──────────────┘  └────────────┘  └────────────┘  └───────────┘
        ▲               ▲               ▲               ▲
        │               │               │               │
┌───────┴───────────────┴───────────────┴───────────────┴─────┐
│                          Renderers                          │
├──────────────────────┬──────────────────────┬───────────────┤
│  Client renderer     │  Server renderer     │   Hydration   │
│  (DOM, real nodes)   │  (string / stream)   │  (walk DOM)   │
└──────────────────────┴──────────────────────┴───────────────┘
```

Each layer has a single, well-defined responsibility and only depends on the layers strictly required to do its job.

## Module layout

```
src/
├── index.ts                  ← public re-exports
├── types.ts                  ← SinwanNode, SinwanElement, SinwanComponent…
├── escaper.ts                ← runtime-agnostic HTML escaping
├── reactivity/
│   ├── signal.ts             ← Signal<T>
│   ├── computed.ts           ← Computed<T>
│   ├── effect.ts             ← effect(), ReactiveEffect, track/trigger
│   ├── batch.ts              ← batch()
│   ├── scheduler.ts          ← microtask flush queue, nextTick()
│   └── index.ts
├── component/
│   ├── instance.ts           ← ComponentInstance, current-instance stack
│   ├── lifecycle.ts          ← onMounted / onUnmounted / onUpdated / onError
│   ├── provide-inject.ts     ← provide() / inject()
│   ├── create.ts             ← createComponent / createPage / createLayout
│   └── index.ts
├── jsx/
│   ├── jsx-runtime.ts        ← jsx, jsxs, Fragment, raw, HtmlEscapedString
│   ├── jsx-dev-runtime.ts    ← jsxDEV
│   └── jsx-types.ts          ← SinwanIntrinsicElements
├── renderer/
│   ├── mount.ts              ← mount(), render(), unmountNode()
│   ├── render-element.ts     ← element / component / fragment to DOM
│   ├── render-children.ts    ← children + reactive text
│   ├── attributes.ts         ← class/style/boolean/reactive attrs
│   ├── events.ts             ← onXxx event binding
│   ├── dom-ops.ts            ← thin wrapper over DOM APIs
│   ├── types.ts              ← MountedNode, AppInstance
│   └── index.ts
├── server/
│   ├── renderer.ts           ← renderToString, renderPage, page registry
│   ├── stream.ts             ← streamPage (ReadableStream<Uint8Array>)
│   ├── hydration-markers.ts  ← renderToHydratableString
│   └── index.ts
└── hydration/
    ├── hydrate.ts            ← hydrate()
    ├── walk.ts               ← DOM cursor walker
    ├── markers.ts            ← marker constants + parsers
    └── index.ts
```

## The element model

JSX in Sinwan is **not** a virtual DOM. The runtime functions return a small, plain object:

```ts
interface SinwanElement {
  tag: string | SinwanComponent<any>; // "div" or a function
  props: Record<string, unknown>;
  children: SinwanNode[];
}
```

`SinwanNode` is the recursive type accepted anywhere a child can appear:

```ts
type SinwanNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | SinwanElement
  | Promise<SinwanElement>
  | HtmlEscapedString
  | SinwanNode[];
```

A renderer (client, server, hydrator) walks this tree and produces output. The object is **not retained** between renders — there is no diffing.

## Fine-grained reactivity (no diffing)

Most React-like libraries re-run the component function and diff a virtual tree. Sinwan instead binds reactivity directly to the DOM at construction time:

| Where a `Signal` / `Computed` appears | What the renderer does                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| As a child node `{count}`             | Creates a `Text` node + `effect(() => text.data = String(s.value))` |
| As an attribute `class={c}`           | Creates an `effect(() => el.setAttribute("class", c.value))`        |
| As a property `value={input}`         | Same idea, mapped to DOM property when applicable                   |

The component function runs **once** per mount/hydrate. After that, only effects fire, each updating exactly one node or one attribute. No diffs, no scheduler walks of a virtual tree, no per-update re-execution of user code.

This is the same model used by SolidJS and Preact Signals, plus a Vue-style component instance for lifecycle and DI.

## The scheduler (microtask flush)

Signals don’t trigger effects synchronously. They schedule them on the **microtask queue**, deduplicated by effect identity:

```text
counter.value = 1;       ─┐
counter.value = 2;        ├──> single microtask flush, effects run once
otherSignal.value = 99;  ─┘
```

Effects within a flush are sorted by their **creation id** (a monotonic counter), guaranteeing parent effects run before child effects. New effects scheduled during the flush are drained in the same pass with a safety limit (10) to prevent runaway loops.

Two functions let you control the timing:

- `batch(fn)` — collects writes, flushes synchronously when the outermost `batch` exits.
- `nextTick(fn?)` — returns a `Promise<void>` that resolves **after** the next flush; perfect for tests and post-update DOM measurements.

See [`03-reactivity.md`](./03-reactivity.md) for the deep dive.

## Component instance & lifecycle

Each component call creates a `ComponentInstance` (similar to Vue’s):

```ts
interface ComponentInstance {
  uid: number;
  component: SinwanComponent<any>;
  props: Record<string, any>;
  parent: ComponentInstance | null;
  children: ComponentInstance[];
  effects: CleanupFn[]; // every effect created during setup
  _mountedHooks: (() => void)[];
  _unmountedHooks: (() => void)[];
  _updatedHooks: (() => void)[];
  _errorHooks: ((err: Error) => void)[];
  provides: Record<string | symbol, unknown>; // prototype-chained
  isMounted: boolean;
  isUnmounted: boolean;
  // ...
}
```

A global `currentInstance` stack lets `onMounted`, `provide`, `inject`, etc. register on the right instance during the synchronous component call. After setup the stack is restored to its previous value; lifecycle callbacks temporarily reactivate their owning instance while they run, so synchronous cleanup registration like `onMounted(() => onUnmounted(cleanup))` still targets the same component.

**Lifecycle order** (matches Vue):

- `onMounted`: bottom-up — children first, then parent.
- `onUnmounted`: bottom-up — children first, then parent. Effects of the instance are disposed here.
- `onError`: bubbles up the parent chain until a handler is found, then logs to `console.error` if none.

## Rendering pipelines

### Client (`mount`)

```text
mount(Counter, container)
  ├─ create root ComponentInstance
  ├─ setCurrentInstance(instance)
  ├─ result = Counter(props)
  │     └─ during this call:
  │           - signals are created
  │           - onMounted/onUnmounted register on `instance`
  │           - provide() writes to instance.provides
  ├─ renderElementToDOM(result, container)
  │     - intrinsic <div> → real Element + attrs + events
  │     - signal child   → Text + effect()
  │     - sub-component  → recurse, push child instance
  ├─ setCurrentInstance(null)
  └─ fireMountedHooks(instance)   // bottom-up; each hook runs with its owner active
```

### Server (`renderToString`)

The server renderer is `async` because components and the JSX they return can be `Promise<SinwanElement>` (async components). It walks the same `SinwanElement` tree and produces an HTML string. Every text value (and every attribute value) is escaped via [`escapeHtml`](./11-escaping.md).

`streamPage` does the same, but pushes `Uint8Array` chunks into a `ReadableStream` as it walks the tree, using a `TextEncoder`. Both APIs are runtime-agnostic — they only depend on Web Streams and `TextEncoder` (available in Bun, Node ≥ 18, Deno, Cloudflare Workers, browsers).

### Hydration (`hydrate`)

`renderToHydratableString` adds three kinds of markers:

| Marker                                   | Where                       | Purpose                            |
| ---------------------------------------- | --------------------------- | ---------------------------------- |
| `data-sinwan-id="cN"`                    | Component root element      | Identify component boundaries      |
| `<!--sinwan-t:N-->value<!--/sinwan-t-->` | Reactive text slot          | Locate reactive text on the client |
| `data-sinwan-ev="click:N"`               | Element with event handlers | Optional event-binding hints       |

On the client, `hydrate(Component, container, props)`:

1. Runs **the component once** to recreate signals, register hooks, etc. — no DOM is created.
2. Walks the existing DOM with a `HydrationCursor`, pairing each `SinwanNode` with the matching real node.
3. For each signal child, finds the `<!--sinwan-t:N-->…<!--/sinwan-t-->` pair and attaches an `effect` to update the inner text node.
4. For each event handler in JSX, calls `addEventListener` on the live element.
5. Reactive attributes get effects; static attributes are left alone (they are already correct in the SSR output).
6. Fires `onMounted` bottom-up.

See [`10-hydration.md`](./10-hydration.md) for the full protocol.

## Build pipeline

The Sinwan build produces React-style dual artefacts:

```
dist/
├── index.js                      ← CJS shim (NODE_ENV branch)
├── index.mjs                     ← ESM fallback (re-exports prod ESM)
├── index.d.ts                    ← types
├── jsx-runtime.{js,mjs,d.ts}
├── jsx-dev-runtime.{js,mjs,d.ts}
├── server.{js,mjs,d.ts}
├── cjs/
│   ├── package.json              ← {"type":"commonjs"}
│   ├── index.development.js
│   ├── index.production.min.js
│   └── (jsx, jsx-dev, server, …)
└── esm/
    ├── package.json              ← {"type":"module"}
    └── (same tree)
```

The package’s `exports` field combines `import` / `require` × `development` / `production` conditions so any modern bundler picks the optimal file automatically. See [`13-build-and-deploy.md`](./13-build-and-deploy.md).

## Why no virtual DOM?

- **Smaller runtime.** No reconciliation engine, no fiber tree, no key heuristics.
- **Predictable updates.** A signal change updates exactly one node — you can reason about it node by node.
- **Streaming-friendly SSR.** No “unbounded children → finite output” mismatch when streaming.
- **Hydration that doesn’t re-render.** Because there’s no virtual tree to diff, hydration is just “walk and attach”.

Structural changes use dedicated primitives instead of a virtual-DOM diff. Use `<Show>` for conditional subtrees and `<For>` for keyed reactive lists; both render between stable anchors and clean up removed component trees.

## Performance characteristics

- **Mount cost**: roughly one DOM operation per node + one effect per reactive binding.
- **Update cost**: O(1) per changed signal, regardless of tree size. Each signal stores its subscribers in a `Set<ReactiveEffect>`.
- **Memory**: each instance keeps a `parent`, a `children` array, and a `provides` object whose `[[Prototype]]` is the parent’s — `O(1)` per instance with cheap inherited lookups.

## Going further

- The next document, [`03-reactivity.md`](./03-reactivity.md), gives the precise semantics of every reactive primitive.
- [`08-renderer.md`](./08-renderer.md) and [`09-ssr.md`](./09-ssr.md) cover the renderers in detail.
- For the published-package shape and the build script, jump to [`13-build-and-deploy.md`](./13-build-and-deploy.md).
