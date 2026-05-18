# Troubleshooting

A field guide for the most common Sinwan issues. If you don’t find your problem here, open an issue with a minimal repro at https://github.com/sinwanjs/sinwan/issues.

---

## “onMounted/onUnmounted/provide/inject called outside of component setup”

**Symptom:** Synchronous `Error` thrown at module load, first render, or from an event/timer callback.

**Cause:** You called a lifecycle / DI hook when no component instance was active.

**Fix:** Move the call into the setup body. For lifecycle cleanup that depends on mounted-only work, register it synchronously inside that lifecycle callback.

```tsx
// ✅ Helper is fine if it is executed while setup is active.
function setupTimer() {
  onMounted(() => {
    /* ... */
  });
}

const Timer = cc(() => {
  setupTimer(); // executes synchronously inside setup
  return <div />;
});
```

```tsx
// ❌ Definitely doesn’t work — call happens with no active instance.
const Timer = cc(() => <div />);
onMounted(() => {
  /* throws */
});
```

---

## “Exported binding 'X' needs to refer to a top-level declared variable”

**Symptom:** Calling `require("sinwan")` (or running a `dist/*.js` file directly) crashes with this `SyntaxError`.

**Cause:** Building Sinwan from source with `sideEffects: false` left in `package.json`. Bun’s bundler tree-shakes away the implementations of re-exported symbols.

