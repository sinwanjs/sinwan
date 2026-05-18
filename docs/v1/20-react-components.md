# React Components & DOM APIs

> Status: **Phase 3 — complete.** All entries below are imported from `sinwan/react-client`.

---

## Components

### `<Profiler>`

**Signature:** `function Profiler(props: { id: string; onRender: ProfilerOnRender; children?: ReactNode }): SinwanElement`

**Description:** Measures timing information for React-subtree performance profiling. Records `performance.now()` deltas around setup + mount and forwards them to the `onRender` callback. The reported `phase` is `"mount"` once on initial render, then `"update"` whenever the inner subtree's `onUpdated` lifecycle fires. Sinwan does not maintain a fiber tree, so the profiler is a measurement shim.

**SSR:** Safe — no measurement on the server (callback never fires).

**Reactivity:** Native — timing measurement only, no reactive behavior.

**Example:**

```tsx
import { Profiler } from "sinwan/react-client";

const onRenderCallback: ProfilerOnRender = (
  id, // the "id" prop of the Profiler tree
  phase, // "mount" | "update" | "nested-update"
  actualDuration, // time spent rendering
  baseDuration, // estimated time to render the entire subtree
  startTime, // when React began rendering
  commitTime, // when React committed the update
) => {
  console.log(`[${id}] ${phase}: ${actualDuration.toFixed(2)}ms`);

  // Send to analytics
  analytics.track("render_timing", {
    component: id,
    phase,
    duration: actualDuration,
  });
};

const App = () => (
  <div>
    <Profiler id="App" onRender={onRenderCallback}>
      <Header />
      <Profiler id="Content" onRender={onRenderCallback}>
        <MainContent />
      </Profiler>
      <Footer />
    </Profiler>
  </div>
);

// Conditional profiling (only in development)
const ConditionalProfiler = ({
  id,
  children,
}: {
  id: string;
  children: any;
}) => {
  if (process.env.NODE_ENV === "production") {
    return children;
  }
  return (
    <Profiler
      id={id}
      onRender={(id, phase, duration) => {
        if (duration > 16) {
          console.warn(
            `Slow render detected: ${id} took ${duration.toFixed(2)}ms`,
          );
        }
      }}
    >
      {children}
    </Profiler>
  );
};
```

---

### `<StrictMode>`

**Signature:** `function StrictMode(props: { children?: ReactNode }): SinwanElement`

**Description:** A development-mode wrapper component for highlighting potential problems. In React, this enables additional checks and double-invocation of certain functions. In Sinwan, this is a passive passthrough — Sinwan has no concept of intentional double-invocation. Included for source-compatibility with React code.

**SSR:** Safe — no behavior change.

**Reactivity:** Pass-through — children render normally.

**Example:**

```tsx
import { StrictMode } from "sinwan/react-client";

const App = () => (
  <StrictMode>
    <Router>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
      <Footer />
    </Router>
  </StrictMode>
);

// Conditional strict mode
const DevApp = () =>
  process.env.NODE_ENV === "development" ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  );
```

---

### `<Suspense>`

**Signature:** `function Suspense(props: { fallback: ReactNode; children?: ReactNode }): SinwanElement`

**Description:** Allows components to "suspend" their rendering while loading async data. Renders the `fallback` when children contain pending promises (from `lazy()` or async components), then swaps in the resolved children when ready. Built on Sinwan's existing async-node support where `Promise<SinwanNode>` is a first-class node.

**SSR:** Safe — fallback markup is emitted synchronously; the streaming server flushes the resolved children later.

**Reactivity:** Bridge — uses a signal to swap fallback ↔ resolved content.

**Example:**

```tsx
import { Suspense, lazy } from "sinwan/react-client";

// Lazy-loaded components
const HeavyChart = lazy(() => import("./HeavyChart.tsx"));
const UserProfile = lazy(() => import("./UserProfile.tsx"));

// Basic usage
const Dashboard = () => (
  <div>
    <h1>Dashboard</h1>
    <Suspense fallback={<div>Loading chart...</div>}>
      <HeavyChart data={salesData} />
    </Suspense>
  </div>
);

// Nested Suspense boundaries
const App = () => (
  <Suspense fallback={<div class="page-loader">Loading app...</div>}>
    <Header />
    <Suspense fallback={<div class="content-loader">Loading content...</div>}>
      <main>
        <UserProfile userId={123} />
        <Suspense fallback={<div class="widget-loader">Loading widget...</div>}>
          <HeavyWidget />
        </Suspense>
      </main>
    </Suspense>
    <Footer />
  </Suspense>
);

// Error boundary + Suspense pattern
const SafeAsyncComponent = ({ component: Component, ...props }: any) => {
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return <ErrorDisplay error={error} />;
  }

  return (
    <Suspense fallback={<Spinner />}>
      <Component {...props} />
    </Suspense>
  );
};
```

