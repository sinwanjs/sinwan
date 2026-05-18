# React Hooks

> Status: **Phase 2** — all 18 React-compatible hooks delivered. Imported from `sinwan/react-client`.

All hooks are authored from scratch on top of Sinwan primitives (`signal`, `effect`, `getCurrentInstance`, `onMounted`, `onUnmounted`). Zero `react` / `react-dom` dependency.

> **Hook usage rule.** Every hook must be called inside a Sinwan component setup function (`cc`). Calling a hook outside throws `[sinwan/react] Hook called outside of a component setup function`.

---

## State Hooks

### `useState(initial)`

**Signature:** `function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>]`

**Description:** Returns a stateful value and a function to update it. Backed by a Sinwan signal owned by the component instance. Reading the value tracks the current effect (Sinwan's fine-grained reactivity replaces React's re-render mechanism). The setter accepts either a new value or an updater function that receives the previous state.

**SSR:** Safe — runs during component setup; initial value is returned.

**Reactivity:** Bridge — backed by a Sinwan signal owned by the component instance.

**Example:**

```tsx
import { useState } from "sinwan/react-client";

const Counter = () => {
  const [count, setCount] = useState(0);

  // Direct value update
  const increment = () => setCount(count + 1);

  // Functional update (recommended for dependent state)
  const decrement = () => setCount((c) => c - 1);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  );
};

// Lazy initial state (function called only on first render)
const ExpensiveInitial = () => {
  const [data, setData] = useState(() => {
    // This runs only once, not on every render
    return computeExpensiveInitialValue();
  });

  return <div>{data}</div>;
};

// Multiple state values
const Form = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);

  return (
    <form>
      <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <input value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
      <label>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.currentTarget.checked)}
        />
        I agree
      </label>
    </form>
  );
};
```

---

### `useReducer(reducer, initialState, init?)`

**Signature:** `function useReducer<S, A>(reducer: Reducer<S, A>, initialState: S, init?: (initial: S) => S): [S, Dispatch<A>]`

**Description:** An alternative to `useState` for complex state logic. Accepts a reducer of type `(state, action) => newState` and returns the current state paired with a dispatch method. The optional `init` function can transform the initial state (useful for lazy initialization). Like `useState`, the state is backed by a Sinwan signal.

**SSR:** Safe — runs during component setup.

**Reactivity:** Bridge — backed by a signal owned by the component instance.

**Example:**

```tsx
import { useReducer } from "sinwan/react-client";

// Define state and action types
type State = { count: number; step: number };
type Action =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "setStep"; payload: number }
  | { type: "reset" };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + state.step };
    case "decrement":
      return { ...state, count: state.count - state.step };
    case "setStep":
      return { ...state, step: action.payload };
    case "reset":
      return { count: 0, step: 1 };
    default:
      return state;
  }
};

const Counter = () => {
  const [state, dispatch] = useReducer(reducer, { count: 0, step: 1 });

  return (
    <div>
      <p>
        Count: {state.count} (step: {state.step})
      </p>
      <button onClick={() => dispatch({ type: "decrement" })}>-</button>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "reset" })}>Reset</button>
      <input
        type="number"
        value={state.step}
        onChange={(e) =>
          dispatch({ type: "setStep", payload: Number(e.currentTarget.value) })
        }
      />
    </div>
  );
};

// With lazy initialization
const init = (count: number) => ({ count, history: [count] });

type LazyState = { count: number; history: number[] };
type LazyAction = { type: "increment" | "decrement" };

const lazyReducer = (state: LazyState, action: LazyAction): LazyState => {
  const newCount =
    action.type === "increment" ? state.count + 1 : state.count - 1;
  return {
    count: newCount,
    history: [...state.history, newCount],
  };
};

const HistoryCounter = () => {
  const [state, dispatch] = useReducer(lazyReducer, 0, init);

  return (
    <div>
      <p>Current: {state.count}</p>
      <p>History: {state.history.join(", ")}</p>
    </div>
  );
};
```

---

### `useRef(initial)`

**Signature:**

```ts
function useRef<T>(initialValue: T): MutableRefObject<T>;
function useRef<T>(initialValue: T | null): RefObject<T>;
function useRef<T = undefined>(): MutableRefObject<T | undefined>;
```

**Description:** Returns a mutable ref object whose `.current` property is initialized to the passed argument. The returned object persists for the full lifetime of the component. Unlike `useState`, mutating the ref does not trigger re-renders. Use for DOM element references, storing previous values, or any mutable value that shouldn't cause re-renders when changed.

