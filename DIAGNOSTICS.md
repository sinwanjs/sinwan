# Sinwan diagnostics

Sinwan reports code that compiles but misbehaves, in development only:

- **`SW1xx`: compiler diagnostics.** `sinwan-compiler` (1.4+) reports them while compiling JSX, with `file:line:column`. `bun-plugin-sinwan` prints them in the dev server terminal; `vite-plugin-sinwan` reports them as Vite warnings. Silence one with `/* sinwan-ignore SW101 */` on the reported line or the line above (`sinwan-ignore` alone silences every code there).
- **`SW2xx`: runtime warnings.** Sinwan's development bundle prints them in the browser console, once per message, as `[Sinwan] SW2xx: …`. The production bundle contains none of them.

Libraries built on Sinwan can report their own runtime warnings with `devWarn` from `sinwan/dev`.

## Compiler

### SW101 — zero-argument function on a component prop

```tsx
<Gate content={() => <Overview />} />     // reported
<Gate content={(_owner) => <Overview />} /> // a callback: give it a parameter
<Gate title={user.value.name} />          // a value: pass it directly
```

Sinwan reads a zero-argument function on a component prop as a getter, so the component receives its **return value**. A callback never arrives as a function; `action={async () => save()}` even runs `save()` whenever the prop is read. Callback names (`onSelect`, `onclick`, …), `children`, `ref`, intrinsic elements and built-in control flow are not reported. You never need a manual getter: the compiler already tracks reactive reads.

### SW102 — a new object in `when`

```tsx
<Show when={user.value ? { ...user.value } : null}>…</Show> // reported
<Show when={!!user.value}>…{user.value!.name}…</Show>       // a boolean
```

`Show`, `Match` and `Key` compare `when` by identity. An expression that builds an object or array (a literal, `new`, or one in a `?:` / `&&` branch) produces a new identity on every evaluation, so the content is torn down and rebuilt whenever anything the expression reads changes. Focus, scroll and local state inside are lost. Pass a boolean and read the value in the children, or keep the object stable with `computed`.

### SW103 — `value={undefined}` on a component

The prop is present, so a controlled component (sinwan-ui `Select`, `Switch`, `Dialog`, …) is controlled with no value and ignores input. Omit the prop for an uncontrolled component, or pass `null` / `""` for an empty controlled one.

### SW110 — a derived local snapshots a reactive read

`const label = user.value.name` in a component body reads once. When used in JSX it never updates. Enable `derivedLocals`, use a getter or `computed`, or mark an intentional snapshot with `/* sinwan-snapshot */`.

### SW111 — a derived local in a setup `if`

An `if` in a component body runs once, at setup. With `derivedLocals` the compiler calls the getter there to keep boolean meaning, but the branch never re-runs. Use `Show` for reactive branches.

### SW112 — template hoisting skipped

The element still renders, through the slower non-template path. Spread attributes (`<div {...props}>`) and a member-expression component nested inside an inner element (`<div><span><UI.Card /></span></div>`) cause this on purpose; any other reason is worth reporting.

### SW113 — `${…}` in a quoted `style` string

`style="color:${c}"` is a plain string and is not interpolated. Use `` style={`color:${c}`} ``.

## Runtime

### SW201 — `when` rebuilt content for nothing

`Show` re-rendered because `when` changed from one object to another, and either the children do not receive the value (static children), or the new value is an equal copy (for example after a refetch). The message names the owning component. Same fixes as SW102.

### SW202 — controlled prop is `undefined` (sinwan-ui-core)

A sinwan-ui-core control got `value`, `checked` or `open` with an `undefined` value. It is controlled with no value, so it ignores input. Omit the prop, or pass `null` / `""`.
