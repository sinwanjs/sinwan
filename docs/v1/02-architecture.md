# Sinwan Architecture: A DOM-First, Promise-Native UI Runtime

This document is a technical manifesto for Sinwan. It is not a tutorial, nor marketing copy. It is an explanation of why Sinwan exists, what architectural bets it makes, what the code actually does, and what this enables next.

---

## 1. Introduction

Sinwan is a UI runtime that treats the DOM as the ground truth and asynchrony as a first-class rendering primitive. Components do not “re-render” in the traditional VDOM sense. They run once to register reactive effects and lifecycle hooks. Fine‑grained reactivity mutates the DOM directly, under the control of an explicit scheduler.

Why another framework? Because the web’s central problem today is asynchrony interacting with rendering. Most systems bolt async onto an architecture designed for synchronous VDOM diffing, causing waterfalls, opaque re-render storms, and hydration edge cases. Sinwan instead bakes promises, signals, and DOM anchors into the renderer. The result is fewer incidental abstractions: the commit is literal DOM changes, scheduled with intent and bounded by anchors.

---

## 2. Rendering Philosophy

Sinwan’s JSX factory builds a declarative description (`SinwanElement`) that the renderer owns. Crucially, it does not call function components during element creation; this preserves instance/lifecycle control:

```ts
// src/jsx/jsx-runtime.ts (excerpt)
function buildElement(
  type: any,
  props: any,
  children: SinwanNode[],
): SinwanElement {
  // ...
  // The renderer (client / server / hydration) is the single owner of
  // component-instance creation and lifecycle dispatch.
  // Calling the function eagerly here would bypass instance management.
  if (typeof type === "function" || typeof type === "string") {
    const finalProps = props ?? {};
    if (children.length > 0 && finalProps.children === undefined) {
      finalProps.children = children.length === 1 ? children[0] : children;
    }
    return { tag: type, props: finalProps, children };
  }
  return { tag: "", props: {}, children };
}
```

The component return value is not a VDOM that must be diffed later. Instead, Sinwan treats the returned structure as a one-time description of where to place anchors and which reactive computations to register. Subsequent updates are produced by effects, not by re-running components.

Two design choices are central:

- The node model explicitly encodes asynchrony and reactivity:

```ts
// src/types.ts (excerpt)
export type SinwanNode =
  | SinwanPrimitive
  | SinwanElement
  | Promise<SinwanNode> // async nodes are first-class
  | HtmlEscapedString
  | Signal<unknown> // fine-grained reactive values
  | Computed<unknown>
  | (() => unknown) // getter as reactive node
  | SinwanNode[];
```

- The renderer is DOM-first. It mutates the DOM in place, using comment anchors to delimit reactive regions. There is no global virtual tree to diff.

Why Promise-based rendering matters: Promises are not an afterthought hidden behind hooks. They are accepted input to the renderer, which installs anchors, placeholders, and swap logic that cooperate with Suspense boundaries and memory management. This eliminates much of the incidental complexity that VDOM diffing must shoulder around async.

---

## 3. Async Components as First-Class Rendering Primitives

Sinwan accepts `Promise<SinwanNode>` anywhere a node is expected. The client renderer recognizes promises and creates an explicit async block with start/end anchors and a placeholder:

```ts
// src/renderer/render-children.ts (excerpt)
if (node instanceof Promise) {
  const startAnchor = domOps.createComment("Sinwan-a");
  const endAnchor = domOps.createComment("/Sinwan-a");
  const placeholder = domOps.createTextNode("");
  insertNode(parent, startAnchor, anchor);
  insertNode(parent, placeholder, anchor);
  insertNode(parent, endAnchor, anchor);

  const mounted: MountedAsync = {
    type: "async",
    startAnchor,
    endAnchor,
    placeholder,
    children: [],
    disposed: false,
  };

  const owner = getCurrentInstance();

  node.then((resolved) => {
    if (mounted.disposed) return; // disposal protection
    const resolvedNode = renderNodeToDOM(
      resolved,
      parent,
      endAnchor,
      namespace,
    );
    mounted.children = [resolvedNode];
    domOps.remove(placeholder); // swap
    if (owner) fireMountedHooks(owner);
    queueUpdatedHooks(owner);
  });
  return mounted;
}
```