**Fix:** Use the official `bun run build` script — it temporarily removes `sideEffects` and re-adds it after bundling. If you’ve customised the build, mirror that workaround. See [`13-build-and-deploy.md`](./13-build-and-deploy.md#why-a-sub-process-for-the-bundling).

---

## “Unexpected token 'export'” when requiring `dist/esm/*.js`

**Symptom:** `require('./dist/esm/index.production.min.js')` blows up with this error.

**Cause:** Files in `dist/esm/` are ESM but Node treats them as CJS by default (because the project is `"type": "commonjs"`).

**Fix:** The `dist/esm/package.json` marker (`{"type":"module"}`) must be present. The build emits it automatically; if you delete it manually or copy `dist/esm` into a CJS-only context, recreate it.

---

## Hydration mismatch warning

**Symptom:** `[Sinwan hydration] expected <X> but found <Y>`. Reactivity for that subtree is partially broken.

**Cause:** SSR HTML differs from what the client rebuilds.

**Fix:** Pass identical props on both sides. Avoid time-dependent JSX (`new Date()`), browser-only API reads in setup, and non-deterministic data fetches. See [`10-hydration.md`](./10-hydration.md#mismatches).

---

## A signal change doesn’t update the DOM

**Likely causes**

1. **You wrote `count` instead of `count.value`** (or vice-versa). Reading `.value` tracks; writing updates. The renderer accepts both `signal` and `signal.value` directly because `Signal.toString()` returns the value, but only the **signal itself** (not its current value) creates a reactive binding.

   ```tsx
   {
     /* ✅ Reactive */
   }
   <p>{count}</p>;

   {
     /* ❌ Read once, never updates */
   }
   <p>{count.value}</p>;
   ```

2. **You destructured a signal**:

   ```tsx
   const { value } = count; // captures the value at this moment
   ```

   Signals carry their reactivity on the `value` _getter_. Don’t pull it out.

3. **You mutated an object held by a signal**:

   ```ts
   const items = signal<Item[]>([]);
   items.value.push(newItem); // ❌ no trigger
   items.value = [...items.value, newItem]; // ✅
   ```

   Sinwan compares with `Object.is`. Reassign with a new array/object reference.

4. **You read a signal inside an `await`** in a setup function:

   ```ts
   const data = await fetch("/x");
   const x = a.value; // not tracked — too late
   ```

   Read everything synchronously **before** the first `await` if you need tracking.

---

## “Hello {name}!” still shows the old name

`name` is interpolated into a regular string template — that’s a one-off `String()` call, not a reactive binding. To make it reactive, render the signal as a child:

```tsx
{
  /* ✅ */
}
<p>Hello {name}!</p>;

{
  /* ❌ Static */
}
<p>{`Hello ${name}!`}</p>;
```

If you really need a single string, derive it via `computed`:

```tsx
const greeting = computed(() => `Hello ${name.value}!`);
<p>{greeting}</p>;
```

---

## “Cannot read properties of null (reading 'addEventListener')”

**Cause:** Calling `mount(Comp, document.getElementById("..."))` before the DOM contains the element.

**Fix:** Either move the script tag below the element, or add `defer` to the script, or wrap in `DOMContentLoaded`:

```ts
addEventListener("DOMContentLoaded", () => {
  mount(App, document.getElementById("app")!);
});
```

---

## TypeScript can’t find `sinwan` types

**Symptom:** `Cannot find module 'sinwan' or its corresponding type declarations.`

**Cause:** Old TS module resolution. Sinwan uses `exports` conditions which require:

```jsonc
{ "compilerOptions": { "moduleResolution": "Bundler" } }
// or
{ "compilerOptions": { "moduleResolution": "Node16" /* or "NodeNext" */ } }
```

Set one of these in your `tsconfig.json`.

---

## JSX errors: “Cannot find name 'jsx'” / “'div' is not assignable to 'HTMLElement'”

**Cause:** Wrong JSX configuration.

**Fix:** In `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "sinwan",
  },
}
```

Restart the TS server in your editor after editing.

---

## Bundler ships the development build to production

**Cause:** `process.env.NODE_ENV` is not substituted at build time.

**Fix:**

- **Vite**: `vite build` sets it automatically. If you build with `vite build --mode foo`, set `define: { "process.env.NODE_ENV": '"production"' }`.
- **Webpack**: `mode: 'production'` does this automatically.
- **esbuild**: `define: { "process.env.NODE_ENV": '"production"' }`.
- **Rollup**: use `@rollup/plugin-replace` with the same define.
- **Bun**: `bun build --define process.env.NODE_ENV='"production"'`.

Verify by inspecting the output: search for `process.env.NODE_ENV` in your final bundle — it should be **absent** in production.

---

## “onError doesn’t catch my error”

`onError` only catches errors thrown **synchronously during component setup or descendant setup**. Errors inside event handlers, `effect` callbacks, async data fetches in `onMounted`, etc. are not caught.

For those, use a regular `try/catch`, write the failure into a signal, and render a fallback UI when the signal is set.

---

## Effects keep growing in memory after unmounts

Symptoms: memory usage climbs, devtools shows many `ReactiveEffect` instances after navigating away.

**Cause:** A long-lived `effect()` was created inside a component’s setup but never disposed.

**Fix:** Either capture the dispose function and call it in `onUnmounted`, or push it into `getCurrentInstance()!.effects`:

```tsx
const dispose = effect(() => {
  /* ... */
});
onUnmounted(dispose);

// or
getCurrentInstance()!.effects.push(dispose);
```

Renderer-created effects (reactive text, reactive attributes) are cleaned up automatically.

---

## Why doesn’t my `.map()` list update when the array signal changes?

Arrays passed through `.map()` in JSX are evaluated once during setup and produce static elements. Each item is bound, but the list shape itself is not reactive.

Use `<For fallback={...}>` for reactive list shape + empty-state UI:

```tsx
<For
  each={items}
  key={(item) => item.id}
  fallback={<li class="empty">No items yet.</li>}
>
  {(item) => <li>{item.label}</li>}
</For>
```

`<For>` moves existing rows, mounts new rows, unmounts removed rows cleanly, and swaps to the fallback when the list is empty.

---

## A `Bun.escapeHTML` error on Node

**Cause:** Pre-fix code that called `Bun.escapeHTML(...)` directly.

**Fix:** Use `escapeHtml` from `sinwan` — it picks the right implementation per runtime. See [`11-escaping.md`](./11-escaping.md).

If you’re importing from `sinwan` and still seeing the error, you have an old version cached. Clear `node_modules`, lock files, and reinstall.

---

## “The component renders twice on first mount”

You probably called `mount()` twice (e.g. HMR re-running module code). Hot-reload-aware tools should call `app.unmount()` before re-mounting. In dev, you can guard:

```ts
let app: AppInstance | null = null;
function start() {
  app?.unmount();
  app = mount(App, document.getElementById("app")!);
}
start();
if (import.meta.hot) {
  import.meta.hot.accept(start);
}
```

---

## Tests fail because effects don’t run

Effects schedule on the microtask queue. Synchronous assertions after a `signal.value = ...` won’t see the new state. Either `await nextTick()` or use `batch()`:

```ts
import { signal, effect, batch, nextTick } from "sinwan";

const c = signal(0);
let observed = -1;
effect(() => {
  observed = c.value;
});

c.value = 5;
expect(observed).toBe(5); // ❌ scheduled, not yet ran

await nextTick();
expect(observed).toBe(5); // ✅

batch(() => {
  c.value = 9;
});
expect(observed).toBe(9); // ✅ batch flushes synchronously
```

---

## Still stuck?

- Re-read [`02-architecture.md`](./02-architecture.md) — many issues come from misunderstanding the model.
- Verify with a tiny isolated repro before assuming a bug.
- Open an issue with the runtime, version, repro, and expected/actual behaviour.
