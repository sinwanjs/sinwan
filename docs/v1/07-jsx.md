# JSX Runtime

Sinwan ships a minimal, React-shaped JSX runtime so the TypeScript compiler can target it directly with `"jsx": "react-jsx"`.

Two entry points are exposed:

- `sinwan/jsx-runtime` — production runtime: `jsx`, `jsxs`, `Fragment`
- `sinwan/jsx-dev-runtime` — development runtime: `jsxDEV`, `Fragment` (carries `__source` debug metadata)

Both are tiny pure functions that produce `SinwanElement` objects. The renderer (client, server, hydration) is what turns those objects into output.

---

## Configuration

In `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx", // production runtime
    "jsxImportSource": "sinwan", // → "sinwan/jsx-runtime"
  },
}
```

For the dev runtime (extra source positions on each call):

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsxdev",
    "jsxImportSource": "sinwan", // → "sinwan/jsx-dev-runtime"
  },
}
```

The TypeScript compiler then auto-imports `jsx`, `jsxs`, `jsxDEV`, and `Fragment` from those subpaths — you do **not** need to import them manually.

If your editor/Builder requires explicit imports (e.g. some Vite/Rollup combos):

```ts
/** @jsxImportSource sinwan */
```

…at the top of a file works as a per-file override.

Sinwan also exposes the JSX intrinsic element map globally once `sinwan` or `sinwan/jsx-runtime` is imported. That keeps editors that do not fully pick up `jsxImportSource` from reporting `JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists`.

---

## Output shape

Every JSX expression produces:

```ts
interface SinwanElement {
  tag: string | SinwanComponent<any>;
  props: Record<string, unknown>;
  children: SinwanNode[];
}
```

The runtime functions are just convenience constructors:

```ts
// jsx-runtime.ts (excerpt)
export function jsx(type, props, key?): SinwanElement;
export function jsxs(type, props, key?): SinwanElement;
export function jsxDEV(
  type,
  props,
  key,
  isStatic,
  source?,
  self?,
): SinwanElement;

export const Fragment: unique symbol;
```

`jsx` is called for elements with **0 or 1 child**, `jsxs` for **2+ children** (the compiler picks). Both normalise children via `Array.isArray(children) ? children.flat(Infinity) : [children]` so user code can pass arrays, single values, or numbers.

Function components and intrinsic HTML elements both pass through as `tag`. The renderer, server renderer, and hydrator call function components later so component instances, lifecycle hooks, and provide/inject scopes are owned by the correct component.

---

## Fragments

`<>...</>` and `<Fragment>...</Fragment>` both compile to a `tag === Fragment` (sentinel symbol) element. The renderer treats fragments as transparent containers — they emit no wrapper element and inline their children:

```tsx
const List = () => (
  <>
    <li>One</li>
    <li>Two</li>
  </>
);
```

There’s no DOM wrapper — the `<li>` siblings end up directly under the outer parent.

For SSR, fragments are also transparent. For hydration, the fragment children are walked in document order from the current cursor position.

---

## Children semantics

```tsx
<div>
  Hello, {name}! {/* string + signal interpolation */}
  {children} {/* nested array/element */}
  {items.map((i) => (
    <Item {...i} />
  ))}{" "}
  {/* array */}
  {condition && <Foo />} {/* boolean → empty */}
  {raw("<b>trusted</b>")} {/* HtmlEscapedString */}