**SSR:** Safe — returns a `{ current }` container without DOM access.

**Reactivity:** Native (not reactive — mirrors React semantics exactly).

**Example:**

```tsx
import { useRef, useEffect, useState } from "sinwan/react-client";

// DOM element reference
const InputFocus = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return (
    <div>
      <input ref={inputRef} placeholder="Click button to focus" />
      <button onClick={focusInput}>Focus Input</button>
    </div>
  );
};

// Storing previous value
const PreviousValue = ({ value }: { value: number }) => {
  const prevRef = useRef<number>();

  useEffect(() => {
    prevRef.current = value;
  });

  return (
    <div>
      <p>Current: {value}</p>
      <p>Previous: {prevRef.current}</p>
    </div>
  );
};

// Mutable counter that doesn't re-render
const SilentCounter = () => {
  const countRef = useRef(0);
  const [, forceRender] = useState({});

  return (
    <div>
      <p>Count (silent): {countRef.current}</p>
      <button
        onClick={() => {
          countRef.current++;
          forceRender({});
        }}
      >
        Increment & Show
      </button>
      <button
        onClick={() => {
          countRef.current++;
        }}
      >
        Increment Silently
      </button>
    </div>
  );
};

// Interval management
const Timer = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [seconds, setSeconds] = useState(0);

  const start = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    start();
    return stop;
  }, []);

  return (
    <div>
      <p>Elapsed: {seconds}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
};
```

---

### `useMemo(factory, deps)`

**Signature:** `function useMemo<T>(factory: () => T, deps: GetterDependencyList): T`

**Description:** Returns a memoized value. The factory function runs during every render, but its result is only recomputed when one of the dependencies has changed. Uses `Object.is` for dependency comparison. For derived reactive values, prefer Sinwan's native `computed()` — this hook exists for React-style compatibility.

**SSR:** Safe — memoization works the same on server.

**Reactivity:** Native (memoized by `deps` array using `Object.is`).

**Example:**

```tsx
import { useMemo, useState } from "sinwan/react-client";

// Expensive computation memoization
const SortedList = ({ items }: { items: string[] }) => {
  const [filter, setFilter] = useState("");

  const filteredAndSorted = useMemo(() => {
    // This expensive operation only runs when items or filter change
    console.log("Recomputing filtered list...");
    return items
      .filter((item) => item.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
  }, [items, filter]);

  return (
    <div>
      <input
        value={filter}
        onInput={(e) => setFilter(e.currentTarget.value)}
        placeholder="Filter items..."
      />
      <ul>
        {filteredAndSorted.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
};

// Object identity stability
const ChartConfig = ({ data, color }: { data: number[]; color: string }) => {
  // Without useMemo, this object would be new on every render,
  // causing child components to re-render unnecessarily
  const config = useMemo(
    () => ({
      dataset: data,
      style: { fill: color },
      computed: {
        average: data.reduce((a, b) => a + b, 0) / data.length,
        max: Math.max(...data),
      },
    }),
    [data, color],
  );

  return <Chart config={config} />;
};

// Complex data transformation
const DataTable = ({ rawData }: { rawData: any[] }) => {
  const [sortColumn, setSortColumn] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const processedData = useMemo(() => {
    return [...rawData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rawData, sortColumn, sortDirection]);

  return <Table data={processedData} />;
};
```

---

### `useCallback(fn, deps)`

**Signature:** `function useCallback<T extends (...args: any[]) => any>(callback: T, deps: GetterDependencyList): T`

**Description:** Returns a memoized callback function. The function reference remains stable as long as the dependencies haven't changed. Equivalent to `useMemo(() => fn, deps)`. Essential when passing callbacks to memoized child components to prevent unnecessary re-renders.

**SSR:** Safe — same behavior on server.

**Reactivity:** Native — equivalent to `useMemo(() => fn, deps)`.

**Example:**