---

### `<Activity>`

**Signature:** `function Activity(props: ActivityProps): SinwanElement`

Where `ActivityProps` is:

```ts
{
  mode?: "visible" | "hidden";
  children?: ReactNode;
}
```

**Description:** Controls the visibility of a subtree while preserving its state. When `mode="visible"`, children render normally. When `mode="hidden"`, children are wrapped in `<div hidden data-sinwan-activity="hidden">` — the subtree stays mounted (state is preserved) but is not painted. Useful for tab interfaces, off-screen navigation, or keeping expensive components warm.

**SSR:** Safe — hidden subtree is still emitted in HTML (matches React).

**Reactivity:** Pass-through — no reactive behavior, just conditional wrapping.

**State Preservation:** When switching from `visible` to `hidden` and back, component state (signals, refs, etc.) is preserved because the DOM nodes remain in the tree (just hidden via the `hidden` attribute).

**Example:**

```tsx
import { Activity } from "sinwan/react-client";

// Tab interface with preserved state
const TabContainer = () => {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div>
      <div className="tabs">
        <button onClick={() => setActiveTab("general")}>General</button>
        <button onClick={() => setActiveTab("advanced")}>Advanced</button>
        <button onClick={() => setActiveTab("debug")}>Debug</button>
      </div>

      <Activity mode={activeTab === "general" ? "visible" : "hidden"}>
        <GeneralSettings />
      </Activity>

      <Activity mode={activeTab === "advanced" ? "visible" : "hidden"}>
        <AdvancedSettings />
      </Activity>

      <Activity mode={activeTab === "debug" ? "visible" : "hidden"}>
        <DebugPanel />
      </Activity>
    </div>
  );
};

// Settings panel preserves scroll position, form state, etc.
const AdvancedSettings = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  // State persists even when hidden
  return (
    <div ref={containerRef} className="settings-panel">
      <h2>Advanced Settings</h2>
      <ExpensiveForm />
    </div>
  );
};
```

---

## Imperative APIs

### `createPortal(children, container, key?)`

**Signature:** `function createPortal(children: ReactNode, container: Node, key?: string | null): SinwanElement`

**Description:** Creates a portal — a way to render children into a DOM node that exists outside the DOM hierarchy of the parent component. Wraps Sinwan's existing `Portal` component. Children are mounted into `container` (typically `document.body` for modals, tooltips, etc.). The optional `key` is accepted for API compatibility.

**SSR:** Safe — Sinwan's Portal renders nothing on the server (deferred to the client just like React).

**Reactivity:** Pass-through — content renders into the specified container.

**Example:**

```tsx
import { createPortal, useState } from "sinwan/react-client";

// Modal portal
const Modal = ({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: any;
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <button class="modal-close" onClick={onClose}>
          ×
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
};

// Tooltip portal
const Tooltip = ({
  target,
  content,
}: {
  target: HTMLElement;
  content: string;
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position relative to viewport
  const rect = target.getBoundingClientRect();
  const tooltipTop = rect.top - 40;
  const tooltipLeft = rect.left + rect.width / 2;

  return createPortal(
    <div
      class="tooltip"
      style={`position: fixed; top: ${tooltipTop}px; left: ${tooltipLeft}px;`}
    >
      {content}
    </div>,
    document.body,
  );
};

// Toast notification system
const ToastContainer = () => {
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);

  const removeToast = (id: string) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  };

  const addToast = (message: string) => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => removeToast(id), 3000);
  };

  return createPortal(
    <div class="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} class="toast">
          {toast.message}
        </div>
      ))}
    </div>,
    document.body,
  );
};
```

---

### `flushSync(fn)`

**Signature:** `function flushSync<R>(fn: () => R): R`

