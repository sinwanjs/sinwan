# Provide / Inject

`provide` and `inject` are Sinwan’s built-in dependency injection mechanism, modelled after Vue 3. A parent component **provides** a value (any JavaScript value: signal, function, plain object, …); any descendant can **inject** it without props drilling.

```ts
import { provide, inject, type InjectionKey } from "sinwan";
```

Both functions need an active component instance. The usual place is component setup; synchronous lifecycle callbacks also have an active owner instance, but values provided after child setup will not retroactively change what those children already injected.

---

## API

```ts
type InjectionKey<T> = symbol & { __type?: T };

function provide<T>(key: string | symbol, value: T): void;

function inject<T>(key: string | symbol, defaultValue?: T): T;
```

`InjectionKey<T>` is a typed symbol alias. Sinwan accepts plain strings too, but typed symbols give you full type inference at the call site.

---

## Basic usage

```tsx
// keys.ts
import type { InjectionKey } from "sinwan";

export const ThemeKey: InjectionKey<"light" | "dark"> = Symbol("theme");
```

```tsx
// App.tsx
import { provide, cc } from "sinwan";
import { ThemeKey } from "./keys";

const App = cc(() => {
  provide(ThemeKey, "dark");
  return (
    <Layout>
      <Page />
    </Layout>
  );
});
```

```tsx
// Card.tsx
import { inject } from "sinwan";
import { ThemeKey } from "./keys";

const Card = cc(() => {
  const theme = inject(ThemeKey, "light"); // typed as "light" | "dark"
  return <div class={`card card--${theme}`}>...</div>;
});
```

`Card` can be deeply nested — `inject` walks up the prototype chain of the instance’s `provides` object until it finds the key.

---

## How the lookup works

Each `ComponentInstance` has a `provides` object whose `[[Prototype]]` is its parent’s `provides`:

```text
App.provides   = { themeKey: "dark" }
   ▲ prototype
Page.provides  = {}                         ← inject("themeKey") → "dark"
   ▲ prototype
Card.provides  = { themeKey: "high-contrast" }
   ▲ prototype
Inner.provides = {}                         ← inject("themeKey") → "high-contrast"
```

This gives O(depth) lookup with **automatic shadowing** — a child that re-provides the key replaces the value for everything below it without affecting siblings or the parent.

---

## Default values

`inject(key, defaultValue)` returns `defaultValue` when no ancestor provided the key. The function checks `arguments.length`, so passing `undefined` explicitly is treated as a real default:

```ts
const v1 = inject("k"); // → undefined, warns in console
const v2 = inject("k", "fallback"); // → "fallback"
const v3 = inject("k", undefined); // → undefined (no warning)
```

When no default is provided **and** the key is missing, Sinwan emits:

```
[Sinwan] inject() key "<name>" not found and no default provided.
```

…and returns `undefined`. Always pass a default when uncertain.

---

## Reactive injection

`provide` doesn’t make the value reactive on its own — it stores whatever you pass. To get reactive injection, provide a signal:

```tsx
import {
  signal,
  computed,
  provide,
  inject,
  cc,
  type InjectionKey,
  type Signal,
} from "sinwan";

const ThemeKey: InjectionKey<Signal<"light" | "dark">> = Symbol("theme");

const Root = cc(() => {
  const theme = signal<"light" | "dark">("dark");
  provide(ThemeKey, theme);
  return <Layout />;
});

const Card = cc(() => {
  const theme = inject(ThemeKey)!; // Signal<"light" | "dark">
  const cardClass = computed(() => `card card--${theme.value}`);
  return <div class={cardClass}>...</div>;
});
```

When `theme.value` changes anywhere, every descendant that interpolated it updates — no re-render of the tree.

A common pattern is to provide an **immutable “store” object** that contains both signals and methods to mutate them:

```ts
const CounterKey: InjectionKey<{
  count: Signal<number>;
  increment(): void;
}> = Symbol("counter");

const Root = cc(() => {
  const count = signal(0);
  provide(CounterKey, {
    count,
    increment: () => count.value++,
  });
  return <App />;
});
```

Children inject the store and use both reads (`count.value`) and writes (`increment()`):

```tsx
const Display = cc(() => {
  const { count } = inject(CounterKey)!;
  return <p>Count: {count}</p>;
});

const Button = cc(() => {
  const { increment } = inject(CounterKey)!;
  return <button onClick={increment}>+1</button>;
});
```

This is the recommended pattern for app-wide state.

---

## Re-providing in a subtree

A child may call `provide(sameKey, newValue)` to override the parent’s value for its own subtree only. The parent’s provided value remains visible to siblings:

```tsx
const Root = cc(() => {
  provide(ThemeKey, "dark");
  return (
    <>
      <Card /> {/* inject → "dark" */}
      <SpecialZone>
        <Card /> {/* inject → "high-contrast" */}
      </SpecialZone>
    </>
  );
});

const SpecialZone = cc(({ children }) => {
  provide(ThemeKey, "high-contrast");
  return <section class="special">{children}</section>;
});
```

---

## Keys: string vs symbol

Both work. Symbols are recommended for production code:

- They can carry a precise type via `InjectionKey<T>`.
- They never collide accidentally.
- They support `Symbol.for(key)` if you need cross-bundle identity.

Use a **string** when you intentionally want a global, named key visible across modules / iframes / tests.

---

## Errors

| When                                          | What happens                                                 |
| --------------------------------------------- | ------------------------------------------------------------ |
| `provide()` called with no active instance    | Throws `Error: provide() called outside of component setup.` |
| `inject()` called with no active instance     | Throws `Error: inject() called outside of component setup.`  |
| `inject(key)` with no provider and no default | Logs a warning, returns `undefined`                          |

The hooks read `getCurrentInstance()` — that’s why both must be called synchronously while a component instance is active. Prefer setup for `provide()` so descendants can see the value during their own setup.

---

## Common patterns

### Theme

```ts
const ThemeKey: InjectionKey<Signal<string>> = Symbol("theme");
```

### Router

```ts
const RouterKey: InjectionKey<{
  path: Signal<string>;
  push(p: string): void;
}> = Symbol("router");
```

### Localised strings

```ts
const I18nKey: InjectionKey<{
  t(k: string): string;
  locale: Signal<string>;
}> = Symbol("i18n");
```

### Server context

When using `renderToHydratableString`, you can stash request-scoped data in `provide` and `inject` it deep in the tree without prop drilling — no need for module-level globals.

---

## Comparison with other frameworks

| Feature             | Sinwan                | Vue 3                    | React (Context)                |
| ------------------- | --------------------- | ------------------------ | ------------------------------ |
| Lookup mechanism    | Prototype chain       | Prototype chain          | Subscription-based             |
| Reactive on its own | No (provide a signal) | Yes via `ref`/`reactive` | No (provide reactive value)    |
| Setup-only          | Yes                   | Yes                      | Hooks-only                     |
| Default value       | Yes                   | Yes                      | Yes (`createContext(default)`) |

Sinwan’s model is intentionally similar to Vue’s for ergonomics, but the data plane is signals — provide what you need, mutate where it’s defined, observe where you read.