```tsx
import { useCallback, useState, memo } from "sinwan/react-client";

// Child component that should only re-render when necessary
const ExpensiveButton = memo(
  ({ onClick, label }: { onClick: () => void; label: string }) => {
    console.log(`Rendering button: ${label}`);
    return <button onClick={onClick}>{label}</button>;
  },
);

const Parent = () => {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");

  // Without useCallback, this would be a new function every render,
  // causing ExpensiveButton to re-render even when count hasn't changed
  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []); // Empty deps = stable reference forever

  const decrement = useCallback(() => {
    setCount((c) => c - 1);
  }, []);

  // With parameter - function reference only changes when dependencies change
  const incrementBy = useCallback((amount: number) => {
    setCount((c) => c + amount);
  }, []); // Still stable because setCount is stable

  return (
    <div>
      <p>Count: {count}</p>
      <input value={text} onInput={(e) => setText(e.currentTarget.value)} />
      <ExpensiveButton onClick={increment} label="+1" />
      <ExpensiveButton onClick={decrement} label="-1" />
      <ExpensiveButton onClick={() => incrementBy(5)} label="+5" />
    </div>
  );
};

// Event handler with dependencies
const SearchInput = ({ onSearch }: { onSearch: (query: string) => void }) => {
  const [query, setQuery] = useState("");

  // Only recreate submit handler when query changes
  const handleSubmit = useCallback(
    (e: SubmitEvent) => {
      e.preventDefault();
      onSearch(query);
    },
    [query, onSearch],
  );

  return (
    <form onSubmit={handleSubmit}>
      <input value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
      <button type="submit">Search</button>
    </form>
  );
};
```

---

### `useId()`

**Signature:** `function useId(): string`

**Description:** Generates a unique ID that is stable across server and client renders. Built from `instance.uid + slot`, producing deterministic IDs like `:s1a:`, `:s1b:`. Server and client produce the same string for the same component instance, ensuring SSR markup hydrates without mismatch. Useful for associating labels with inputs, or any case requiring unique DOM IDs.

**SSR:** Safe — produces deterministic id derived from component instance uid + slot index.

**Reactivity:** Native — derived from `ComponentInstance.uid`.

**Example:**

```tsx
import { useId } from "sinwan/react-client";

// Label + input association
const TextField = ({
  label,
  ...props
}: { label: string } & Record<string, any>) => {
  const id = useId();

  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </div>
  );
};

// Multiple IDs in one component
const Form = () => {
  const nameId = useId();
  const emailId = useId();
  const phoneId = useId();

  return (
    <form>
      <div>
        <label htmlFor={nameId}>Name</label>
        <input id={nameId} name="name" />
      </div>
      <div>
        <label htmlFor={emailId}>Email</label>
        <input id={emailId} name="email" type="email" />
      </div>
      <div>
        <label htmlFor={phoneId}>Phone</label>
        <input id={phoneId} name="phone" type="tel" />
      </div>
    </form>
  );
};

// SSR-safe aria attributes
const Accordion = ({ title, children }: { title: string; children: any }) => {
  const sectionId = useId();
  const headerId = useId();

  return (
    <div>
      <button id={headerId} aria-expanded="false" aria-controls={sectionId}>
        {title}
      </button>
      <section id={sectionId} aria-labelledby={headerId}>
        {children}
      </section>
    </div>
  );
};
```

---

### `useContext(Context)`

**Signature:** `function useContext<T>(context: Context<T>): T`

**Description:** Accepts a context object (returned from `createContext`) and returns the current context value for that context. Delegates to Sinwan's `inject()` internally. The component will re-render when the nearest matching Provider above it updates. For React style, consider using `use(Context)` instead.

**SSR:** Safe — delegates to `inject()` for context reads.

**Reactivity:** Bridge — delegates to Sinwan's `inject()` via the context's private key.

**Example:**

```tsx
import { createContext, useContext, useState } from "sinwan/react-client";

// Create context
const ThemeContext = createContext({
  theme: "light",
  toggle: () => {},
});

// Provider component
const ThemeProvider = ({ children }: { children: any }) => {
  const [theme, setTheme] = useState("light");

  const value = {
    theme,
    toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// Consumer using useContext
const ThemedButton = ({ children }: { children: any }) => {
  const { theme, toggle } = useContext(ThemeContext);

  return (
    <button
      onClick={toggle}
      class={theme === "dark" ? "btn-dark" : "btn-light"}
    >
      {children}
    </button>
  );
};

// Nested context example
const UserContext = createContext({ name: "Guest", isLoggedIn: false });

const Header = () => {
  const { theme } = useContext(ThemeContext);
  const user = useContext(UserContext);

  return (
    <header class={`header ${theme}`}>
      <span>Welcome, {user.name}</span>
    </header>
  );
};

// Full app
const App = () => (
  <ThemeProvider>
    <UserContext.Provider value={{ name: "Alice", isLoggedIn: true }}>
      <Header />
      <ThemedButton>Toggle Theme</ThemedButton>
    </UserContext.Provider>
  </ThemeProvider>
);
```