At the application root, `mount()` also handles async components without synthetic “loading” state in userland:

```ts
// src/renderer/mount.ts (excerpt)
if (result instanceof Promise) {
  const placeholder = domOps.createTextNode("");
  domOps.appendChild(container, placeholder);
  root = { type: "text", node: placeholder };
  const rootRef: { current: MountedNode } = { current: root };

  result.then(
    (resolved) => {
      container.innerHTML = "";
      setCurrentInstance(instance);
      rootRef.current = renderElementToDOM(resolved, container);
      setCurrentInstance(null);
      instance.element = rootRef.current;
      fireMountedHooks(instance);
    },
    (err) => {
      container.innerHTML = "";
      handleComponentError(instance, err as Error);
    },
  );
  // returns AppInstance with unmount() that marks async nodes disposed
}
```

This differs from hook-based async models in two ways:

- The renderer owns the lifecycle of async placeholders and swaps. There is an explicit `disposed` flag on `MountedAsync`, and the unmount path sets it to prevent post-unmount insertion. This is a correctness property, not a convention.
- Suspense is implemented as a renderer boundary that intercepts thrown promises and schedules a retry when they resolve, instead of re-rendering a whole component tree speculatively.

Implications for streaming and concurrency:

- On the server, `renderToString()` and hydratable rendering recognize promises and can sequence output without warping the component model. Async is payload-driven, not re-render-driven.
- In the client, async swaps are bounded by anchors, so partial tree availability and concurrent chunks are tractable without diffing.

---

## 4. DOM Architecture

Sinwan’s DOM renderer is explicit about what is inserted, where, and how it is later updated or removed. There is no implicit reconciliation; everything is bounded by anchors and effects.

- Intrinsic elements are created and wired once:

```ts
// src/renderer/render-element.ts (excerpt)
const el = namespace
  ? domOps.createElementNS(namespace, tag)
  : domOps.createElement(tag);

const attrDisposers = applyAttributes(el, props); // per-attr reactive effects
const eventCleanups = bindEvents(el, props); // direct listeners

if (!VOID_ELEMENTS.has(tag)) {
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;
  if (dangerous && typeof dangerous.__html === "string") {
    (el as HTMLElement).innerHTML = dangerous.__html;
  } else {
    if ((el as HTMLElement).innerHTML !== "")
      (el as HTMLElement).innerHTML = "";
    mountedChildren = renderChildrenToDOM(
      children,
      el,
      getChildNamespace(tag, namespace),
    );
  }
}
```

- Reactive blocks use comment anchors to delimit swappable content. When a dependent signal changes, the previous mounted subtree is removed and the new one is inserted between the anchors:

```ts
// src/renderer/render-children.ts (excerpt)
function renderReactiveNodeToDOM(
  reactive,
  parent,
  anchor,
  namespace,
): MountedNode {
  const startAnchor = domOps.createComment("Sinwan-r");
  const endAnchor = domOps.createComment("/Sinwan-r");
  insertNode(parent, startAnchor, anchor);
  insertNode(parent, endAnchor, anchor);
  // ...
  block.dispose = effect(() => {
    if (mountedContent) removeMountedNode(mountedContent); // cleanup
    const value = resolve(reactive);
    mountedContent = renderNodeToDOM(
      value as SinwanNode,
      parent,
      endAnchor,
      namespace,
    );
    block.children = [mountedContent];
    if (initialized) {
      if (owner) fireMountedHooks(owner);
      queueUpdatedHooks(owner);
    }
    initialized = true;
  });
  return block;
}
```

