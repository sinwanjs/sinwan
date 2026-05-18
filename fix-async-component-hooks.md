# Fix Proposal: React Hooks in Async Components

## Problem

React-compatible hooks from `sinwan/react-client` (e.g., `useState`, `useEffect`) do not work in async components. When a component is defined as `async` and uses `await`, the component instance context is lost after the await, causing hooks to throw:

```tsx
import { useState } from "sinwan/react-client";

const Counter = cc(async () => {
  const [count, setCount] = useState(0); // ❌ Error: Hook called outside of component setup
  const data = await fetch("/api/data");
  return <div>{count()}</div>;
});
```

### Root Cause

The React bridge hooks call `getSlots()` which calls `getCurrentInstance()`. After an `await` in an async function, the function suspends and resumes, but the component instance context stored in a global slot is not preserved across the async boundary. When the function resumes, `getCurrentInstance()` returns `null`, causing the hook to throw.

This also affects Sinwan lifecycle hooks (`onMounted`, `onUpdated`, `onUnmounted`, etc.) when called after `await`.

## Suggested Fix

Preserve the component instance context across async boundaries by tracking the instance associated with async promises and restoring it when the promise continuation runs.

### Implementation Approach

Modify `src/component/instance.ts` to:

1. **Track async instances**: Store a mapping from promises to their component instances
2. **Restore context on resume**: When a promise continuation runs, restore the associated instance context
3. **Clean up on completion**: Remove the mapping when the promise settles

### Code Changes

```ts
// src/component/instance.ts

// Add async instance tracking
const asyncInstanceMap = new WeakMap<Promise<any>, ComponentInstance>();

/**
 * Wrap an async function to preserve component instance context across await boundaries.
 */
export async function withAsyncContext<T>(
  fn: () => Promise<T>,
  instance: ComponentInstance,
): Promise<T> {
  const promise = fn();
  asyncInstanceMap.set(promise, instance);

  // Restore context when the promise chain continues
  const originalThen = promise.then.bind(promise);
  promise.then = function (onFulfilled, onRejected) {
    const wrappedOnFulfilled = onFulfilled
      ? (value: T) => {
          const prevInstance = currentInstance;
          currentInstance = asyncInstanceMap.get(promise) || null;
          try {
            return onFulfilled(value);
          } finally {
            currentInstance = prevInstance;
          }
        }
      : undefined;

    const wrappedOnRejected = onRejected
      ? (reason: any) => {
          const prevInstance = currentInstance;
          currentInstance = asyncInstanceMap.get(promise) || null;
          try {
            return onRejected(reason);
          } finally {
            currentInstance = prevInstance;
          }
        }
      : undefined;

    const chained = originalThen(wrappedOnFulfilled, wrappedOnRejected);

    // Propagate context to chained promises
    if (chained instanceof Promise) {
      asyncInstanceMap.set(chained, instance);
    }

    return chained;
  };

  try {
    return await promise;
  } finally {
    asyncInstanceMap.delete(promise);
  }
}

// Modify getCurrentInstance to check async map
export function getCurrentInstance(): ComponentInstance | null {
  // First check if we're in an async continuation
  // This requires tracking the current executing promise
  // For simplicity, we'd need to integrate with the scheduler or use async hooks

  return currentInstance;
}
```

### Alternative: Async Hooks API

A simpler alternative is to use native async/await tracking with a more modern approach:

```ts
// Use AsyncLocalStorage if available (Node.js 16+, modern browsers)
// or a polyfill for cross-platform support

import { AsyncLocalStorage } from "async_hooks";

const instanceContext = new AsyncLocalStorage<ComponentInstance>();

export function withAsyncContext<T>(
  fn: () => Promise<T>,
  instance: ComponentInstance,
): Promise<T> {
  return instanceContext.run(instance, fn);
}

export function getCurrentInstance(): ComponentInstance | null {
  return instanceContext.getStore() || currentInstance;
}
```

### Integration with cc

Modify `src/component/create.ts` to automatically wrap async component functions:

```ts
export function cc<P extends object = {}, R = SinwanNode>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => R,
): SinwanComponent<P> {
  const component: SinwanComponent<P> = (props) => {
    const instance = createComponentInstance(component, props, parent);
    setCurrentInstance(instance);

    let result;
    try {
      const fnResult = fn(props as any);

      // If the function returned a promise, wrap it with context preservation
      if (fnResult instanceof Promise) {
        result = withAsyncContext(() => fnResult, instance);
      } else {
        result = fnResult;
      }
    } finally {
      setCurrentInstance(null);
    }

    return renderComponent(result, instance) as any;
  };

  component._SinwanComponent = true;
  component._displayName = fn.name || "AnonymousComponent";
  return component;
}
```

## Trade-offs

### Pros

- Enables React hooks in async components
- Maintains API compatibility with React mental model
- More flexible for async data fetching patterns

### Cons

- **Complexity**: Adds significant complexity to instance tracking
- **Performance**: Promise wrapping and context restoration has overhead (only for async components)
- **Debugging**: Async context can make stack traces harder to follow
- **Testing**: Requires extensive testing across all async patterns
- **Memory**: WeakMap usage adds minimal overhead but needs monitoring

### Performance Impact for Non-Async Components

**Zero impact** if implemented correctly. The fix only applies context preservation when a component function returns a promise:

```ts
export function cc<P extends object = {}, R = SinwanNode>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => R,
): SinwanComponent<P> {
  const component: SinwanComponent<P> = (props) => {
    const instance = createComponentInstance(component, props, parent);
    setCurrentInstance(instance);

    let result;
    try {
      const fnResult = fn(props as any);

      // Only wrap if the function returned a promise
      // Sync components: fnResult is not a promise → no overhead
      // Async components: fnResult is a promise → context preservation applied
      if (fnResult instanceof Promise) {
        result = withAsyncContext(() => fnResult, instance);
      } else {
        result = fnResult;
      }
    } finally {
      setCurrentInstance(null);
    }

    return renderComponent(result, instance) as any;
  };

  component._SinwanComponent = true;
  component._displayName = fn.name || "AnonymousComponent";
  return component;
}
```

The `instanceof Promise` check is a simple type check with negligible overhead. Sync components will never enter the async context preservation path, so there is:

- No WeakMap operations
- No promise wrapping
- No context restoration
- No memory overhead for the WeakMap (empty for sync apps)

The performance impact is **isolated to async components only**.

## Current Workaround

Until this fix is implemented, the recommended approach is to use Sinwan's native signals:

```tsx
import { signal } from "sinwan";

const Counter = cc(async () => {
  const count = signal(0); // ✅ Works in async components
  const data = await fetch("/api/data");
  return <div>{count}</div>;
});
```

For lifecycle hooks, call them before any `await`:

```tsx
const Counter = cc(async () => {
  const count = signal(0);

  onUpdated(() => {
    console.log("updated", count.value);
  }); // ✅ Call before await

  const data = await fetch("/api/data");

  return <div>{count}</div>;
});
```

## Recommendation

Given the complexity and performance implications, **the signal-based workaround is recommended for most use cases**. The async context preservation fix should only be pursued if:

1. There is strong user demand for React hooks in async components
2. The performance impact is acceptable after benchmarking
3. The implementation can be thoroughly tested across edge cases

## Implementation Checklist

- [ ] Research AsyncLocalStorage availability and polyfill options
- [ ] Implement context preservation in instance.ts
- [ ] Modify cc to wrap async functions
- [ ] Add tests for hooks in async components
- [ ] Add tests for lifecycle hooks after await
- [ ] Benchmark performance impact
- [ ] Update documentation
- [ ] Add migration guide if breaking changes
