# React Interop

> Status: **Phase 1 — SHARED APIs** shipped. CLIENT, SERVER and STATIC adapters land in subsequent phases.

Sinwan ships a React-compatible API surface authored **from scratch**. There is **no `react` or `react-dom` dependency** at runtime, at build time, or for types. Every signature, type and well-known symbol used by the interop layer is defined inside `src/integrations/react/`.

This page documents the rules of the bridge and the APIs delivered in Phase 1.

## Rules of the bridge

1. **Sinwan is the host runtime.** React-compatible adapters delegate to Sinwan's signals, effects, component instances and JSX runtime.
2. **No `react` import — anywhere.** Tests and source code are CI-grepped for `from "react"` / `from "react-dom"` and will fail the build.
3. **Identity isolation.** Element / context / memo / lazy type tags use `Symbol.for("sinwan.react.*")` keys, **not** React's `Symbol.for("react.*")` keys, so a host application that also installs real React shares zero runtime state with this layer.
4. **Single source of truth.** Never write to a Sinwan signal _and_ call a React-style `setState` against the same value — use one or the other. The bridge in `src/integrations/react/_internal/bridge.ts` is the only translator.
5. **SSR safety by default.** DOM-touching APIs are guarded with `isServer()` and either no-op or throw a friendly error during SSR.

## Phase 1 — SHARED API surface

All exports below ship from `sinwan/jsx-runtime`. These APIs work on both client and server.

---

### `Fragment`

**Signature:** `export { Fragment } from "sinwan/jsx-runtime"`

**Description:** Re-export of Sinwan's existing JSX `Fragment` symbol. Ensures that both `<>...</>` (JSX fragment shorthand) and `<Fragment>...</Fragment>` resolve to the same node type. This is a pure passthrough to Sinwan's native fragment handling.

**SSR:** Safe — pure symbol, no DOM access.

**Reactivity:** Pass-through — fragments are structural JSX elements with no reactive behavior.

**Example:**

```tsx
import { Fragment } from "sinwan/jsx-runtime";
// Using explicit Fragment component
const List = () => (
  <Fragment>
    <li>Item 1</li>
    <li>Item 2</li>
    <li>Item 3</li>
  </Fragment>
);

// Or using JSX shorthand
const ListShorthand = () => (
  <>
    <li>Item A</li>
    <li>Item B</li>
  </>
);
```

---

### `createContext(defaultValue)`

**Signature:** `function createContext<T>(defaultValue: T): Context<T>`

**Description:** Creates a context object that can be used to pass data through the component tree without manual prop drilling. Returns a `Context` object with `Provider`, `Consumer`, and React shorthand call form. The Provider uses Sinwan's `provide()` internally, and consumers read via `inject()`. Context lookups are reactive — components re-render when the provided value changes.

**SSR:** Safe — no DOM access, uses Sinwan's provide/inject system.

**Reactivity:** Bridge — Provider calls `provide()`, consumers use `inject()` for reactive context reads.

**Example:**

```tsx
import { createContext, use } from "sinwan/react-shared";
import { useState } from "sinwan/react-client";
// Create context with default value
const ThemeContext = createContext("light");

// Provider usage
const App = () => {
  const [theme, setTheme] = useState("dark");

  return (
    <ThemeContext.Provider value={theme}>
      <Toolbar />
      <button
        onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
      >
        Toggle Theme
      </button>
    </ThemeContext.Provider>
  );
};

// Consumer using use() hook (React style)
const Toolbar = () => {
  const theme = use(ThemeContext);
  return <div class={`toolbar theme-${theme}`}>Toolbar content</div>;
};

// Consumer using Context.Consumer render prop (legacy style)
const LegacyToolbar = () => (
  <ThemeContext.Consumer>
    {(theme) => <div class={`toolbar theme-${theme}`}>Legacy toolbar</div>}
  </ThemeContext.Consumer>
);

// React shorthand: context as a component directly
const ShorthandToolbar = () => (
  <ThemeContext value="auto">
    <div>Shorthand usage</div>
  </ThemeContext>
);
```

**Notes:**

- Context lookups traverse up the component tree until a Provider is found
- If no Provider is found, the `defaultValue` is returned
- Multiple Providers can be nested; the closest Provider wins

---

### `memo(Component, propsAreEqual?)`

