# Type Definitions

Every public TypeScript type Sinwan exports, with explanations and where they’re used.

---

## Core JSX types

### `SinwanPrimitive`

```ts
type SinwanPrimitive = string | number | boolean | null | undefined;
```

The set of values that can appear as a child without being wrapped in JSX. `boolean`/`null`/`undefined` render as nothing.

### `SinwanElement`

```ts
interface SinwanElement {
  tag: string | symbol | SinwanComponent<any>;
  props: Record<string, unknown>;
  children: SinwanNode[];
}
```

The plain object returned by every JSX expression. Renderers walk it to produce DOM nodes, HTML strings, or hydration descriptors.

### `SinwanNode`

```ts
type SinwanNode =
  | SinwanPrimitive
  | SinwanElement
  | Promise<SinwanNode>
  | HtmlEscapedString
  | Signal<unknown>
  | Computed<unknown>
  | SinwanNode[];
```

The recursive type accepted anywhere a child can appear (JSX children, props.children, top-level inputs to renderers).

### `Reactive<T>`

```ts
type Reactive<T> = T | Signal<T> | Computed<T>;
```

Used by JSX props and control-flow helpers where plain values and reactive containers are both accepted.

### `SinwanSlots`

```ts
type SinwanSlots = Record<string, SinwanNode>;
```

