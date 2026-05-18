# API Reference

Alphabetical list of every public export from Sinwan's subpaths. Each entry links to the page where it’s explained in detail.

> **Subpath legend**
>
> - `sinwan/component` — component factory, control flow, lifecycle hooks, provide/inject, islands, and core types.
> - `sinwan/reactivity` — signals, computeds, effects, batching, and reactive primitives.
> - `sinwan/renderer` — client renderer (`mount`, `render`), DOM operations, and event helpers.
> - `sinwan/hydration` — hydration and hydration-marker utilities.
> - `sinwan/server` — server-side rendering, streaming, page registry, and hydration markers.
> - `sinwan/hook` — reactive utility hooks such as `useFetch` and `createFetch`.
> - `sinwan/store` — fine-grained reactive stores.
> - `sinwan/jsx-runtime` — JSX production runtime (auto-imported by TS).
> - `sinwan/jsx-dev-runtime` — JSX dev runtime.
> - `sinwan/react-server`, `sinwan/react-client`, `sinwan/react-shared`, `sinwan/react-static` — React interop layers.

---

## Reactivity

### `batch(fn)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function batch(fn: () => void): void;
```

Run `fn` and synchronously flush all queued effects when the outermost `batch` exits. See [`03-reactivity.md`](./03-reactivity.md#batchfn).

### `computed(getter)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function computed<T>(getter: () => T): Computed<T>;
```

Create a lazily-evaluated, cached derived value. See [`03-reactivity.md`](./03-reactivity.md#computedtgetter).

### `effect(fn)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
type CleanupFn = () => void;
type EffectFn = () => CleanupFn | void;
function effect(fn: EffectFn): CleanupFn;
```

Run a side-effect that re-runs when any tracked dep changes. Returns a dispose function. See [`03-reactivity.md`](./03-reactivity.md#effectfn).

### `isComputed(value)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function isComputed(value: unknown): value is Computed<unknown>;
```

Type guard for `Computed<T>`.

### `isSignal(value)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function isSignal(value: unknown): value is Signal<unknown>;
```

Type guard for `Signal<T>`.

### `isReactive(value)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function isReactive(value: unknown): boolean;
```

Type guard that returns `true` if the value is a `Signal`, `Computed`, or a `Function` (getter).

### `resolve(value)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function resolve<T>(value: Reactive<T> | T): T;
```

Extracts the current value from a reactive input. If the input is a signal or computed, it returns `.value`. If it is a function, it calls it. Otherwise, it returns the value as-is.

### `nextTick(fn?)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function nextTick(fn?: () => void): Promise<void>;
```

Promise that resolves after the next reactive flush. See [`03-reactivity.md`](./03-reactivity.md#nexttickfn).

### `signal(initial)` &nbsp;·&nbsp; _sinwan/reactivity_

```ts
function signal<T>(initial: T): Signal<T>;
```

Create a reactive cell. See [`03-reactivity.md`](./03-reactivity.md#signaltinitial).

---

## Components

### `cc<P>(setup)` &nbsp;·&nbsp; _sinwan/component_

```ts
function cc<P extends object = {}>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => RenderResult,
): SinwanComponent<P>;
```

See [`04-components.md`](./04-components.md#ccpsetup).

### `Show(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Show<T>(props: {
  when: Reactive<T | false | null | undefined>;
  fallback?: SinwanNode;
  children: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}): SinwanElement;
```

Reactive conditional rendering. See [`04-components.md`](./04-components.md#conditionals).

### `For(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function For<T>(props: {
  each: Reactive<readonly T[]>;
  key?: (item: T, index: number) => string | number | symbol;
  fallback?: SinwanNode;
  children: (item: T, index: () => number) => SinwanNode;
}): SinwanElement;
```

Reactive keyed list rendering. See [`04-components.md`](./04-components.md#lists).

### `Switch(props)` / `Match(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Switch(props: {
  fallback?: SinwanNode;
  children?: SinwanNode | SinwanNode[];
}): SinwanElement;

function Match<T>(props: {
  when: Reactive<T | false | null | undefined>;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}): SinwanElement;
```

Reactive multi-branch conditional rendering. See [`04-components.md`](./04-components.md#conditionals).

### `Index(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Index<T>(props: {
  each: Reactive<readonly T[]>;
  fallback?: SinwanNode;
  children: (item: () => T, index: number) => SinwanNode;
}): SinwanElement;
```

Index-stable list rendering for arrays whose order is stable. See [`04-components.md`](./04-components.md#lists).

### `Key(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Key<T>(props: {
  when: Reactive<T>;
  children?: SinwanNode | ((value: T) => SinwanNode);
}): SinwanElement;
```

Remounts its subtree when `when` changes.

### `Dynamic(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Dynamic<P extends object>(
  props: P & {
    component: Reactive<string | SinwanComponent<P> | null | undefined>;
    children?: SinwanNode;
  },
): SinwanElement;
```

Renders a dynamic intrinsic tag or Sinwan component.

### `Visible(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Visible(props: {
  when: Reactive<unknown>;
  as?: string;
  style?: Reactive<Record<string, string | number | null | undefined> | string>;
  children?: SinwanNode;
  [key: string]: unknown;
}): SinwanElement;
```

Toggles CSS display without unmounting children.

### `Portal(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Portal(props: {
  mount?: Reactive<Node | string | (() => Node | null) | null | undefined>;
  children?: SinwanNode;
}): SinwanElement;
```

Renders children into another DOM target. Defaults to `document.body` on the client.

### `Virtual(props)` &nbsp;·&nbsp; _sinwan/component_

```ts
function Virtual<T>(props: {
  each: Reactive<readonly T[]>;
  key?: (item: T, index: number) => string | number | symbol;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  fallback?: SinwanNode;
  children: (item: T, index: () => number) => SinwanNode;
}): SinwanElement;
```

Virtualized list rendering — mounts only the visible slice of a large array inside a scrollable container. See [`04-components.md`](./04-components.md#virtual-scrolling).

---

## Hooks (`sinwan/hook`)

### `useFetch(url, options?)`

```ts
function useFetch<T>(
  url: MaybeReactive<string>,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;

function useFetch<T>(
  url: MaybeReactive<string>,
  useFetchOptions: UseFetchOptions,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;

function useFetch<T>(
  url: MaybeReactive<string>,
  options: RequestInit,
  useFetchOptions?: UseFetchOptions,
): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
```

Reactive fetch helper with signals for `data`, `error`, `response`, `statusCode`, loading state, aborting, refetching, and response parsing. See [`29-use-fetch.md`](./29-use-fetch.md).

### `createFetch(config?)`

```ts
function createFetch(config?: CreateFetchOptions): typeof useFetch;
```

Create a preconfigured `useFetch` factory with `baseUrl`, default request options, default hook options, and callback combination behavior. See [`29-use-fetch.md`](./29-use-fetch.md#createfetch).

### Hook types

```ts
type Fn = () => void;
type MaybeReactive<T> = T | Signal<T> | Computed<T> | (() => T);
type EventHookOn<T = unknown> = (fn: (param: T) => void) => Fn;
type Stoppable = { stop: Fn; start: Fn; isPending: Signal<boolean> };
```

```ts
interface UseFetchOptions {
  fetch?: typeof globalThis.fetch;
  immediate?: boolean;
  refetch?: MaybeReactive<boolean>;
  initialData?: any;
  timeout?: number;
  updateDataOnError?: boolean;
  beforeFetch?: (
    ctx: BeforeFetchContext,
  ) =>
    | Promise<Partial<BeforeFetchContext> | void>
    | Partial<BeforeFetchContext>
    | void;
  afterFetch?: (
    ctx: AfterFetchContext,
  ) => Promise<Partial<AfterFetchContext>> | Partial<AfterFetchContext>;
  onFetchError?: (
    ctx: OnFetchErrorContext,
  ) => Promise<Partial<OnFetchErrorContext>> | Partial<OnFetchErrorContext>;
}

interface CreateFetchOptions {
  baseUrl?: MaybeReactive<string>;
  combination?: "overwrite" | "chain";
  options?: UseFetchOptions;
  fetchOptions?: RequestInit;
}
```

Full return type and callback context details are documented in [`29-use-fetch.md`](./29-use-fetch.md#type-reference).

---

## Lifecycle

All four must be registered while a component instance is active: during component setup, or synchronously from another lifecycle hook owned by that component.

### `onMounted(fn)` &nbsp;·&nbsp; _sinwan/component_

```ts
function onMounted(fn: () => void): void;
```

### `onUnmounted(fn)` &nbsp;·&nbsp; _sinwan/component_

```ts
function onUnmounted(fn: () => void): void;
```

### `onUpdated(fn)` &nbsp;·&nbsp; _sinwan/component_

```ts
function onUpdated(fn: () => void): void;
```

Fires after renderer-owned reactive text, reactive attribute, `<Show>`, or `<For>` updates. Hooks are deduped per scheduler flush and skipped on initial render.

### `onError(fn)` &nbsp;·&nbsp; _sinwan/component_

```ts
function onError(fn: (err: Error) => void): void;
```

See [`05-lifecycle.md`](./05-lifecycle.md).

---

## Provide / Inject

### `provide(key, value)` &nbsp;·&nbsp; _sinwan/component_

```ts
function provide<T>(key: string | symbol, value: T): void;
```

### `inject(key, defaultValue?)` &nbsp;·&nbsp; _sinwan/component_

```ts
function inject<T>(key: string | symbol, defaultValue?: T): T;
```

### `getCurrentInstance()` &nbsp;·&nbsp; _sinwan/component_

```ts
function getCurrentInstance(): ComponentInstance | null;
```

Returns the active component instance during setup or a synchronous lifecycle callback. See [`05-lifecycle.md`](./05-lifecycle.md#getcurrentinstance) and [`06-provide-inject.md`](./06-provide-inject.md).

---

## JSX runtime

### `Fragment` &nbsp;·&nbsp; _sinwan/jsx-runtime_, _sinwan/jsx-dev-runtime_

A `unique symbol` used as the `tag` for fragment elements. Compiles from `<>...</>`.

### `jsx(type, props, key?)` &nbsp;·&nbsp; _sinwan/jsx-runtime_

```ts
function jsx(type: any, props: any, key?: any): SinwanElement;
```

### `jsxs(type, props, key?)` &nbsp;·&nbsp; _sinwan/jsx-runtime_

```ts
function jsxs(type: any, props: any, key?: any): SinwanElement;
```

### `jsxDEV(type, props, key, isStatic, source?, self?)` &nbsp;·&nbsp; _sinwan/jsx-dev-runtime_

```ts
interface JSXSource {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}
function jsxDEV(
  type: any,
  props: any,
  key: any,
  isStaticChildren: boolean,
  source?: JSXSource,
  self?: unknown,
): SinwanElement;
```

### `raw(html)` &nbsp;·&nbsp; _sinwan/component_

```ts
function raw(html: string): HtmlEscapedString;
```

Mark an HTML string as already-escaped/trusted. Alias of `safeHtml`. See [`11-escaping.md`](./11-escaping.md).

### `HtmlEscapedString` &nbsp;·&nbsp; _sinwan/component_

```ts
class HtmlEscapedString extends String {
  readonly value: string;
  toString(): string;
}
```

Token type recognised by all renderers as “trust this string”.

---

## HTML escaping

### `escapeHtml(value)` &nbsp;·&nbsp; _sinwan/component_

```ts
function escapeHtml(value: unknown): string;
```

### `safeHtml(html)` &nbsp;·&nbsp; _sinwan/component_

```ts
function safeHtml(html: string): HtmlEscapedString;
```

Alias of `raw`.

### `isSafeHtml(value)` &nbsp;·&nbsp; _sinwan/component_

```ts
function isSafeHtml(value: unknown): value is HtmlEscapedString;
```

See [`11-escaping.md`](./11-escaping.md).

---

## Client renderer

### `mount(component, container, props?)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function mount(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
): AppInstance;
```

### `render(node, container)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function render(node: SinwanNode, container: Element): AppInstance;
```

### `unmountNode(node)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function unmountNode(node: MountedNode): void;
```

### `renderNodeToDOM(node, parent, anchor?)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function renderNodeToDOM(
  node: SinwanNode,
  parent: Node,
  anchor?: Node | null,
): MountedNode;
```

Low-level — append a single node to a parent. Mostly used internally.

### `renderElementToDOM(element, parent, anchor?)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function renderElementToDOM(
  element: SinwanElement,
  parent: Node,
  anchor?: Node | null,
): MountedNode;
```

Low-level — append an element to a parent.

### `applyAttributes(el, props)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function applyAttributes(
  el: Element,
  props: Record<string, unknown>,
): CleanupFn[];
```

Apply non-event props to a DOM element. Returns disposers for any reactive attributes.

### `bindEvent(el, event, handler)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function bindEvent(
  el: Element,
  event: string,
  handler: EventListener,
): CleanupFn;
```

### `bindEvents(el, props)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function bindEvents(el: Element, props: Record<string, unknown>): CleanupFn[];
```

### `isEventProp(key)` / `toEventName(key)` &nbsp;·&nbsp; _sinwan/renderer_

```ts
function isEventProp(key: string): boolean;
function toEventName(key: string): string; // "onClick" → "click"
```

### `domOps` &nbsp;·&nbsp; _sinwan/renderer_

```ts
const domOps: DOMOps;
function setDOMOps(overrides: Partial<DOMOps>): void;
function resetDOMOps(): void;
```

The default DOM-operations object used by the client renderer. See [`08-renderer.md`](./08-renderer.md#domops).

---

## Hydration

### `hydrate(component, container, props?)` &nbsp;·&nbsp; _sinwan/hydration_

```ts
function hydrate(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
): AppInstance;
```

See [`10-hydration.md`](./10-hydration.md).

### Marker constants & helpers &nbsp;·&nbsp; _sinwan/hydration_ (advanced)

```ts
const COMP_ID_ATTR: "data-sinwan-id";
const COMP_ID_PREFIX: "c";
const TEXT_MARKER_OPEN: "sinwan-t:";
const TEXT_MARKER_CLOSE: "/sinwan-t";
const EVENT_ATTR: "data-sinwan-ev";

function compId(index: number): string;
function textMarkerOpen(index: number): string;
function textMarkerCloseStr(): string;
function eventAttrValue(event: string, index: number): string;

function parseTextOpenMarker(node: Comment): number;
function isTextCloseMarker(node: Comment): boolean;
function parseEventAttr(value: string): [string, number][];
function parseCompId(value: string): number;
```

---

## Server (`sinwan/server`)

### `renderToString(node)`

```ts
function renderToString(node: SinwanNode): Promise<string>;
```

### `renderPage(name, data)`

```ts
function renderPage<D extends object = {}>(
  name: string,
  data: D,
): Promise<string>;
```

### `registerPage(name, page)`

```ts
function registerPage<D extends object = {}>(
  name: string,
  page: SinwanComponent<D>,
): void;
```

### `getPage(name)`

```ts
function getPage<D extends object = {}>(
  name: string,
): SinwanComponent<D> | undefined;
```

### `hasPage(name)`

```ts
function hasPage(name: string): boolean;
```

### `streamPage(page, data)`

```ts
function streamPage<D extends object = {}>(
  page: SinwanComponent<D>,
  data: D,
): ReadableStream<Uint8Array>;
```

### `streamHydratablePage(component, props?)`

```ts
function streamHydratablePage(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
): ReadableStream<Uint8Array>;
```

### `streamHydratableNode(node)`

```ts
function streamHydratableNode(node: SinwanNode): ReadableStream<Uint8Array>;
```

### `renderToHydratableString(component, props?)`

```ts
function renderToHydratableString<P extends object = {}>(
  component: SinwanComponent<P>,
  props?: P,
): Promise<string>;
```

### `renderNodeToHydratableString(node)`

```ts
function renderNodeToHydratableString(node: SinwanNode): Promise<string>;
```

### `isSlots(children)`

```ts
function isSlots(children: unknown): children is SinwanSlots;
```

See [`09-ssr.md`](./09-ssr.md) and [`10-hydration.md`](./10-hydration.md).

---

## Public types

| Name                                                                                                                                                            | Subpath             | Purpose                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------ |
| `SinwanNode`, `SinwanElement`, `SinwanPrimitive`                                                                                                                | `sinwan/component`  | Element model            |
| `SinwanComponent<P>`                                                                                                                                            | `sinwan/component`  | Component shape          |
| `SinwanSlots`                                                                                                                                                   | `sinwan/component`  | Composition helpers      |
| `RenderResult`                                                                                                                                                  | `sinwan/component`  | Composition helpers      |
| `PropsWithChildren<P>` / `PropsWithSlots<P>`                                                                                                                    | `sinwan/component`  | Sugar                    |
| `Reactive<T>`                                                                                                                                                   | `sinwan/component`  | Plain-or-reactive values |
| `ShowProps<T>`, `ForProps<T>`, `SwitchProps`, `MatchProps<T>`, `IndexProps<T>`, `KeyProps<T>`, `DynamicProps`, `VisibleProps`, `PortalProps`, `VirtualProps<T>` | `sinwan/component`  | Control flow             |
| `Signal<T>`, `Computed<T>`                                                                                                                                      | `sinwan/reactivity` | Reactive primitives      |
| `CleanupFn`, `EffectFn`                                                                                                                                         | `sinwan/reactivity` | Effect contract          |
| `ComponentInstance`                                                                                                                                             | `sinwan/component`  | Runtime record           |
| `InjectionKey<T>`                                                                                                                                               | `sinwan/component`  | DI key                   |
| `MountedNode`, `MountedText`, `MountedReactiveText`, `MountedElement`, `MountedFragment`, `MountedReactiveBlock`, `MountedComponent`, `MountedPortal`           | `sinwan/renderer`   | Renderer descriptors     |
| `AppInstance`                                                                                                                                                   | `sinwan/renderer`   | Mount/hydrate handle     |
| `DOMOps`                                                                                                                                                        | `sinwan/renderer`   | DOM abstraction          |
| `HydrationCursor`                                                                                                                                               | `sinwan/hydration`  | DOM walker state         |
| `HtmlEscapedString`                                                                                                                                             | `sinwan/component`  | Trust marker for HTML    |

Full type definitions in [`16-types.md`](./16-types.md).
