# Why Sinwan?

Sinwan was born from a simple frustration: **modern frameworks solve problems they themselves created.**

---

## The Observation

In 2026, building a performant web interface with React means dealing with:

- **Unnecessary re-renders.** A `useState` in a parent forces the entire component tree to re-execute. You optimize with `memo`, `useMemo`, `useCallback` — all band-aids over a fundamentally inefficient model.
- **A costly Virtual DOM.** On every update, the component re-runs, a virtual tree is rebuilt, diffed, then patched. To update a single `<span>`, you re-render everything.
- **A broken mental model.** The component is supposed to be a "pure function", but it executes 50 times. Closures become traps. `useEffect` dependencies turn into an optimization game, not a clean abstraction.
- **JavaScript shipped to the client.** Even for a static page, you're bundling 40+ KB of reconciliation runtime.

The feeling was constant: **fighting the framework** instead of building the application.

---

## What I Expected from a Framework

1. **The component runs once.** At mount time, I initialize state, attach effects, return JSX — and that function is never called again.
2. **Reactivity is surgical.** When a value changes, **one single DOM node** is updated. No diffing. No re-render. O(1), regardless of tree size.
3. **JSX without a Virtual DOM.** Keeping the declarative syntax everyone knows, but without the intermediate virtual tree.
4. **SSR native, not bolted on.** Server rendering and hydration designed from day one, not retrofitted onto a client-only engine.
5. **Interoperable with React.** The React ecosystem is massive. Being able to write `useState`, `useEffect`, `createRoot` and have it just work — with Sinwan under the hood — was non-negotiable.

---

## The Genesis

The experimentation started with **SolidJS** and **Vue 3 (Composition API)**. Both proved that fine-grained reactivity works at scale. But:

- Solid's reactivity syntax drifts too far from the React ecosystem.
- Vue still relies on its Virtual DOM for transitions and certain complex cases.

The goal was something **more radical on the no-VDOM front**, but **more familiar on the API front**.

Sinwan = **SolidJS-level performance** + **React-level familiarity**.

---

## The Core Decisions

### 1. No Virtual DOM

The VDOM was a brilliant innovation in 2013 — the DOM was slow, machines were weak. In 2024, it's become **a bag of problems**:
- Memory: a virtual tree mirroring the real DOM
- CPU: diff + patch on every update
- Complexity: reconciler, fibers, priority lanes, Suspense boundaries...

Sinwan removes all of that. JSX returns a flat, temporary object `{ tag, props, children }` consumed immediately by the renderer. After that, only effects touch the DOM.

### 2. Native Signals

A `signal()` is not a hook. It's an **autonomous reactive cell** that knows who reads it and who writes to it. When it changes, it notifies exactly its subscribers — nothing more.

No re-render. No stale closure. No dependency array to maintain.

### 3. Setup Once, Update Forever

The component is an **installation function**, not a render function. It runs once at mount (or hydration), creates its signals, registers its effects, and is done. Everything after that is handled by reactivity.

This is an **infinitely simpler mental model**: you think in terms of state and effects, not "what is going to trigger a re-render."

### 4. React API Without React

Why reinvent the wheel when React already has the best DX on the market?

Sinwan reimplements `useState`, `useEffect`, `useRef`, `createContext`, `createRoot`, and more. But under the hood:
- `useState` → `signal()`
- `useEffect` with deps → `sinwanEffect` subscribed to signals
- `useEffect` without deps → `onMounted` + `onUpdated`
- `createRoot` → `mount()`

You write React code. It runs like Solid.

---

## What Sinwan Is Not

- **Not a React clone.** It reuses familiar names, but the execution model is fundamentally different.
- **Not a magic solution.** If you put 10,000 signals into a component, you'll have 10,000 effects. Architecture still matters.

---

## Who Is Sinwan For?

- Developers **tired of optimizing re-renders**.
- Those who want **compiled-framework performance** (Svelte, Solid) without changing their syntax.
- Projects where **SSR and hydration** are critical (SEO, LCP, TTI).
- Anyone who loves React but **hates its execution model**.

---

## Conclusion

Sinwan is the framework that would have been wanted in 2024, but that couldn't exist without the advances of 2025. It doesn't revolutionize the syntax — it revolutionizes **what happens when you hit enter**.

Less runtime. Fewer re-renders. More predictability.

**The component runs once. The DOM updates forever.**