**Signature:** `function memo<C extends ComponentType<any>>(Component: C, propsAreEqual?: (prev: Props, next: Props) => boolean): MemoExoticComponent<C>`

**Description:** Wraps a component to cache its most recent render output. If props are shallow-equal to the previous render, the cached result is returned instead of re-executing the component function. Uses shallow equality by default; a custom comparison function can be provided. Note: In Sinwan, this is primarily a compatibility shim — fine-grained signal reactivity already minimizes re-renders.

**SSR:** Safe — no DOM access.

**Reactivity:** Bridge — caches element output, but Sinwan signals already optimize reactivity.

**Example:**

```tsx
import { memo } from "sinwan/react-shared";
import { useState } from "sinwan/react-client";

// Basic memo with default shallow equality
const ExpensiveComponent = memo(
  ({ data, onUpdate }: { data: number[]; onUpdate: () => void }) => {
    console.log("ExpensiveComponent rendered");
    const sum = data.reduce((a, b) => a + b, 0);
    return (
      <div>
        <p>Sum: {sum}</p>
        <button onClick={onUpdate}>Update</button>
      </div>
    );
  },
);

// Custom equality function for deep comparison
const DeepMemoComponent = memo(
  ({ user }: { user: { name: string; age: number } }) => {
    console.log("DeepMemoComponent rendered");
    return (
      <div>
        {user.name} is {user.age} years old
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Deep equality check
    return (
      prevProps.user.name === nextProps.user.name &&
      prevProps.user.age === nextProps.user.age
    );
  },
);

// Usage
const Parent = () => {
  const [count, setCount] = useState(0);
  const [data] = useState([1, 2, 3, 4, 5]);

  // ExpensiveComponent won't re-render when count changes
  // because data reference stays stable
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <ExpensiveComponent data={data} onUpdate={() => console.log("update")} />
    </div>
  );
};
```

**Notes:**

- The comparison function receives previous and next props
- Return `true` to indicate props are equal (skip re-render)
- Return `false` to indicate props differ (re-render)
- Functions in props should typically be memoized with `useCallback` for best results

---

### `lazy(loader)`

**Signature:** `function lazy<C extends ComponentType<any>>(load: () => Promise<{ default: C }>): LazyExoticComponent<C>`

**Description:** Creates an async component that loads on first render. The loader function should return a Promise resolving to a module with a `default` export containing the component. The lazy component suspends (throws the loading promise) when first rendered, which must be caught by a `<Suspense>` boundary (see Phase 3). Subsequent renders use the cached resolved component.

**SSR:** Safe — renders nothing until the import resolves. On server, async components are awaited during render.

**Reactivity:** Bridge — uses Sinwan's async-component pathway; suspends inside Suspense boundaries.

**Example:**

```tsx
import { lazy } from "sinwan/react-shared";
import { Suspense } from "sinwan/react-client";

// Define lazy-loaded components
const HeavyChart = lazy(() => import("./HeavyChart.tsx"));
const UserProfile = lazy(() => import("./UserProfile.tsx"));
const AdminPanel = lazy(() => import("./AdminPanel.tsx"));

// Usage with Suspense fallback
const Dashboard = () => {
  return (
    <div>
      <h1>Dashboard</h1>

      <Suspense fallback={<div>Loading chart...</div>}>
        <HeavyChart data={[1, 2, 3, 4, 5]} />
      </Suspense>

      <Suspense fallback={<div>Loading profile...</div>}>
        <UserProfile userId={123} />
      </Suspense>
    </div>
  );
};

// Conditional lazy loading
const AdminSection = ({ isAdmin }: { isAdmin: boolean }) => {
  return isAdmin ? (
    <Suspense fallback={<div>Loading admin tools...</div>}>
      <AdminPanel />
    </Suspense>
  ) : null;
};
```

**Notes:**

- The loader is only called on first render and cached thereafter
- Failed loads will throw; use Error Boundaries to handle load failures
- Works best with code splitting/bundlers that support dynamic imports
- The component must be the `default` export of the loaded module

---

### `use(usable)`

**Signature:** `function use<T>(usable: Usable<T> | Context<T>): T`

**Description:** Unwraps a usable value — either a Promise/Thenable (suspends by throwing the pending promise) or a Context (reads current context value). Unlike React's `use`, this can be called conditionally because Sinwan does not memoize hook order across renders. For promises, the promise is tracked and the component suspends until resolution. For contexts, delegates to `inject()`.