- Control-flow primitives (Show, For, Switch, Index, Key, Dynamic, Portal, Suspense, Activity, ViewTransition, ErrorBoundary) are tagged (`Symbol.for("Sinwan.X")`) and rendered by specialized block renderers in `render-control-flow.ts`. They all install block anchors (`"Sinwan-b"`/`"/Sinwan-b"`) and then manage children within those bounds.

- Keyed list reconciliation is surgical. Items are tracked in a map by key; existing DOM nodes are moved before the block’s end anchor instead of being recreated:

```ts
// src/renderer/render-control-flow.ts (excerpt)
const oldByKey = new Map<unknown, ForRecord<T>>();
for (const record of records) oldByKey.set(record.key, record);
// ... for each next item
if (old && old.item === item) {
  old.index = index;
  moveBeforeEnd(parent, old.mounted, block.endAnchor); // DOM preservation
  nextRecords.push(old);
  oldByKey.delete(key);
  return;
}
// ...remove stale, render new, then
block.children = nextRecords.map((r) => r.mounted);
```

- Unmounting is precise and leak-averse. Every mounted node type knows how to dispose its effects, events, and refs, then recursively descends:

```ts
// src/renderer/unmount.ts (excerpt)
export function unmountNode(node: MountedNode): void {
  switch (node.type) {
    case "element":
      for (const d of node.attrDisposers) d();
      for (const c of node.eventCleanups) c();
      node.refCleanup?.();
      for (const child of node.children) unmountNode(child);
      break;
    case "reactive-block":
      node.dispose();
      for (const child of node.children) unmountNode(child);
      break;
    case "async":
      node.disposed = true; // prevents late insert
      for (const child of node.children) unmountNode(child);
      break;
    // ...others elided
  }
}
```

Batching strategy and lifecycle:

- Attribute and text effects call `queueUpdatedHooks(owner)` on subsequent runs, which defers `onUpdated` callbacks to the next reactive flush (microtask), deduplicated per instance.
- `fireMountedHooks` is bottom‑up (children first), ensuring effects and DOM are stabilized before parent post-mount work.

---

## 5. Reactivity System

Sinwan’s reactivity is classical but deliberate: signals track dependencies, effects are scheduled (not run synchronously on write), and computeds are lazily evaluated.

- Signals: reads track, writes trigger. They also support push-style manual subscriptions (for interop):

```ts
// src/reactivity/signal.ts (excerpt)
get value(): T { track(this); return this._value; }
set value(newValue: T) {
  if (Object.is(this._value, newValue)) return;
  this._value = newValue;
  trigger(this);                 // schedule subscribers
  for (const fn of this._manualSubs) fn(newValue);
}
```

- Effects: `ReactiveEffect` stores the user cleanup, the dep set, and a `notify()` that delegates to the scheduler:

```ts
// src/reactivity/effect.ts (excerpt)
export class ReactiveEffect implements EffectNode {
  run(): void {
    if (!this.active) return;
    if (effectStack.includes(this)) return; // prevent re-entry
    this.cleanupDeps();
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    effectStack.push(this);
    const prev = activeEffect;
    activeEffect = this;
    try {
      const result = this.fn();
      if (typeof result === "function") this.cleanup = result;
    } finally {
      activeEffect = prev;
      effectStack.pop();
    }
  }
  notify(): void {
    scheduleEffect(this);
  }
  dispose(): void {
    /* run cleanup, clear deps, unschedule */
  }
}
```

- Scheduler: microtask-based, effect-queue sorted parent-before-child (by id), convergence loop for effects scheduled during flush, and `nextTick` for post-flush callbacks:

```ts
// src/reactivity/scheduler.ts (excerpt)
export function scheduleEffect(effect: EffectNode): void {
  if (!effect.active) return;
  pendingEffects.add(effect);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}
function flush(): void {
  isFlushing = true;
  let sorted =
    pendingEffects.size <= 1
      ? [...pendingEffects]
      : [...pendingEffects].sort((a, b) => a.id - b.id);
  pendingEffects.clear();
  for (const e of sorted)
    if (e.active) {
      try {
        e.run();
      } catch (err) {
        /* log */
      }
    }
  // drain newly queued effects up to safety limit
  // ...
  flushScheduled = false;
  isFlushing = false;
  const cbs = pendingCallbacks.splice(0);
  for (const cb of cbs) cb();
}
```