Named slots for advanced composition. See [`04-components.md`](./04-components.md#named-slots-advanced).

### `RenderResult`

```ts
type RenderResult = SinwanElement | Promise<SinwanElement>;
type RenderResult = SinwanNode | Promise<SinwanNode>;
```

What component / page setup functions are allowed to return.

### `PropsWithChildren<P>` / `PropsWithSlots<P>`

```ts
type PropsWithChildren<P = {}> = P & { children?: SinwanNode };
type PropsWithSlots<P = {}> = P & { children?: SinwanSlots };
```

Helpers when you don’t want to type `children` yourself.

---

## Components

### `SinwanComponent<P>`

```ts
interface SinwanComponent<P extends object = {}> {
  (
    props: P & { children?: SinwanNode | SinwanSlots },
  ): SinwanNode | Promise<SinwanNode>;
  _SinwanComponent?: true;
  _displayName?: string;
}
```

Returned by `cc` (cc). The function call signature is what JSX uses; the `_*` flags are framework metadata.

### `ShowProps<T>` / `ForProps<T>`

```ts
interface ShowProps<T> {
  when: Reactive<T | false | null | undefined>;
  fallback?: SinwanNode;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

interface ForProps<T> {
  each: Reactive<readonly T[]>;
  key?: (item: T, index: number) => string | number | symbol;
  fallback?: SinwanNode;
  children?: (item: T, index: () => number) => SinwanNode;
}

interface SwitchProps {
  fallback?: SinwanNode;
  children?: SinwanNode | SinwanNode[];
}

interface MatchProps<T> {
  when: Reactive<T | false | null | undefined>;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

interface IndexProps<T> {
  each: Reactive<readonly T[]>;
  fallback?: SinwanNode;
  children?: (item: () => T, index: number) => SinwanNode;
}

interface KeyProps<T> {
  when: Reactive<T>;
  children?: SinwanNode | ((value: T) => SinwanNode);
}
```

Props for the built-in reactive control-flow helpers.

---

## Reactivity

### `Signal<T>`

```ts
interface Signal<T> {
  value: T; // get/set, tracks/triggers
  peek(): T; // read without tracking
  subscribe(fn: (value: T) => void): () => void; // manual subscription
}
```

Returned by `signal(initial)`.

### `Computed<T>`

```ts
interface Computed<T> {
  readonly value: T; // lazy & cached
  peek(): T;
}
```

Returned by `computed(getter)`.

### `CleanupFn` / `EffectFn`

```ts
type CleanupFn = () => void;
type EffectFn = () => CleanupFn | void;
```

`effect(fn)`: `fn` is `EffectFn`; it returns a `CleanupFn`. The user-supplied effect may itself return a `CleanupFn` or `void`.

---

## Lifecycle / instance

### `ComponentInstance`

```ts
interface ComponentInstance {
  uid: number;
  component: SinwanComponent<any>;
  props: Record<string, any>;
  element: MountedNode | null;
  parent: ComponentInstance | null;
  children: ComponentInstance[];
  effects: CleanupFn[];

  _mountedHooks: (() => void)[];
  _unmountedHooks: (() => void)[];
  _updatedHooks: (() => void)[];
  _errorHooks: ((err: Error) => void)[];

  provides: Record<string | symbol, unknown>;

  isMounted: boolean;
  isUnmounted: boolean;
}
```

The runtime record for each component instance. Read-only for most app code; advanced users may push to `effects` to register custom dispose functions.

### `InjectionKey<T>`

```ts
type InjectionKey<T> = symbol & { __type?: T };
```

A typed `symbol` used as the key for `provide` / `inject`. The `__type` phantom is only for inference.

---

## Renderer / DOM

### `MountedNode` (tagged union)

```ts
type MountedNode =
  | MountedText
  | MountedReactiveText
  | MountedElement
  | MountedFragment
  | MountedReactiveBlock
  | MountedComponent;

interface MountedText {
  type: "text";
  node: Text;
}

interface MountedReactiveText {
  type: "reactive-text";
  node: Text;
  dispose: CleanupFn;
}

interface MountedElement {
  type: "element";
  node: Element;
  children: MountedNode[];
  eventCleanups: CleanupFn[];
  attrDisposers: CleanupFn[];
  refCleanup: CleanupFn | null;
}

interface MountedFragment {
  type: "fragment";
  children: MountedNode[];
  anchor?: Comment | null;
}

interface MountedReactiveBlock {
  type: "reactive-block";
  dispose: CleanupFn;
  children: MountedNode[];
  startAnchor: Comment;
  endAnchor: Comment;
}

interface MountedComponent {
  type: "component";
  children: MountedNode[];
  disposers: CleanupFn[];
  instance: ComponentInstance | null;
}
```

### `AppInstance`

```ts
interface AppInstance {
  root: MountedNode;
  unmount(): void;
}
```

Returned by `mount()`, `render()`, and `hydrate()`.

### `DOMOps`

```ts
interface DOMOps {
  createElement(tag: string): Element;
  createElementNS(namespace: string, tag: string): Element;
  createDocumentFragment(): DocumentFragment;
  createTextNode(text: string): Text;
  createComment(text: string): Comment;
  setAttribute(el: Element, key: string, value: string): void;
  removeAttribute(el: Element, key: string): void;
  setProperty(el: Element, key: string, value: unknown): void;
  insertBefore(parent: Node, child: Node, anchor: Node | null): void;
  appendChild(parent: Node, child: Node): void;
  remove(node: Node): void;
  setTextContent(node: Text, text: string): void;
  addEventListener(el: Element, event: string, handler: EventListener): void;
  removeEventListener(el: Element, event: string, handler: EventListener): void;
  parentNode(node: Node): Node | null;
  nextSibling(node: Node): Node | null;
}
```

The DOM operations interface. The live `domOps` object can be customized with `setDOMOps()` and restored with `resetDOMOps()`.

---

## Hydration

### `HydrationCursor`

```ts
interface HydrationCursor {
  parent: Node;
  current: Node | null;
}
```

Used by the DOM walker during hydration. Mostly internal; exposed for advanced consumers.

---

## HTML escaping

### `HtmlEscapedString`

```ts
class HtmlEscapedString extends String {
  readonly value: string;
  constructor(value: string);
  toString(): string; // returns this.value
}
```

Subclass of `String` used as the “trust” marker for already-escaped HTML. Renderers detect it via `instanceof`.

---

## JSX namespace

The JSX runtime declares a `JSX` namespace inside `sinwan/jsx-runtime`:

```ts
namespace JSX {
  export type Element = SinwanNode | Promise<SinwanNode>;
  export interface IntrinsicAttributes {
    key?: string | number;
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements extends SinwanIntrinsicElements {}
}
```

`SinwanIntrinsicElements` (in `sinwan/jsx-types`) types every standard HTML element.

To extend the set with custom elements, augment the namespace:

```ts
declare module "sinwan/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "my-button": { variant?: "primary" | "secondary"; children?: SinwanNode };
    }
  }
}
```

---

## All types at a glance

| Type                                                                                                                                                            | Subpath  | Purpose                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------ |
| `SinwanNode`, `SinwanElement`, `SinwanPrimitive`                                                                                                                | `sinwan/component` | Element model            |
| `SinwanComponent<P>`                                                                                                                                            | `sinwan/component` | Component shape          |
| `SinwanSlots`, `RenderResult`                                                                                                                                   | `sinwan/component` | Composition helpers      |
| `PropsWithChildren<P>`, `PropsWithSlots<P>`                                                                                                                     | `sinwan/component` | Sugar                    |
| `Reactive<T>`                                                                                                                                                   | `sinwan/component` | Plain-or-reactive values |
| `ShowProps<T>`, `ForProps<T>`, `SwitchProps`, `MatchProps<T>`, `IndexProps<T>`, `KeyProps<T>`, `DynamicProps`, `VisibleProps`, `PortalProps`, `VirtualProps<T>` | `sinwan/component` | Control flow             |
| `Signal<T>`, `Computed<T>`                                                                                                                                      | `sinwan/reactivity` | Reactive primitives      |
| `CleanupFn`, `EffectFn`                                                                                                                                         | `sinwan/reactivity` | Effect contract          |
| `ComponentInstance`                                                                                                                                             | `sinwan/component` | Runtime record           |
| `InjectionKey<T>`                                                                                                                                               | `sinwan/component` | DI key                   |
| `MountedNode` (+ variants)                                                                                                                                      | `sinwan/renderer` | Renderer descriptors     |
| `AppInstance`                                                                                                                                                   | `sinwan/renderer` | Mount/hydrate handle     |
| `DOMOps`                                                                                                                                                        | `sinwan/renderer` | DOM abstraction          |
| `HydrationCursor`                                                                                                                                               | `sinwan/hydration` | DOM walker state         |
| `HtmlEscapedString`                                                                                                                                             | `sinwan/component` | Trust marker for HTML    |

Every type listed here is part of the public 1.x API. Anything not on this list is implementation detail and may change between minor versions.