**Description:** Forces synchronous flushing of all pending React/Sinwan work. Runs the provided function, then immediately drains Sinwan's effect queue. The DOM is guaranteed to be updated by the time this function returns. Useful for reading layout immediately after a state change. Throws on the server because there is no DOM to flush into.

**SSR:** Throws on server — DOM is not available during SSR.

**Reactivity:** Pass-through to Sinwan's scheduler.

**Example:**

```tsx
import { flushSync } from "sinwan/react-client";

// Read DOM immediately after state update
const MeasureAfterUpdate = () => {
  const [height, setHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const updateAndMeasure = () => {
    // Flush sync ensures DOM is updated before we measure
    flushSync(() => {
      setHeight((h) => h + 100);
    });

    // Now we can read the actual DOM height
    const actualHeight = contentRef.current?.getBoundingClientRect().height;
    console.log(`Measured height: ${actualHeight}px`);
  };

  return (
    <div>
      <div ref={contentRef} style={{ height: `${height}px` }}>
        Content
      </div>
      <button onClick={updateAndMeasure}>Grow & Measure</button>
    </div>
  );
};

// Force immediate update
const ImmediateInput = () => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: InputEvent) => {
    // Flush ensures the cursor position is maintained correctly
    flushSync(() => {
      setValue((e.target as HTMLInputElement).value);
    });
  };

  return <input ref={inputRef} value={value} onInput={handleChange} />;
};

// Testing utility
const triggerAndAssert = () => {
  let updatedValue: string;

  flushSync(() => {
    updateState();
  });

  // State is guaranteed to be flushed now
  updatedValue = getCurrentState();
  expect(updatedValue).toBe(expectedValue);
};
```

---

### `act(scope)`

**Signature:** `function act<T>(scope: () => T | Promise<T>): Promise<T>`

**Description:** A test helper that prepares a component for assertions. Runs `scope`, awaits any returned promise, drains microtasks, and flushes effects until quiescent. React-`act`-shaped enough for Bun's test runner. Wraps assertions in a way that ensures all pending updates have flushed before making assertions.

**SSR:** Safe — no-op flush on server.

**Reactivity:** Pass-through to Sinwan's scheduler.

**Example:**

```tsx
import { act, useState } from "sinwan/react-client";
import { test, expect } from "bun:test";

// Component to test
const Counter = () => {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span data-testid="count">{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
};

// Test using act
test("counter increments", async () => {
  const root = createRoot(container);

  await act(() => {
    root.render(<Counter />);
  });

  expect(container.querySelector("[data-testid='count']")?.textContent).toBe(
    "0",
  );

  const button = container.querySelector("button");

  await act(() => {
    button?.click();
  });

  expect(container.querySelector("[data-testid='count']")?.textContent).toBe(
    "1",
  );

  root.unmount();
});

// Async action test
test("async form submission", async () => {
  const Form = () => {
    const [status, setStatus] = useState("idle");

    const submit = async () => {
      setStatus("submitting");
      await new Promise((r) => setTimeout(r, 100));
      setStatus("success");
    };

    return (
      <form onSubmit={submit}>
        <span data-testid="status">{status}</span>
      </form>
    );
  };

  await act(async () => {
    root.render(<Form />);
    const form = container.querySelector("form");
    await form?.dispatchEvent(new SubmitEvent("submit"));
  });

  expect(container.querySelector("[data-testid='status']")?.textContent).toBe(
    "success",
  );
});
```

---

## Resource Hints

All resource hint APIs are idempotent and SSR-no-op (currently no-op on server; Phase 4 streaming SSR will collect them into the head).

### `preconnect(href, options?)`

**Signature:** `function preconnect(href: string, options?: { crossOrigin?: string }): void`

**Description:** Hints the browser to begin a connection handshake (DNS + TCP + TLS) to the origin of the specified URL. Useful for resources hosted on third-party domains. Injects a `<link rel="preconnect">` tag into `document.head`. Duplicate calls with identical arguments are no-ops.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { preconnect } from "sinwan/react-client";

// In app initialization
const initApp = () => {
  // Preconnect to CDN for faster font/asset loading
  preconnect("https://fonts.gstatic.com");
  preconnect("https://cdn.example.com");
  preconnect("https://api.example.com", { crossOrigin: "anonymous" });
};