- Computed: lazily recomputes and short-circuits scheduler participation by overriding the internal effect’s `notify()` to mark dirty and trigger downstream subscribers:

```ts
// src/reactivity/computed.ts (excerpt)
this._effect = new ReactiveEffect(() => {
  self._value = getter();
});
this._effect.notify = function () {
  if (!self._dirty) {
    self._dirty = true;
    trigger(self);
  }
};
```

- Normalization: DOM renderer treats signals, computeds, and 0‑arity getters uniformly. This is why `SinwanNode` includes `(() => unknown)` and why attributes accept `Reactive<T>`.

- Batching: `batch(fn)` suppresses intermediate microtasks and forces a synchronous flush at scope exit via `flushSync()`. This is for deterministic update compaction without opting into synchronous effects globally.

Comparison with SolidJS signals: The fundamental graph semantics are similar (fine-grained signals, lazy memos, scheduled effects). The key difference is that Sinwan integrates async nodes and control-flow boundaries into the core renderer and lifecycle model (anchors + boundary stacks), shaping scheduling and cleanup around those primitives. This reduces the need for userland conventions for async.

Performance implications: No VDOM diffing, minimal object churn (effects and small mounted descriptors), strict cleanup discipline, and microtask scheduling that naturally batches bursts of changes with predictable `nextTick` points.

---

## 6. Lifecycle System

Lifecycle is instance-scoped and explicit. There is a globally shared current instance slot keyed by `Symbol.for("sinwan.currentInstance")` to bridge across multiple bundles.

- Instances capture hooks and own effects:

```ts
// src/component/instance.ts (excerpt)
export function ccInstance(component, props, parent) {
  return {
    uid: uidCounter++,
    component,
    props,
    element: null,
    parent,
    children: [],
    effects: [],
    _mountedHooks: [],
    _unmountedHooks: [],
    _updatedHooks: [],
    _disposeHooks: [],
    _hydratedHooks: [],
    _errorHooks: [],
    provides: parent ? Object.create(parent.provides) : Object.create(null),
    identifierPrefix: parent?.identifierPrefix ?? "",
    isMounted: false,
    isUnmounted: false,
  };
}
```

- Hooks are batched and fired with well-defined ordering:

```ts
// src/component/lifecycle.ts (excerpt)
export function onMounted(fn: () => void) {
  instance._mountedHooks.push(() => withInstance(instance, fn));
}
export function onUpdated(fn: () => void) {
  instance._updatedHooks.push(() => withInstance(instance, fn));
}
export function onUnmounted(fn: () => void) {
  instance._unmountedHooks.push(() => withInstance(instance, fn));
}
```

- Updated hooks run once per flush, deduplicated:

```ts
// src/component/instance.ts (excerpt)
const queuedUpdatedHooks = new Set<ComponentInstance>();
export function queueUpdatedHooks(instance: ComponentInstance | null): void {
  if (
    !instance ||
    !instance.isMounted ||
    instance.isUnmounted ||
    instance._updatedHooks.length === 0 ||
    queuedUpdatedHooks.has(instance)
  )
    return;
  queuedUpdatedHooks.add(instance);
  nextTick(() => {
    queuedUpdatedHooks.delete(instance);
    if (instance.isMounted && !instance.isUnmounted) {
      fireUpdatedHooks(instance);
    }
  });
}
```

- Activity boundaries enable “soft-hide”: dispose effects and fire `onDispose`, but preserve the DOM and instance so it can be soft-shown later (hooks re-register by re-running setup with slot reuse).

Async lifecycle synchronization: Because effects are scheduled by a microtask queue and updated hooks are queued post-flush, user code sees deterministic mount → (reactive updates) → updated ordering, including when async blocks resolve.