---

### `useDebugValue(value, formatter?)`

**Signature:** `function useDebugValue<T>(value: T, formatter?: (value: T) => unknown): void`

**Description:** A development-only hook for displaying custom labels in debugging tools. In Sinwan, this is a no-op because there is no DevTools panel. Included for compatibility with React code that uses it.

**SSR:** Safe — no-op on both client and server.

**Reactivity:** Pass-through — no reactive behavior.

**Example:**

```tsx
import { useDebugValue, useState, useEffect } from "sinwan/react-client";

// Custom hook with debug value
const useUser = (userId: string) => {
  const [user, setUser] = useState<{ name: string } | null>(null);

  useDebugValue(user, (u) => u?.name ?? "(loading)");

  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  return user;
};

// Usage
const UserProfile = ({ userId }: { userId: string }) => {
  const user = useUser(userId);
  return user ? <h1>{user.name}</h1> : <div>Loading...</div>;
};
```

---

## Effect Hooks

> All effect hooks are **no-ops on the server** (matches React behavior).

### `useEffect(callback, deps?)`

**Signature:** `function useEffect(callback: EffectCallback, deps?: GetterDependencyList): void`

**Description:** Runs the callback after the component mounts (via microtask). The callback can return a cleanup function that runs when the component unmounts. The `deps` array is mostly cosmetic in Sinwan because setup runs only once per component instance. For value-driven re-runs, read a Sinwan `signal` or `computed` inside a Sinwan `effect()` instead.

**SSR:** Guarded — registers a no-op on the server (effect callbacks never fire during SSR).

**Reactivity:** Bridge — runs after mount, cleanup on unmount.

**Example:**

```tsx
import { useEffect, useState, useRef } from "sinwan/react-client";

// Basic subscription
const ChatRoom = ({ roomId }: { roomId: string }) => {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();

    // Cleanup function
    return () => {
      connection.disconnect();
    };
  }, [roomId]);

  return <div>Connected to {roomId}</div>;
};

// Document title update
const DocumentTitle = ({ title }: { title: string }) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = title;

    return () => {
      document.title = originalTitle;
    };
  }, [title]);

  return null;
};

// Event listener
const WindowSize = () => {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div>
      {size.width} x {size.height}
    </div>
  );
};

// Multiple effects
const Analytics = ({ userId }: { userId: string }) => {
  useEffect(() => {
    logEvent("page_view", { userId });
  }, [userId]);

  useEffect(() => {
    const sessionStart = Date.now();
    return () => {
      const duration = Date.now() - sessionStart;
      logEvent("session_end", { userId, duration });
    };
  }, [userId]);

  return null;
};
```

---

### `useLayoutEffect(callback, deps?)`

**Signature:** `function useLayoutEffect(callback: EffectCallback, deps?: GetterDependencyList): void`

**Description:** Synchronous variant of `useEffect` — runs immediately after mount, before the browser paints. Use for DOM measurements or mutations that must happen before the user sees the update. On the server, this is a no-op.

**SSR:** Guarded — no-op on server.

**Reactivity:** Bridge — synchronous variant of `useEffect`.

**Example:**

```tsx
import { useLayoutEffect, useRef, useState } from "sinwan/react-client";

// DOM measurement
const Tooltip = ({ children, content }: { children: any; content: string }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const tooltip = tooltipRef.current;
    if (!trigger || !tooltip) return;

    const rect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Position above the trigger
    setPosition({
      top: rect.top - tooltipRect.height - 8,
      left: rect.left + (rect.width - tooltipRect.width) / 2,
    });
  }, []);

  return (
    <>
      <div ref={triggerRef}>{children}</div>
      <div
        ref={tooltipRef}
        style={`position: fixed; top: ${position.top}px; left: ${position.left}px;`}
      >
        {content}
      </div>
    </>
  );
};

// Scroll restoration
const ScrollContainer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = scrollPosition;
    }
  }, [scrollPosition]);

  return <div ref={containerRef}>...</div>;
};
```

---

### `useInsertionEffect(callback, deps?)`

**Signature:** `function useInsertionEffect(callback: EffectCallback, deps?: GetterDependencyList): void`

**Description:** Fires synchronously before `useLayoutEffect`, designed for CSS-in-JS libraries that must inject `<style>` tags before any layout effect reads computed styles. All DOM mutations are guaranteed to have flushed before this runs. On the server, this is a no-op.

