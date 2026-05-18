# React Unstable APIs

> Status: **Phase 6 — complete.** Imported from `sinwan/react-client`.

These APIs mirror React `unstable_*` exports. Their semantics may change — they are intentionally namespaced to indicate experimental status.

---

## `unstable_ViewTransition`

**Signature:** `function unstable_ViewTransition(props: ViewTransitionProps): SinwanElement`

Where `ViewTransitionProps` is:

```ts
{
  name?: string;
  children?: ReactNode;
}
```

**Description:** A marker component for the View Transitions API. The component itself is a transparent passthrough — it renders children normally without modification. It exists for source compatibility with React code and as a marker for tooling that may support view transitions in the future.

**SSR:** Safe — passthrough on server.

**Reactivity:** Pass-through — no reactive behavior.

**Example:**

```tsx
import {
  unstable_ViewTransition as ViewTransition,
  unstable_startViewTransition as startViewTransition,
} from "sinwan/react-client";

// Page transitions
const Router = () => {
  const [route, setRoute] = useState("/home");

  const navigate = (newRoute: string) => {
    startViewTransition(() => {
      setRoute(newRoute);
    });
  };

  return (
    <div>
      <nav>
        <button onClick={() => navigate("/home")}>Home</button>
        <button onClick={() => navigate("/about")}>About</button>
      </nav>

      <ViewTransition name="page">
        <PageContent key={route} route={route} />
      </ViewTransition>
    </div>
  );
};

// Image gallery with transitions
const Gallery = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectImage = (id: string) => {
    startViewTransition(() => {
      setSelectedId(id);
    });
  };

  return (
    <div>
      {selectedId ? (
        <ViewTransition name="image-detail">
          <ImageDetail
            id={selectedId}
            onClose={() => startViewTransition(() => setSelectedId(null))}
          />
        </ViewTransition>
      ) : (
        <ViewTransition name="image-grid">
          <ImageGrid onSelect={selectImage} />
        </ViewTransition>
      )}
    </div>
  );
};

// Conditional view transition wrapper
const ConditionalViewTransition = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: any;
}) => {
  if (!enabled || !CSS.supports("view-transition-name", "test")) {
    return children;
  }
  return <ViewTransition>{children}</ViewTransition>;
};
```

---

## `unstable_startViewTransition`

**Signature:** `function unstable_startViewTransition(callback: () => void | Promise<void>): { finished: Promise<void> }`

**Description:** Initiates a view transition using the browser's View Transitions API. Calls `document.startViewTransition` when supported and falls back to a synchronous run of the callback otherwise. The returned `finished` promise resolves when the transition completes (or immediately in the fallback case). SSR returns a resolved promise since there is no DOM.

**Returns:** `{ finished: Promise<void> }` — resolves when transition completes.

**SSR:** Safe — returns resolved promise (synchronous fallback).

**Reactivity:** Pass-through — wraps callback in transition when supported.

**Example:**

```tsx
import { unstable_startViewTransition as startViewTransition } from "sinwan/react-client";

// Navigation with view transition
const Navigation = ({ onNavigate }: { onNavigate: (path: string) => void }) => {
  const handleClick = (path: string) => {
    const transition = startViewTransition(async () => {
      // Preload data before transition
      await prefetchRouteData(path);

      // Update UI
      onNavigate(path);
    });

    // Optional: wait for transition
    transition.finished.then(() => {
      console.log("Navigation transition complete");
    });
  };

  return (
    <nav>
      <button onClick={() => handleClick("/home")}>Home</button>
      <button onClick={() => handleClick("/products")}>Products</button>
      <button onClick={() => handleClick("/contact")}>Contact</button>
    </nav>
  );
};

// Form submission with loading transition
const SubmitButton = ({ onSubmit }: { onSubmit: () => Promise<void> }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const transition = startViewTransition(async () => {
      setIsSubmitting(true);
      await onSubmit();
      setIsSubmitting(false);
    });

    await transition.finished;
  };

  return (
    <button onClick={handleSubmit} disabled={isSubmitting}>
      {isSubmitting ? "Submitting..." : "Submit"}
    </button>
  );
};

// Multi-step animation sequence
const AnimatedSequence = () => {
  const [step, setStep] = useState(1);

  const advanceStep = async () => {
    // First transition: fade out
    const t1 = startViewTransition(() => {
      setStep((s) => s + 0.5); // Intermediate state
    });
    await t1.finished;

    // Second transition: fade in new content
    const t2 = startViewTransition(() => {
      setStep((s) => Math.ceil(s));
    });
    await t2.finished;
  };

  return (
    <div>
      <div class={`step-${step}`}>Step {Math.floor(step)} content</div>
      <button onClick={advanceStep}>Next Step</button>
    </div>
  );
};

// Feature detection helper
const supportsViewTransitions = () => {
  return typeof document !== "undefined" && "startViewTransition" in document;
};

// Safe wrapper with fallback
const safeStartViewTransition = (callback: () => void | Promise<void>) => {
  if (supportsViewTransitions()) {
    return startViewTransition(callback);
  }

  // Fallback: run callback synchronously
  const result = callback();
  return {
    finished: Promise.resolve(result).then(() => undefined),
  };
};
```

---

## SSR Safety / Reactivity

| API                            | SSR                         | Reactivity decision |
| ------------------------------ | --------------------------- | ------------------- |
| `unstable_ViewTransition`      | safe (passthrough)          | pass-through        |
| `unstable_startViewTransition` | safe (synchronous fallback) | pass-through        |

---

## Best Practices for Unstable APIs

### When to Use Each API

- **`unstable_ViewTransition`**: Use as a marker for potential future tooling support. Currently has no runtime effect beyond being a passthrough.

- **`unstable_startViewTransition`**: Use for smooth page transitions when the browser supports the View Transitions API. Always include fallback behavior since support is not universal.

### Feature Detection

```tsx
// Check for View Transitions support
const hasViewTransitions =
  typeof document !== "undefined" && "startViewTransition" in document;

// Check for Activity support (passthrough in Sinwan)
const hasActivity = true; // Always available in Sinwan

// Progressive enhancement pattern
const App = () =>
  hasViewTransitions ? (
    <ViewTransitionWrapper>
      <Content />
    </ViewTransitionWrapper>
  ) : (
    <Content />
  );
```

### Migration Strategy

When these APIs stabilize:

- **ViewTransition**: Will likely become `<ViewTransition>` without prefix
- **startViewTransition**: Will likely become `startViewTransition()` without prefix
  Use search-and-replace or codemods when upgrading to remove `unstable_` prefixes.