---

## 7. Error Handling Philosophy

Sinwan isolates component failures via explicit error boundaries and an instance-walking error handler.

- Errors propagate up the instance chain until an `_errorHooks` handler is found; otherwise they are logged and the renderer inserts a benign placeholder to keep anchors consistent.

- Suspense turns thrown promises into control flow rather than fatal errors. Within `renderComponentToDOM`, promises thrown during child rendering are registered on the active Suspense boundary instead of crashing the render. The boundary then coordinates fallback rendering and retries:

```ts
// src/renderer/suspense-boundary.ts and render-control-flow.ts (excerpt)
const boundary = {
  promises: new Set<PromiseLike<unknown>>(),
  onResolved: () => {},
};
pushSuspenseBoundary(boundary);
try {
  // render children; thrown promises bubble to this boundary
} catch (err) {
  if (typeof (err as any).then === "function") {
    boundary.promises.add(err as PromiseLike<unknown>);
    // show fallback; schedule retry via microtask on resolution
  } else {
    throw err;
  }
}
for (const promise of boundary.promises) {
  promise.then(() => boundary.onResolved());
}
boundary.promises.clear();
```

Runtime resilience: Error paths always preserve anchors and placeholders. That means the DOM shape observed by siblings/parents remains valid, and future retries have a coherent insertion point.

---

## 8. Performance Philosophy

- DOM-first rendering: No VDOM diff tree is built or reconciled. Effects update exactly the nodes that depend on changed state. Intrinsics are created once; attributes are updated individually.

- Avoiding VDOM overhead: Reactive attributes, fragments, and blocks keep node allocation and garbage generation low. Movement uses `insertBefore` across collected node spans.

- Async scheduling: The microtask scheduler naturally batches multiple signal writes. `batch()` groups multi-signal updates into a single pass when determinism is needed.

- Memory efficiency: Every mounted descriptor contains only what is needed for its cleanup. `unmountNode()` centralizes discipline for events, attrs, refs, reactive-blocks, component effects, async disposal, and portals.

- Mount/update costs: Component setup runs once; updates are effects re-running targeted DOM work. This eliminates the cost of re-running component functions and building throwaway VDOMs under load.

- Scalability: Anchors bound subtrees, enabling localized updates even in very large trees. Suspense and portals compose without global coordination.

Direct event binding: Sinwan binds handlers directly to elements, not delegated on the document, simplifying hydration and tracing:

```ts
// src/renderer/events.ts (excerpt)
export function bindEvent(
  el: Element,
  eventName: string,
  handler: EventListener,
): CleanupFn {
  domOps.addEventListener(el, eventName, handler);
  return () => domOps.removeEventListener(el, eventName, handler);
}
```

---

## 9. Comparison with Other Frameworks

- React (Fiber + VDOM):
  - React’s mental model is component re-render → diff → commit. Async is largely modeled via hooks (e.g., Suspense with thrown promises, concurrent rendering heuristics) layered on top of Fiber scheduling, with reconciliation of virtual trees.
  - Sinwan runs component setup once, registers effects, and commits DOM changes driven by signals and promises. No VDOM diff. Suspense and async are boundary-first and anchor-bounded. The “commit phase” is literal DOM operations orchestrated by effects.
  - React’s `useEffect` runs after render; Sinwan’s React bridge maps no-deps effects to `onMounted` + `onUpdated` and deps-based effects to reactive effects, scheduled via microtasks.

- SolidJS:
  - Similar fine-grained reactive graph. Solid also avoids VDOM and commits DOM directly.
  - Sinwan diverges by integrating Promise-based nodes and control-flow into the renderer as a core primitive (MountedAsync, Suspense boundary stack), and by exposing a DOM-anchored reconciliation strategy for control-flow blocks.

- Vue 3:
  - Shares a microtask scheduler with `nextTick`, effect tracking, and computed lazy evaluation. Vue uses VDOM in the template compiler path; Sinwan does not. Sinwan’s list reconciliation in `For` is explicit DOM move logic instead of VDOM diff keyed patches.

