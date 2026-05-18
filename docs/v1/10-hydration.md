# Hydration

Hydration is the process of attaching reactivity and event handlers to **server-rendered HTML** without recreating its DOM. After hydration, the page is fully interactive — exactly as if it had been mounted on the client from scratch — but no DOM was created or replaced, only adopted.

```ts
import { hydrate } from "sinwan";
import { renderToHydratableString } from "sinwan/react-server";
```

---

## The two-step workflow

```text
Server                                           Client
──────                                           ──────
renderToHydratableString(App, props)
   ↓
HTML with markers                ─────────────► browser receives HTML
                                                 ↓
                                                 hydrate(App, container, props)
                                                 ↓
                                                 page is interactive
```

Both calls receive the **same component and the same props**. If they don’t match, hydration mismatches occur (see [Mismatches](#mismatches)).

### 1. Server: emit markers

```tsx
import { renderToHydratableString } from "sinwan/react-server";

const html = await renderToHydratableString(App, { initialCount: 5 });
// '<div data-sinwan-id="c0"><button>Count: <!--sinwan-t:0-->5<!--/sinwan-t--></button></div>'

// Send to the browser inside an HTML document:
return new Response(
  `<!doctype html>
<html>
<head><title>App</title></head>
<body>
  <div id="root">${html}</div>
  <script type="module">
    import { hydrate } from "/sinwan.js";
    import { App } from "/app.js";
    hydrate(App, document.getElementById("root"), { initialCount: 5 });
  </script>
</body>
</html>`,
  { headers: { "Content-Type": "text/html" } },
);
```

### 2. Client: hydrate

```ts
import { hydrate } from "sinwan";

hydrate(App, document.getElementById("root")!, { initialCount: 5 });
```

`hydrate()` returns the same `AppInstance` shape as `mount()`:

```ts
interface AppInstance {
  root: MountedNode;
  unmount(): void;
}
```

---

## What hydration does, step by step

1. **Create a root `ComponentInstance`** for the component (parent = `null`).
2. **Set it as the current instance** so lifecycle hooks (`onMounted`, `provide`, …) and signals registered during setup are owned by it.
3. **Run setup** — the component function is called once with the same props the server used. Signals are recreated, hooks are registered, `provide()` writes to the instance’s provides chain.
4. **Walk the existing DOM** with a `HydrationCursor`, alongside the JSX tree returned by setup. For each `SinwanNode`:
   - **Static text** (`string` / `number`) → adopt the next text node.
   - **Reactive text** (signal or computed) → look for the marker pair `<!--sinwan-t:N-->TEXT<!--/sinwan-t-->`, attach an `effect` that updates the inner text node when the signal changes.
   - **Element** (`<div>`, `<input>`, …) → adopt the next element child, attach reactive attribute effects (only for signal-valued attrs) and event handlers.
   - **Functional component** → recurse into its returned tree.
   - **Fragment / array** → walk children.
5. Remove the `data-sinwan-id` and `data-sinwan-ev` attributes (they were just hydration aids).
6. Restore the previous current instance.
7. Fire `onMounted` hooks bottom-up. Each lifecycle callback runs with its owning instance active.

After step 7 the page behaves exactly as if you had called `mount()` — `unmount()` does the same teardown.

---

## The marker protocol

Three markers are inserted by `renderToHydratableString`:

| Marker                                   | Where                         | Purpose                               |
| ---------------------------------------- | ----------------------------- | ------------------------------------- |
| `data-sinwan-id="cN"`                    | Each component’s root element | Component boundary id                 |
| `<!--sinwan-t:N-->value<!--/sinwan-t-->` | Around reactive text nodes    | Locate the slot at hydration time     |
| `data-sinwan-ev="click:N,input:M"`       | Element with event handlers   | Optional reference for event bindings |

Constants are exported from `sinwan/hydration` (`COMP_ID_ATTR`, `TEXT_MARKER_OPEN`, `TEXT_MARKER_CLOSE`, `EVENT_ATTR`, …) along with helpers to **build** them on the server (`compId`, `textMarkerOpen`, `textMarkerCloseStr`, `eventAttrValue`) and **parse** them on the client (`parseCompId`, `parseTextOpenMarker`, `isTextCloseMarker`, `parseEventAttr`).

The numbering is **document-order, depth-first** so the server and client agree without storing extra state.

> The marker scheme is intentionally simple: comments around reactive text + a data attribute on component roots. It is forward-compatible with future partial-hydration / island schemes.

---

## What is **not** rebuilt during hydration

- **No DOM is created** for nodes that already exist in the SSR HTML.
- **Static attributes** are not touched (they’re already correct from SSR).
- **Static text content** is left as-is.

Only effects / events / reactive attributes are wired up. This makes hydration cheap: it’s a single tree walk plus one `addEventListener` per handler and one `effect()` per reactive binding.

---

## Mismatches

If the JSX tree at hydration time doesn’t match the DOM (e.g. different element tag, different number of children), Sinwan logs a warning and degrades gracefully:

```
[Sinwan hydration] expected <button> but found <span>
```

The cursor consumes the unexpected node, the rest of the tree continues to hydrate. Reactivity for the mismatched branch may be lost.

Causes of mismatches and how to fix them:

| Cause                                     | Fix                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Different props between server and client | Pass identical props to both `renderToHydratableString` and `hydrate`.              |
| Time/`Date.now()` rendered conditionally  | Avoid time-dependent JSX during SSR; render placeholders and update in `onMounted`. |
| Browser-only APIs read during setup       | Guard with `typeof window !== "undefined"` and run inside `onMounted`.              |
| Non-deterministic data fetching           | Pass the same fetched data through props on both sides.                             |
| Whitespace differences                    | Treat them as data — let the renderer manage children.                              |

A future debug build of `hydrate` will provide stricter mismatch errors and DOM diffs.

---

## Reactive attributes vs static attributes

Static attributes (e.g. `class="card"`, `aria-hidden="true"`) are emitted once on the server and **never re-applied** on hydration — they’re already correct.

Reactive attributes are different: even though the SSR output reflects the **current** value, the hydrator must attach an effect so future signal changes update the live attribute:

```tsx
import { signal, computed } from "sinwan";

const open = signal(false);
const panelClass = computed(() => `panel ${open.value ? "open" : ""}`);

<div class={panelClass}>...</div>;
```

Server emits `<div class="panel ">`. The hydrator sees the signal-valued `class` prop and attaches an effect that calls `setAttribute("class", v)` on every change.

---

## Events

The hydrator calls `bindEvents(el, props)` for every element with `on…` props in the JSX. There’s nothing to “restore” — events are pure attachment. You can safely:

- Add new handlers in JSX that didn’t exist on the server.
- Remove handlers that the server didn’t produce a marker for (the data-sinwan-ev hint is non-blocking).

Server-side, `data-sinwan-ev="click:0"` is informational only in v1 — useful for tooling and future delegation backends. The client doesn’t require it.

---

## Async components and hydration

`renderToHydratableString` awaits the **top-level** call. Nested `Promise<SinwanNode>` children are skipped (rendered as empty) by the marker pass — async data should be resolved **before** SSR and passed in as props.

The corresponding `hydrate()` call sees the resolved data and produces a matching tree.

---

## API summary

```ts
// from "sinwan"
function hydrate(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
): AppInstance;

// from "sinwan/react-server"
function renderToHydratableString<P>(
  component: SinwanComponent<P>,
  props?: P,
): Promise<string>;
function renderNodeToHydratableString(node: SinwanNode): Promise<string>;
function streamHydratablePage(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
): ReadableStream<Uint8Array>;
function streamHydratableNode(node: SinwanNode): ReadableStream<Uint8Array>;

// from "sinwan/hydration" (advanced — protocol helpers)
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

interface HydrationCursor {
  parent: Node;
  current: Node | null;
}
```

---

## Recipe: full SSR + hydrate flow

```tsx
// shared/App.tsx
import { signal, cc } from "sinwan";

export const App = cc<{ initial: number }>(({ initial }) => {
  const count = signal(initial);
  return (
    <button onClick={() => (count.value += 1)}>Clicked {count} times</button>
  );
});
```

```ts
// server.ts (Bun)
import { renderToHydratableString } from "sinwan/react-server";
import { App } from "./shared/App";

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/app.js") {
      return new Response(await Bun.file("./client.js").text(), {
        headers: { "Content-Type": "text/javascript" },
      });
    }

    const initial = 5;
    const ssr = await renderToHydratableString(App, { initial });

    return new Response(
      `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Counter</title></head>
<body>
  <div id="root">${ssr}</div>
  <script type="module">
    import { App } from "/app.js";
    import { hydrate } from "sinwan";
    hydrate(App, document.getElementById("root"), { initial: ${initial} });
  </script>
</body>
</html>`,
      {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  },
});
```

The user receives an interactive button **immediately** (the SSR HTML is already rendered) and the script then attaches reactivity without recreating the DOM.