</div>
```

Children may be:

- `string`, `number` — rendered as text (escaped on the server)
- `boolean`, `null`, `undefined` — rendered as nothing
- `SinwanElement` — recurse
- `Promise<SinwanNode>` — async component, awaited on the server, placeholder + swap on the client
- `Signal<T>` / `Computed<T>` / `Function` — **reactive node** (renderer creates an effect). Can resolve to any node type, including elements and arrays (Dynamic Content).
- `Array<SinwanNode>` — flattened into siblings
- `HtmlEscapedString` — pre-trusted HTML, inserted verbatim on the server (treated as text on the client)

---

## Attributes

Attribute names follow JSX/React conventions, with a few aliases handled automatically:

| JSX prop                             | DOM result                     |
| ------------------------------------ | ------------------------------ |
| `class`                              | `class` (passes through)       |
| `className`                          | `class`                        |
| `htmlFor`                            | `for`                          |
| `tabIndex`                           | `tabindex`                     |
| `crossOrigin`                        | `crossorigin`                  |
| `style={...}` (object)               | `el.style.foo = "bar"` per key |
| `class={["a", isActive && "b"]}`     | `"a b"` (falsy filtered)       |
| `class={{a: true, b: false}}`        | `"a"`                          |
| Boolean `true`                       | attribute present, no value    |
| Boolean `false`, `null`, `undefined` | attribute removed              |
| Signal / Computed / Function         | reactive attribute via effect  |

DOM **properties** like `value`, `checked`, `selected`, `disabled`, `readOnly`, `multiple`, `indeterminate` are set as JS properties (not attributes), matching React.

`dangerouslySetInnerHTML={{ __html: "..." }}` is supported on both the client renderer and SSR. **The string is trusted as-is — never inject untrusted input.**

```tsx
<div dangerouslySetInnerHTML={{ __html: trustedMarkup }} />
```

For trusted HTML coming from a function call, prefer `safeHtml(...)` / `raw(...)` — see [`11-escaping.md`](./11-escaping.md).

---

## Events

Any prop matching `/^on[A-Z]/` is treated as an event handler:

```tsx
<button onClick={() => alert("hi")}>Click</button>
<input onInput={e => (q.value = e.currentTarget.value)} />
<form onSubmit={onSubmit} />
```

The renderer:

1. Strips the leading `on`.
2. Lowercases the rest: `onMouseEnter` → `mouseenter`.
3. Calls `el.addEventListener(eventName, handler)` — **direct binding, not delegation** (the SolidJS approach).

Handlers are removed automatically when the element is unmounted.

> Hydration only attaches handlers — it does not run them retroactively. Anything triggered on the server during SSR is the application’s responsibility.

---

## Refs

Use `ref` when you need direct access to a DOM element. Sinwan supports callback refs and object refs:

```tsx
const Card = cc(() => {
  let el: HTMLDivElement | null = null;

  onMounted(() => {
    el?.focus();
  });

  return (
    <div ref={(node) => (el = node as HTMLDivElement | null)} tabIndex={0}>
      Card
    </div>
  );
});
```

```tsx
const buttonRef = { current: null as HTMLButtonElement | null };
<button ref={buttonRef}>Save</button>;
```

Refs are set after the element is inserted and cleared on unmount (`callback(null)` or `current = null`).

---

## Special props skipped during rendering

These keys are recognised and **not** emitted as attributes:

- `children` — handled separately
- `key` — used by keyed helpers such as `<For>`, not emitted
- `ref` — handled by the renderer, not emitted
- `dangerouslySetInnerHTML` — used as innerHTML

---

## Dev runtime metadata

`jsxDEV` accepts extra arguments from the compiler:

```ts
jsxDEV(type, props, key, isStaticChildren, source?, self?)
```

When `source` is provided, the runtime attaches it to the element as `__source`:

```ts
{
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}
```

You can read this in dev tools or custom error reporters by checking `(element as any).__source`.

---

## TypeScript: intrinsic elements

`sinwan/jsx-types` declares `SinwanIntrinsicElements` — the set of HTML element type signatures that map to the JSX namespace. Any element you can write as `<div>`, `<a>`, `<input>`, etc. is covered with the right attribute types.

If you need to extend the set (e.g. a custom element):

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

## Frequently asked

### Can I use React’s `<Fragment>` import?

No — `Fragment` is a Sinwan symbol, distinct from React’s. Use `<>...</>` or `import { Fragment } from "sinwan"`.

### Why is `class` accepted as well as `className`?

JSX traditionally uses `className` to avoid conflicting with the JS reserved word in older targets; modern TS handles `class` fine, so Sinwan accepts both for ergonomics.

### Can I use SVG / MathML?

Yes. The renderer creates SVG descendants with `createElementNS("http://www.w3.org/2000/svg", tag)` and MathML descendants with `createElementNS("http://www.w3.org/1998/Math/MathML", tag)`. Inside SVG `foreignObject`, descendants switch back to normal HTML elements.