- Svelte:
  - Compiler-first, turning components into imperative DOM instructions, minimizing runtime. Sinwan is runtime-first with explicit signals/effects and anchors. The cost tradeoff: Sinwan carries a tiny reactive runtime and block renderer; in exchange it gains promise-native rendering and uniform control-flow semantics.

- Qwik:
  - Resumability shifts work from hydration to lazy-resume of serialized listeners/state. Sinwan instead implements hydratable markers and islands for partial hydration, and an Activity soft-hide/show model. Both target interactivity at scale; Sinwan emphasizes anchor-bounded DOM updating and microtask effects rather than event-driven resumption.

---

## 10. Future Potential

The current architecture directly enables:

- Streaming SSR: The server renderer already accepts promises and can sequence output around them. Hydration markers (`data-sinwan-id`, text markers, event indices) make client hydration precise without rebuilding VDOM.

- Suspense boundaries: Implemented as block renderers with a boundary stack; compatible with server/client parity.

- Partial hydration and islands: `island()` wraps components with name + props JSON, resets hydration indices per-island, and supports `hydrate()` entry on the client for that subtree only.

- Concurrent rendering: Because anchors bound updates and effects are scheduled, concurrent chunking becomes an orchestration problem, not an architectural rewrite. The boundary stack pattern used for Suspense generalizes to other resource gates.

- Fine-grained async scheduling: The scheduler can be extended with priorities or cooperative yielding without changing the component model.

---

## 11. Architectural Tradeoffs

- Complexity of anchors and boundaries: Managing start/end anchors, disposal, and block-local reconciliation is more explicit than VDOM diffing, which can hide these details. The benefit is predictable DOM behavior; the cost is careful invariants.

- Async waterfalls: Promise-native rendering does not prevent waterfalls by itself; it simply makes asynchrony explicit in the renderer. Boundaries (Suspense, islands) and data-fetch orchestration are still design responsibilities.

- Reconciliation challenges: In `For`, mis-specified keys can cause unnecessary DOM churn. The code explicitly removes/moves nodes; this is powerful but sharp. Correct keys are critical.

- Memory risks: If custom block renderers fail to dispose effects or event handlers, leaks can occur. Sinwan centralizes cleanup in `unmountNode()` and instance teardown, but invariants must be respected across integrations.

- Debugging difficulty: Microtask batching and effect graphs can be non-intuitive compared to step-by-step re-renders. `nextTick` and lifecycle ordering help, but tooling (devtools, effect tracing) is essential.

- Scheduling overhead: Deferring effects to microtasks adds latency vs synchronous writes. Sinwan opts into determinism and batching; `batch()`/`flushSync()` are provided for tight loops.

- Developer ergonomics: Signals in attributes and reactive getters are powerful but require mental models different from React’s prop-value snapshots. The React bridge smooths this but doesn’t change core semantics.

---

## 12. Conclusion

Sinwan is a bet: that a DOM-first, promise-native, fine-grained runtime can confront the hard parts of modern UI-async, streaming, partial hydration, concurrency by elevating them into the renderer rather than hiding them behind a VDOM and re-render semantics. The architecture favors explicitness: anchors over diffs, scheduled effects over implicit re-renders, boundaries over global heuristics.

This is not merely a library. It is an argument that the commit should be the DOM, that asynchrony should be modeled where it manifests (in the renderer), and that reactive graphs can give us the granularity the web demands without paying the VDOM tax. The code reflects this thesis: promises and signals are accepted at the type level (`SinwanNode`), anchors are the unit of reconciliation, and lifecycle is synchronized to the scheduler.

The path forward is clear: enrich the scheduler (priorities, spans), push streaming SSR and selective hydration further (islands + markers), and deepen the toolchain (profiling, effect graph introspection). The next frontier isn’t more layers of abstraction; it’s exposing the right ones anchors, effects, and boundaries to build reliable, concurrent, and streamable interfaces.