**SSR:** Guarded — no-op on server.

**Reactivity:** Bridge — fires synchronously ahead of `useLayoutEffect`.

**Example:**

```tsx
import { useInsertionEffect } from "sinwan/react-client";

// CSS-in-JS style injection
const useStyle = (css: string) => {
  useInsertionEffect(() => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, [css]);
};

// Component using CSS-in-JS
const StyledButton = ({ color }: { color: string }) => {
  const className = `btn-${color}`;

  useStyle(`
    .${className} {
      background: ${color};
      padding: 8px 16px;
      border-radius: 4px;
    }
  `);

  return <button class={className}>Click me</button>;
};

// Dynamic theme injection
const ThemeProvider = ({ theme }: { theme: Record<string, string> }) => {
  useInsertionEffect(() => {
    const css = Object.entries(theme)
      .map(([key, value]) => `--${key}: ${value};`)
      .join("\n");

    const style = document.createElement("style");
    style.textContent = `:root { ${css} }`;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, [theme]);

  return null;
};
```

---

### `useEffectEvent(fn)`

**Signature:** `function useEffectEvent<A extends any[], R>(fn: (...args: A) => R): (...args: A) => R`

**Description:** Returns a callback whose body always sees the latest closure values. Useful for reading fresh state inside an effect without listing it in dependencies. The function reference intentionally changes on every render — this acts as a runtime assertion so that incorrectly including it in a dependency array causes the effect to re-run every render, making the bug obvious.

**SSR:** Safe — stable callback, works on server.

**Reactivity:** Native — the body pointer is updated synchronously on every render, but the function identity is intentionally unstable.

**Example:**

```tsx
import { useEffectEvent, useEffect, useState } from "sinwan/react-client";

// Reading latest state in effect without dependency
const ChatRoom = ({ roomId }: { roomId: string }) => {
  const [messages, setMessages] = useState<string[]>([]);

  // onMessage always sees the latest messages without needing it as dependency
  const onMessage = useEffectEvent((msg: string) => {
    // This always reads the current messages array
    setMessages([...messages, msg]);
    console.log(`Total messages: ${messages.length + 1}`);
  });

  useEffect(() => {
    const ws = new WebSocket(`ws://chat/${roomId}`);
    ws.onmessage = (e) => onMessage(e.data);
    return () => ws.close();
  }, [roomId]); // Only re-subscribes when roomId changes!

  return (
    <ul>
      {messages.map((m, i) => (
        <li key={i}>{m}</li>
      ))}
    </ul>
  );
};