**SSR:** Safe — promise unwrapping suspends the surrounding async render; context reads work normally.

**Reactivity:** Bridge — for Context, delegates to `inject()`. For Promises, unwraps via suspension by throwing the pending promise.

**Example:**

```tsx
import { use, createContext } from "sinwan/react-shared";
import { Suspense } from "sinwan/react-client";
// Context usage with use()
const UserContext = createContext<{ name: string; email: string } | null>(null);

const Greeting = () => {
  const user = use(UserContext);
  if (!user) return <span>Hello, guest!</span>;
  return <span>Hello, {user.name}!</span>;
};

// Promise usage with use() — suspends until resolved
async function fetchUser(id: string) {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
}

const UserProfile = ({ userId }: { userId: string }) => {
  // This suspends the component until the promise resolves
  const user = use(fetchUser(userId));

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
};

// Combined usage in parent
const App = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfile userId="123" />
    </Suspense>
  );
};
```

**Notes:**

- Can be called conditionally (inside if statements, loops, etc.)
- Promise caching uses a WeakMap — same promise instance returns same result
- Rejected promises will throw the rejection reason

---

### `cache(fn)`

**Signature:** `function cache<F extends (...args: any[]) => any>(fn: F): F`

**Description:** Creates a memoized version of the provided function. The cache is keyed by the serialized arguments tuple using structural equality (Map of Maps). On server, the cache is request-scoped. On client, falls back to a global cache for the lifetime of the JS realm — sufficient for client-side request deduplication. Supports async functions; cached promises are returned until resolved.

**SSR:** Safe — request-scoped cache on server, global cache on client.

**Reactivity:** Pass-through — no signals involved, pure memoization.

**Example:**

```tsx
import { cache, cacheSignal } from "sinwan/react-shared";
// Cache API calls
const fetchUser = cache(async (id: string) => {
  const res = await fetch(`/api/users/${id}`, { signal: cacheSignal() });
  if (!res.ok) throw new Error(`Failed to fetch user ${id}`);
  return res.json();
});

// Cache expensive computations
const computeFibonacci = cache((n: number): number => {
  if (n <= 1) return n;
  return computeFibonacci(n - 1) + computeFibonacci(n - 2);
});

// Usage in components
const UserCard = async ({ userId }: { userId: string }) => {
  // First call fetches, subsequent calls with same id return cached result
  const user = await fetchUser(userId);
  return (
    <div>
      <h3>{user.name}</h3>
      <p>Cached computation: {computeFibonacci(30)}</p>
    </div>
  );
};

// Deduplication example
const UserList = async () => {
  // These three calls will only result in one network request
  const [user1, user2, user3] = await Promise.all([
    fetchUser("123"),
    fetchUser("123"), // deduplicated
    fetchUser("123"), // deduplicated
  ]);
  return <div>Loaded {user1.name}</div>;
};
```

**Notes:**

- Arguments are serialized via `JSON.stringify` with bigint support
- Non-serializable arguments degrade to type+string identity key
- Cache persists for the lifetime of the JS realm (or request on server)
- Does not auto-invalidate — use fresh function references to clear cache

---

### `cacheSignal()`

**Signature:** `function cacheSignal(): AbortSignal`

**Description:** Returns an `AbortSignal` scoped to the current request. On server, this signal aborts when the request is cancelled (e.g., client disconnect during streaming). On client, returns a signal that never aborts — matching React's documented behavior. Integrates with `cache()` to allow cancelling in-flight fetches when the request ends.

**SSR:** Safe — returns request-scoped signal on server, never-aborting signal on client.

**Reactivity:** Pass-through — no reactive behavior, just signal management.

**Example:**

```tsx
import { cache, cacheSignal } from "sinwan/react-shared";
// Data loader with cancellation support
const fetchProducts = cache(async (category: string) => {
  const res = await fetch(`/api/products?category=${category}`, {
    signal: cacheSignal(), // automatically cancelled on disconnect
  });
  return res.json();
});

// Component using cached loader
const ProductList = async ({ category }: { category: string }) => {
  try {
    const products = await fetchProducts(category);
    return (
      <ul>
        {products.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return <div>Request cancelled</div>;
    }
    throw e;
  }
};

// Manual usage in custom fetch
async function customFetch(url: string) {
  const controller = new AbortController();
  const signal = cacheSignal();

  // Link the signals
  signal.addEventListener("abort", () => controller.abort());

  const res = await fetch(url, { signal: controller.signal });
  return res.json();
}
```