// Component-level preconnect
const ExternalEmbed = () => {
  preconnect("https://www.youtube.com");

  return <iframe src="https://www.youtube.com/embed/..." />;
};
```

---

### `prefetchDNS(href)`

**Signature:** `function prefetchDNS(href: string): void`

**Description:** Hints the browser to perform DNS resolution for the origin of the specified URL. Lighter weight than `preconnect` — only performs DNS lookup without establishing the full connection. Injects a `<link rel="dns-prefetch">` tag.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { prefetchDNS } from "sinwan/react-client";

const App = () => {
  // Prefetch DNS for resources we might load later
  prefetchDNS("https://analytics.example.com");
  prefetchDNS("https://fonts.googleapis.com");

  return <div>...</div>;
};
```

---

### `preload(href, options)`

**Signature:** `function preload(href: string, options: PreloadOptions): void`

**Description:** Tells the browser to download and cache a resource with high priority. The `as` option is required and must be one of: `"audio"`, `"video"`, `"image"`, `"script"`, `"style"`, `"font"`, `"track"`, `"fetch"`. Additional options include `crossOrigin`, `integrity`, `type`, `fetchPriority`, `imageSrcSet`, and `imageSizes`.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { preload } from "sinwan/react-client";

// Preload critical font
const FontPreloader = () => {
  preload("/fonts/inter-var.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return null;
};

// Preload hero image with srcset
const ImagePreloader = ({ src, srcSet }: { src: string; srcSet: string }) => {
  preload(src, {
    as: "image",
    imageSrcSet: srcSet,
    imageSizes: "100vw",
    fetchPriority: "high",
  });

  return <img src={src} srcSet={srcSet} sizes="100vw" alt="Hero" />;
};

// Preload data fetch
const DataPreloader = () => {
  preload("/api/critical-data", {
    as: "fetch",
    crossOrigin: "same-origin",
  });

  return null;
};
```

---

### `preloadModule(href, options?)`

**Signature:** `function preloadModule(href: string, options?: PreloadModuleOptions): void`

**Description:** Preloads a JavaScript module. Injects a `<link rel="modulepreload">` tag. Supports `crossOrigin` and `integrity` options.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { preloadModule } from "sinwan/react-client";

const App = () => {
  // Preload critical modules
  preloadModule("/app/router.js");
  preloadModule("/app/i18n.js", { crossOrigin: "anonymous" });

  return <div>...</div>;
};
```

---

### `preinit(href, options)`

**Signature:** `function preinit(href: string, options: PreinitOptions): void`

**Description:** Eagerly loads and executes a script, or loads and applies a stylesheet. The `as` option must be either `"style"` or `"script"`. For styles, injects a `<link rel="stylesheet">`. For scripts, injects a `<script>` tag with `async`. Supports `precedence`, `crossOrigin`, `integrity`, `nonce`, and `fetchPriority` options.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { preinit } from "sinwan/react-client";

// Preinit critical CSS
const CriticalCSS = () => {
  preinit("/styles/critical.css", {
    as: "style",
    precedence: "high",
  });

  return null;
};

// Preinit script with nonce (for CSP)
const AnalyticsScript = ({ nonce }: { nonce: string }) => {
  preinit("https://analytics.example.com/script.js", {
    as: "script",
    crossOrigin: "anonymous",
    nonce,
    fetchPriority: "low",
  });

  return null;
};
```

---

### `preinitModule(href, options?)`

**Signature:** `function preinitModule(href: string, options?: PreinitModuleOptions): void`

**Description:** Eagerly loads and executes a JavaScript module. Injects a `<script type="module">` tag. Supports `crossOrigin`, `integrity`, and `nonce` options.

**SSR:** Guarded — no-op on server.

**Reactivity:** Pass-through.

**Example:**

```tsx
import { preinitModule } from "sinwan/react-client";

const App = () => {
  preinitModule("/app/lazy-feature.js");

  return <div>...</div>;
};
```

---

## Forms

### `useFormStatus()`

**Signature:** `function useFormStatus(): FormStatus`

Where `FormStatus` is:

```ts
{
  pending: boolean;
  data: FormData | null;
  method: string | null;
  action: string | ((formData: FormData) => void | Promise<void>) | null;
}
```

**Description:** Reads the status of the nearest enclosing `<Form>` action context. Returns information about the active form submission including whether it's pending, the submitted data, method, and action. Backed by a module-scope signal updated by the `<Form>` element wrapper.

**SSR:** Safe — always returns the not-pending sentinel.

**Reactivity:** Bridge — backed by a module-scope signal.

**Example:**

```tsx
import { useFormStatus } from "sinwan/react-client";

// Submit button with loading state
const SubmitButton = ({ children }: { children: any }) => {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Submitting..." : children}
    </button>
  );
};