// Timer with fresh closure
const Timer = () => {
  const [count, setCount] = useState(0);
  const [delay, setDelay] = useState(1000);

  const tick = useEffectEvent(() => {
    setCount((c) => c + 1);
    console.log(`Tick at delay ${delay}ms`);
  });

  useEffect(() => {
    const id = setInterval(tick, delay);
    return () => clearInterval(id);
  }, [delay]); // Only recreates interval when delay changes

  return (
    <div>
      <p>Count: {count}</p>
      <input
        type="range"
        min="100"
        max="2000"
        value={delay}
        onInput={(e) => setDelay(Number(e.currentTarget.value))}
      />
    </div>
  );
};
```

---

## External Store Bridge

### `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)`

**Signature:** `function useSyncExternalStore<T>(subscribe: (onStoreChange: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T`

**Description:** The canonical bridge for reading external mutable stores from a component. Internally allocates a Sinwan signal that re-emits the snapshot whenever `subscribe` fires. Essential for integrating with non-Sinwan state management (Zustand, Redux, browser APIs) or when reading Sinwan signals from React-style hook components.

**SSR:** Safe — returns `getServerSnapshot()` when available, otherwise `getSnapshot()`.

**Reactivity:** Bridge — internally allocates a Sinwan signal that re-emits the snapshot whenever `subscribe` fires.

**Example:**

```tsx
import { useSyncExternalStore, signal } from "sinwan/react-client";

// Reading a Sinwan signal from React-style component
const counter = signal(0);

const CounterDisplay = () => {
  const value = useSyncExternalStore(
    (cb) => counter.subscribe(() => cb()),
    () => counter.peek(),
    () => counter.peek(), // server snapshot
  );

  return <span>{value}</span>;
};

// Browser API integration (online status)
const OnlineStatus = () => {
  const isOnline = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true, // assume online on server
  );

  return <div>{isOnline ? "🟢 Online" : "🔴 Offline"}</div>;
};

// External store wrapper
class ExternalStore<T> {
  private listeners = new Set<() => void>();
  constructor(private value: T) {}
  get = () => this.value;
  set = (v: T) => {
    this.value = v;
    this.listeners.forEach((l) => l());
  };
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

const store = new ExternalStore({ user: null as { name: string } | null });

const UserProfile = () => {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  return state.user ? (
    <div>Hello, {state.user.name}</div>
  ) : (
    <div>Not logged in</div>
  );
};
```

> **Reactivity rule:** When a value is owned by a Sinwan signal, this is the only sanctioned way to read it from a React-style hook component. Never call `signal.set(...)` and `setState(...)` against the same value.

---

## Concurrent / Transitions

### `useTransition()`

**Signature:** `function useTransition(): [boolean, TransitionStartFunction]`

**Description:** Returns a stateful value for the pending state of the transition, and a function to start the transition. `isPending` indicates when a transition is active. `startTransition` lets you mark state updates as non-blocking — async work toggles `isPending` while the returned promise is in flight. Sinwan's effects are synchronous, so transitions are best-effort wrappers around `nextTick` + `batch`.

**SSR:** Safe — `isPending` starts as `false`.

**Reactivity:** Bridge — uses Sinwan's `nextTick` + `batch`; no concurrent reconciler.

**Example:**

```tsx
import { useTransition, useState, Suspense } from "sinwan/react-client";

// Tab switching with loading state
const TabContainer = () => {
  const [tab, setTab] = useState("home");
  const [isPending, startTransition] = useTransition();

  const selectTab = (newTab: string) => {
    startTransition(() => {
      setTab(newTab);
    });
  };

  return (
    <div>
      <div style={{ opacity: isPending ? 0.7 : 1 }}>
        <TabButton active={tab === "home"} onClick={() => selectTab("home")}>
          Home
        </TabButton>
        <TabButton
          active={tab === "movies"}
          onClick={() => selectTab("movies")}
        >
          Movies
        </TabButton>
        <TabButton
          active={tab === "photos"}
          onClick={() => selectTab("photos")}
        >
          Photos
        </TabButton>
      </div>
      {isPending && <div class="spinner" />}
      <TabContent tab={tab} />
    </div>
  );
};

// Async data loading with transition
const SearchResults = ({ query }: { query: string }) => {
  const [results, setResults] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const search = async (newQuery: string) => {
    startTransition(async () => {
      const data = await fetchSearchResults(newQuery);
      setResults(data);
    });
  };

  return (
    <div>
      <input value={query} onInput={(e) => search(e.currentTarget.value)} />
      {isPending ? <div>Searching...</div> : <ResultsList items={results} />}
    </div>
  );
};
```

---

### `startTransition(callback)`

**Signature:** `function startTransition(callback: () => void | Promise<void>): void`

**Description:** Imperative version of `useTransition`. Marks state updates inside the callback as non-blocking transitions. Can be called outside of components. Runs the callback inside a Sinwan batch and tags the active transition so `addTransitionType` works.

**SSR:** Safe — executes callback synchronously on server.

**Reactivity:** Bridge — same transition semantics as `useTransition`.

**Example:**

```tsx
import { startTransition } from "sinwan/react-client";

// Navigation outside component
const navigate = (path: string) => {
  startTransition(() => {
    history.pushState(null, "", path);
    // Trigger route update
    routeSignal.value = path;
  });
};

// Form submission
const handleSubmit = async (formData: FormData) => {
  startTransition(async () => {
    await submitForm(formData);
    // Update UI after submission
    refreshData();
  });
};
```

---

### `useDeferredValue(value, initial?)`

**Signature:** `function useDeferredValue<T>(value: T, initialValue?: T): T`

**Description:** Returns a value that lags one Sinwan tick behind its input. Useful for keeping the UI responsive during expensive updates — show stale UI while fresh UI is computing. On the server, returns the input as-is (no deferral). The `initialValue` can provide a value for the initial render before `value` is first processed.

**SSR:** Safe — returns the input value as-is (no deferral on server).

**Reactivity:** Bridge — backed by a signal updated through the scheduler.

**Example:**

```tsx
import { useDeferredValue, useState } from "sinwan/react-client";

// Search with deferred results
const SearchPage = () => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  // Input updates immediately
  // Results only update after a tick (keeping input responsive)
  const isStale = query !== deferredQuery;

  return (
    <div>
      <input
        value={query}
        onInput={(e) => setQuery(e.currentTarget.value)}
        placeholder="Search..."
      />
      <div style={{ opacity: isStale ? 0.5 : 1 }}>
        <SearchResults query={deferredQuery} />
      </div>
    </div>
  );
};

// Expensive list rendering
const BigList = ({ items }: { items: string[] }) => {
  const deferredItems = useDeferredValue(items, []);

  return (
    <ul>
      {deferredItems.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};
```

---

### `useOptimistic(passthrough, reducer?)`

**Signature:** `function useOptimistic<S, A = S>(passthrough: S, reducer?: OptimisticReducer<S, A>): [S, (action: A) => void]`

**Description:** Returns `[optimisticState, addOptimistic]`. `addOptimistic(action)` applies the reducer immediately so the UI reflects the optimistic update before the server response settles. The optimistic state automatically resets to `passthrough` whenever the input changes (commonly when the underlying data refreshes). If no reducer is provided, the action replaces the state directly.

**SSR:** Safe — initial render returns `passthrough`.

**Reactivity:** Bridge — backed by a signal owned by the component.

**Example:**

```tsx
import { useOptimistic, useState, FormEvent } from "sinwan/react-client";

type Todo = { id: string; text: string; completed: boolean };

// Optimistic todo list
const TodoList = ({
  todos,
  addTodo,
}: {
  todos: Todo[];
  addTodo: (text: string) => Promise<void>;
}) => {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, newTodo],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const input = form.elements.namedItem("todo") as HTMLInputElement;
    const text = input.value;

    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text,
      completed: false,
    };

    // Optimistically add to UI immediately
    addOptimisticTodo(newTodo);

    // Clear input
    input.value = "";

    // Actually send to server
    try {
      await addTodo(text);
    } catch (err) {
      // On error, optimistic update is automatically reverted
      // when passthrough (todos) doesn't change
      alert("Failed to add todo");
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input name="todo" placeholder="Add todo..." />
        <button type="submit">Add</button>
      </form>
      <ul>
        {optimisticTodos.map((todo) => (
          <li key={todo.id} class={todo.completed ? "completed" : ""}>
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
};

// Optimistic like button
const LikeButton = ({
  postId,
  initialLikes,
  hasLiked,
  onLike,
}: {
  postId: string;
  initialLikes: number;
  hasLiked: boolean;
  onLike: () => Promise<void>;
}) => {
  const [optimisticState, addOptimistic] = useOptimistic(
    { likes: initialLikes, hasLiked },
    (state, action: "like" | "unlike") => ({
      likes: action === "like" ? state.likes + 1 : state.likes - 1,
      hasLiked: action === "like",
    }),
  );

  const handleClick = async () => {
    const action = optimisticState.hasLiked ? "unlike" : "like";
    addOptimistic(action);
    await onLike();
  };

  return (
    <button onClick={handleClick}>
      {optimisticState.hasLiked ? "❤️" : "🤍"} {optimisticState.likes}
    </button>
  );
};
```

---

### `useActionState(action, initialState, permalink?)`

**Signature:** `function useActionState<S, P>(action: ActionStateAction<S, P>, initialState: Awaited<S>, permalink?: string): [Awaited<S>, (payload: P) => void, boolean]`

**Description:** Returns `[state, formAction, isPending]`. The returned `formAction` calls the user-provided `action(currentState, payload)`, awaits the result, and updates the stored state with the result. `isPending` mirrors the awaiting status. Designed for form actions where each submission returns a new state (e.g., form validation responses). The optional `permalink` is accepted for API compatibility but currently unused.

**SSR:** Safe — initial render returns `[initialState, formAction, false]`.

**Reactivity:** Bridge — state and pending flag are signal-backed slots.

**Example:**

```tsx
import { useActionState, FormEvent } from "sinwan/react-client";

// Form with server action
async function submitForm(prevState: { message: string }, formData: FormData) {
  const email = formData.get("email") as string;

  // Simulate server validation
  await new Promise((r) => setTimeout(r, 1000));

  if (!email.includes("@")) {
    return { message: "Invalid email address" };
  }

  // Simulate saving
  return { message: `Subscribed: ${email}` };
}

const NewsletterForm = () => {
  const [state, formAction, isPending] = useActionState(submitForm, {
    message: "",
  });

  return (
    <form action={formAction as any}>
      <p>{state.message}</p>
      <input
        name="email"
        type="email"
        placeholder="Enter your email"
        disabled={isPending}
      />
      <button type="submit" disabled={isPending}>
        {isPending ? "Subscribing..." : "Subscribe"}
      </button>
    </form>
  );
};

// Counter action
const Counter = () => {
  const [count, dispatch, isPending] = useActionState(
    async (prev: number, action: "inc" | "dec") => {
      await new Promise((r) => setTimeout(r, 500)); // Simulate async
      return action === "inc" ? prev + 1 : prev - 1;
    },
    0,
  );

  return (
    <div>
      <p>Count: {count}</p>
      {isPending && <span>Updating...</span>}
      <button onClick={() => dispatch("inc")} disabled={isPending}>
        +
      </button>
      <button onClick={() => dispatch("dec")} disabled={isPending}>
        -
      </button>
    </div>
  );
};
```

---

## Imperative Handles

### `useImperativeHandle(ref, init, deps?)`

**Signature:** `function useImperativeHandle<T, R extends T>(ref: Ref<T> | null | undefined, init: () => R, deps?: GetterDependencyList): void`

**Description:** Exposes an imperative handle object on a parent-supplied ref. The `init` function returns the handle object, which is assigned to `ref.current` after mount. The handle is cleared (set to `null` or cleanup called) on unmount. Server-side: no-op because refs are not populated during SSR. Useful for exposing a limited API to parent components without full prop drilling.

**SSR:** Guarded — no-op on server (refs are not populated during SSR).

**Reactivity:** Native — plain ref population on mount.

**Example:**

```tsx
import { useImperativeHandle, useRef, forwardRef } from "sinwan/react-client";

// Custom input with focus method
interface InputHandle {
  focus: () => void;
  clear: () => void;
  value: string;
}

const FancyInput = forwardRef<InputHandle>((props, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        if (inputRef.current) inputRef.current.value = "";
      },
      get value() {
        return inputRef.current?.value ?? "";
      },
    }),
    [],
  );

  return <input ref={inputRef} class="fancy-input" {...props} />;
});

// Parent using imperative handle
const Form = () => {
  const inputRef = useRef<InputHandle>(null);

  return (
    <div>
      <FancyInput ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>Focus</button>
      <button onClick={() => inputRef.current?.clear()}>Clear</button>
    </div>
  );
};

// Canvas with drawing API
interface CanvasHandle {
  drawCircle: (x: number, y: number, radius: number) => void;
  clear: () => void;
  getImageData: () => ImageData | null;
}

const DrawingCanvas = forwardRef<CanvasHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useImperativeHandle(ref, () => {
    const getCtx = () => {
      if (!ctxRef.current && canvasRef.current) {
        ctxRef.current = canvasRef.current.getContext("2d");
      }
      return ctxRef.current;
    };

    return {
      drawCircle: (x, y, radius) => {
        const ctx = getCtx();
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      },
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = getCtx();
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      },
      getImageData: () => {
        const canvas = canvasRef.current;
        const ctx = getCtx();
        return canvas && ctx
          ? ctx.getImageData(0, 0, canvas.width, canvas.height)
          : null;
      },
    };
  }, []);

  return <canvas ref={canvasRef} width={400} height={300} />;
});
```

---

## Reactivity Decisions Cheat-Sheet

| Hook                                                        | Decision                             | Why                                                          |
| ----------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `useState`, `useReducer`, `useOptimistic`, `useActionState` | Bridge → signal slot                 | Local mutable state owned by the component.                  |
| `useMemo`, `useCallback`, `useRef`, `useDebugValue`         | Native                               | Pure / stable values; no signals needed.                     |
| `useEffect`, `useLayoutEffect`, `useInsertionEffect`        | Bridge → `onMounted` / `onUnmounted` | Lifecycle is owned by Sinwan's component instance.           |
| `useEffectEvent`                                            | Native (closure refresh)             | Non-stable identity; latest body via slot.                   |
| `useSyncExternalStore`                                      | Bridge → signal slot + subscribe     | Canonical external-state read.                               |
| `useTransition`, `startTransition`, `useDeferredValue`      | Bridge → scheduler                   | Use Sinwan's `nextTick` + `batch`; no concurrent reconciler. |
| `useId`                                                     | Native                               | Derived from `ComponentInstance.uid`.                        |
| `useContext`                                                | Bridge → `inject`                    | Provider → `provide`.                                        |
| `useImperativeHandle`                                       | Native                               | Plain ref population on mount.                               |