**Notes:**

- On server, the signal is registered by `renderToReadableStream` or `renderToPipeableStream`
- On client, the signal never aborts (matches React behavior)
- Always check for AbortError when using with fetch

---

### `addTransitionType(type)`

**Signature:** `function addTransitionType(type: string): void`

**Description:** Tags the active transition with a string label. Sinwan does not use transition labels for internal scheduling (Sinwan's scheduler is synchronous), but this records them on a per-tick set so consumers can introspect via `getActiveTransitionTypes()`. Useful for analytics, debugging, or coordinating with external transition-aware systems.

**SSR:** Safe — no-op if no transition is active.

**Reactivity:** Pass-through — no reactive behavior.

**Example:**

```tsx
import {
  addTransitionType,
  startTransition,
  useTransition,
} from "sinwan/component";
const Navigation = () => {
  const [isPending, startTransition] = useTransition();
  const [route, setRoute] = useState("/home");

  const navigate = (newRoute: string) => {
    startTransition(() => {
      addTransitionType("navigation");
      addTransitionType(`route-${newRoute}`);
      setRoute(newRoute);
    });
  };

  return (
    <nav>
      <button onClick={() => navigate("/home")} disabled={isPending}>
        Home
      </button>
      <button onClick={() => navigate("/about")} disabled={isPending}>
        About
      </button>
      {isPending && <span>Navigating...</span>}
    </nav>
  );
};

// Introspecting active transition types (e.g., in middleware)
import { getActiveTransitionTypes } from "sinwan/component";
const logTransitions = () => {
  const types = getActiveTransitionTypes();
  if (types.size > 0) {
    console.log("Active transition types:", Array.from(types));
  }
};
```

**Notes:**

- Types accumulate until the transition completes
- Use `getActiveTransitionTypes()` to read current types
- Types are cleared automatically after transition flush

---

### `captureOwnerStack()`

**Signature:** `function captureOwnerStack(): string | null`

**Description:** Walks `getCurrentInstance()` to render a string stack of ancestor component names, or returns `null` if there is no active instance. Designed for use inside error reporters and DevTools-style integrations. Useful for debugging component trees without a full DevTools integration.

**SSR:** Safe — reads component instance data, no DOM access.

**Reactivity:** Pass-through — reads `getCurrentInstance()` state only.

**Example:**

```tsx
import { captureOwnerStack } from "sinwan/component";
// Error boundary pattern
const ErrorBoundary = ({ children }: { children: any }) => {
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <div class="error">
        <h2>Something went wrong</h2>
        <pre>{error.message}</pre>
      </div>
    );
  }

  try {
    return children;
  } catch (e) {
    const stack = captureOwnerStack();
    console.error("Component stack at error:", stack);
    setError(e as Error);
    return null;
  }
};

// Custom hook with debugging
const useTrackedValue = <T,>(value: T) => {
  useEffect(() => {
    console.log("Value changed in component:", captureOwnerStack());
  }, [value]);

  return value;
};

// Usage
const DeepComponent = () => {
  const stack = captureOwnerStack();
  // Returns something like:
  // "    at DeepComponent
  //      at MiddleComponent
  //      at OuterComponent"

  return <div>{stack}</div>;
};
```

**Notes:**

- Returns `null` when called outside of component setup
- Stack format mimics JavaScript stack traces for familiarity
- Component names come from `_displayName` or function `name` property

---

## What's next

- **Phase 2** — CLIENT hooks (`useState`, `useEffect`, …) anchored on `ComponentInstance` slots.
- **Phase 3** — CLIENT components (`<Suspense>`, `<StrictMode>`, `<Profiler>`), `createPortal`, `flushSync`, resource-hint APIs, `createRoot` / `hydrateRoot`.
- **Phase 4** — SERVER (`renderToString`, `renderToReadableStream`, `renderToPipeableStream`, `resume*`).
- **Phase 5** — STATIC (`prerender*`, `resumeAndPrerender*`).
- **Phase 6** — Unstable (`<Activity>`, `<ViewTransition>`, `useEffectEvent`).