// Form status display
const FormStatusDisplay = () => {
  const { pending, data, method } = useFormStatus();

  if (!pending) return null;

  return (
    <div class="form-status">
      <p>Submitting via {method}...</p>
      <p>
        Data:{" "}
        {data
          ? Array.from(data.entries())
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")
          : "none"}
      </p>
    </div>
  );
};

// Full form example
const ContactForm = () => {
  return (
    <Form
      action={async (formData) => {
        await submitContactForm(formData);
      }}
    >
      <input name="email" type="email" required />
      <textarea name="message" required />
      <FormStatusDisplay />
      <SubmitButton>Send Message</SubmitButton>
    </Form>
  );
};
```

---

### `<Form>`

**Signature:** `function Form(props: FormActionProps): SinwanElement`

Where `FormActionProps` extends standard form props plus:

```ts
{
  action?: string | ((formData: FormData) => void | Promise<void>);
  // ... other standard form attributes
}
```

**Description:** A form wrapper that honors React `action` prop behavior. When `action` is a string, it emits a native HTML form (browser handles the post). When `action` is a function, it intercepts submit, runs the action in a transition, drives `useFormStatus` (`pending: true` while in flight), and resets the form on success.

**SSR:** Safe — renders as native form on server.

**Reactivity:** Bridge — updates the form-status signal during submission.

**Example:**

```tsx
import { Form, useFormStatus } from "sinwan/react-client";

// Function action (client-side handling)
const SubscribeForm = () => {
  const [result, setResult] = useState<string>("");

  async function handleSubscribe(formData: FormData) {
    const email = formData.get("email") as string;

    // Simulate API call
    await new Promise((r) => setTimeout(r, 1000));

    setResult(`Subscribed: ${email}`);
  }

  return (
    <div>
      <Form action={handleSubscribe}>
        <input name="email" type="email" placeholder="Enter email" required />
        <SubmitButton>Subscribe</SubmitButton>
      </Form>
      {result && <p>{result}</p>}
    </div>
  );
};

// String action (traditional form post)
const TraditionalForm = () => {
  return (
    <Form action="/api/submit" method="POST">
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit">Submit</button>
    </Form>
  );
};

// With progressive enhancement
const ProgressiveForm = () => {
  const [optimisticState, addOptimistic] = useOptimistic(
    { submitted: false },
    (_, formData: FormData) => ({
      submitted: true,
      email: formData.get("email"),
    }),
  );

  async function action(formData: FormData) {
    addOptimistic(formData);
    await saveToServer(formData);
  }

  return (
    <Form action={action}>
      <input name="email" />
      <button disabled={optimisticState.submitted}>
        {optimisticState.submitted ? "Saving..." : "Save"}
      </button>
    </Form>
  );
};
```

---

### Form Element Wrappers

The following components are thin wrappers around native HTML elements, provided for source compatibility with React:

| Component  | Native Element | Notes                               |
| ---------- | -------------- | ----------------------------------- |
| `Input`    | `<input>`      | Passthrough                         |
| `Select`   | `<select>`     | Passthrough                         |
| `Textarea` | `<textarea>`   | Passthrough                         |
| `Option`   | `<option>`     | Passthrough                         |
| `Progress` | `<progress>`   | Passthrough                         |
| `Link`     | `<link>`       | Passthrough, typically for `<head>` |
| `Meta`     | `<meta>`       | Passthrough, typically for `<head>` |
| `Script`   | `<script>`     | Passthrough                         |
| `Style`    | `<style>`      | Passthrough                         |
| `Title`    | `<title>`      | Passthrough, typically for `<head>` |

**Example:**

```tsx
import { Input, Select, Textarea } from "sinwan/react-client";

const ContactForm = () => (
  <form>
    <Input name="name" placeholder="Your name" required />
    <Input name="email" type="email" placeholder="Your email" required />
    <Select name="topic">
      <Option value="general">General</Option>
      <Option value="support">Support</Option>
      <Option value="sales">Sales</Option>
    </Select>
    <Textarea name="message" rows={5} placeholder="Your message" />
    <button type="submit">Send</button>
  </form>
);
```

---

## Roots

### `createRoot(container, options?)`

**Signature:** `function createRoot(container: Element, options?: CreateRootOptions): Root`

Where `Root` is:

```ts
{
  render(children: ReactNode): void;
  unmount(): void;
}
```

**Description:** Creates a root for rendering React/Sinwan content into a DOM container. Returns an object with `render()` to mount/update content and `unmount()` to remove it. Backed by Sinwan's `mount()` function. Throws on the server because there is no DOM to mount into.

**SSR:** Throws on server — no DOM available during SSR.

**Reactivity:** Pass-through to Sinwan's `mount()`.

**Example:**

```tsx
import { createRoot } from "sinwan/react-client";

// Basic usage
const root = createRoot(document.getElementById("app")!);
root.render(<App />);

// With options (for compatibility)
const rootWithOptions = createRoot(document.getElementById("app")!, {
  identifierPrefix: "my-app-",
  onUncaughtError: (error) => console.error("Uncaught:", error),
  onRecoverableError: (error) => console.warn("Recoverable:", error),
});

// Re-render (unmounts previous content)
root.render(<App theme="dark" />);

// Cleanup
root.unmount();

// Error handling wrapper
const safeCreateRoot = (container: Element | null) => {
  if (!container) {
    throw new Error("Root container not found");
  }

  return createRoot(container, {
    onUncaughtError: (error) => {
      reportError(error);
      showErrorUI();
    },
  });
};
```

---

### `hydrateRoot(container, children, options?)`

**Signature:** `function hydrateRoot(container: Element, children: ReactNode, options?: CreateRootOptions): Root`

**Description:** Creates a root for hydrating server-rendered markup. Same shape as `createRoot`, but the first render uses Sinwan's `hydrate()` to attach event listeners to existing DOM nodes instead of creating new ones. The container should contain HTML that was rendered by `renderToString` or similar on the server.

**SSR:** Throws on server — hydration requires DOM.

**Reactivity:** Pass-through to Sinwan's `hydrate()`.

**Example:**

```tsx
import { hydrateRoot } from "sinwan/react-client";

// Hydrate server-rendered content
const root = hydrateRoot(document.getElementById("app")!, <App />);

// Subsequent renders update in place
root.render(<App theme="dark" />);

// Full hydration pattern
const hydrateApp = () => {
  const container = document.getElementById("app");

  if (!container) {
    // Fallback to client-side render if no server markup
    const root = createRoot(document.body);
    root.render(<App />);
    return;
  }

  // Check for SSR marker to decide between hydrate and render
  if (container.hasAttribute("data-server-rendered")) {
    hydrateRoot(container, <App />);
  } else {
    const root = createRoot(container);
    root.render(<App />);
  }
};

// Hydrate with error boundary
const SafeHydrate = () => {
  try {
    return hydrateRoot(container, <App />);
  } catch (error) {
    console.error("Hydration failed, falling back to render:", error);
    container.innerHTML = "";
    const root = createRoot(container);
    root.render(<App />);
    return root;
  }
};
```

---

## Reactivity Decisions Cheat-Sheet

| API                          | SSR                                            | Reactivity decision               |
| ---------------------------- | ---------------------------------------------- | --------------------------------- |
| `<Profiler>`                 | safe (no callback fires)                       | native (timing only)              |
| `<StrictMode>`               | safe                                           | pass-through                      |
| `<Suspense>`                 | safe (renders fallback)                        | bridge → signal swap              |
| `createPortal`               | safe (Sinwan Portal renders nothing on server) | pass-through                      |
| `flushSync`                  | throws on server                               | pass-through to Sinwan scheduler  |
| Resource hints               | guarded (no-op)                                | pass-through                      |
| `useFormStatus` / `<Form>`   | safe (returns not-pending)                     | bridge → module signal            |
| Element wrappers             | safe                                           | pass-through                      |
| `createRoot` / `hydrateRoot` | throws on server                               | pass-through to `mount`/`hydrate` |
| `act`                        | safe                                           | pass-through to scheduler         |
