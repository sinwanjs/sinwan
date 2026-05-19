# Context Loss with Async Operations

> **Why setTimeout, setInterval, and event listeners lose component instance context**

## The Problem

When you use `setTimeout`, `setInterval`, or register event listeners directly in a Sinwan component, the callback runs outside the component's setup context. This causes React hooks and Sinwan lifecycle hooks to fail because they can't access the component instance.

```tsx
// ❌ FAILS - Context lost
const WrongComponent = cc(async () => {
  const [count, setCount] = useState(0);

  setTimeout(() => {
    setCount(10); // Error: Hook called outside of component setup
  }, 100);

  return <div>{count}</div>;
});
```

## Why This Happens

### Component Instance Context

Sinwan tracks the current component instance using a global variable (`currentInstance`). This is set during component setup:

```ts
// Simplified internal implementation
let currentInstance: ComponentInstance | null = null;

function cc(fn) {
  return (props) => {
    const instance = createComponentInstance();
    currentInstance = instance;
    try {
      return fn(props);
    } finally {
      currentInstance = null; // Context cleared after setup
    }
  };
}
```

### Async Components and Context

In async components, the context is maintained during the async function execution:

```ts
// Async component maintains context
const AsyncComponent = cc(async () => {
  const [count, setCount] = useState(0); // ✅ Context available
  
  await someAsyncOperation(); // ✅ Context still available
  
  setCount(10); // ✅ Context available
  
  return <div>{count}</div>;
});
```

### Why setTimeout Loses Context

`setTimeout` schedules a callback to run later, after the component setup has completed:

```ts
const WrongComponent = cc(async () => {
  const [count, setCount] = useState(0); // Context available
  
  setTimeout(() => {
    // This runs LATER, after component setup is done
    // currentInstance is now null
    setCount(10); // ❌ Context lost
  }, 100);
  
  // Component setup completes here
  // currentInstance is cleared
  
  return <div>{count}</div>;
});
```

**Timeline:**
1. Component setup starts → `currentInstance = instance`
2. `useState` called → works (context available)
3. `setTimeout` scheduled → callback queued for later
4. Component setup completes → `currentInstance = null`
5. Component returns
6. **100ms later**: setTimeout callback runs → `currentInstance` is null → hooks fail

### Same Issue with Other Operations

**Event listeners:**
```tsx
const WrongComponent = cc(() => {
  const [count, setCount] = useState(0);

  button.addEventListener("click", () => {
    setCount(10); // ❌ Runs later, context lost
  });

  return <button>{count}</button>;
});
```

**setInterval:**
```tsx
const WrongComponent = cc(() => {
  const [count, setCount] = useState(0);

  setInterval(() => {
    setCount(10); // ❌ Runs later, context lost
  }, 1000);

  return <div>{count}</div>;
});
```

**Promise.then:**
```tsx
const WrongComponent = cc(() => {
  const [count, setCount] = useState(0);

  Promise.resolve().then(() => {
    setCount(10); // ❌ Runs later, context lost
  });

  return <div>{count}</div>;
});
```

## Solutions

### 1. Use `await` for Async Operations

For delays and async operations in the component body, use `await` instead of `setTimeout`:

```tsx
// ✅ CORRECT - Maintains context with await
const CorrectAsync = cc(async () => {
  const [count, setCount] = useState(0);

  await new Promise((resolve) => setTimeout(resolve, 100));

  setCount(10); // ✅ Context still available

  return <div>{count}</div>;
});
```

**Why this works:** The `await` pauses execution but keeps the async function active, so the context is maintained.

### 2. Use `onMounted` for Side Effects

For operations that should run after the component mounts, use `onMounted`:

```tsx
import { onMounted } from "sinwan/component";

const WithEffect = cc(() => {
  const count = signal(0);

  onMounted(() => {
    setTimeout(() => {
      count.value = 10; // ✅ Works - onMounted has instance context
    }, 100);
  });

  return <div>{count}</div>;
});
```

**Why this works:** `onMounted` registers a callback that's bound to the specific component instance. When it runs, it sets `currentInstance` to that instance before executing the callback.

### 3. Use `effect` for Reactive Side Effects

For side effects that should run when dependencies change:

```tsx
import { effect } from "sinwan/reactivity";

const WithReactiveEffect = cc(() => {
  const count = signal(0);
  const doubled = signal(0);

  effect(() => {
    doubled.value = count.value * 2; // ✅ Runs with context
  });

  return <div>{doubled}</div>;
});
```

**Why this works:** `effect` runs in a context that has access to the signals it tracks.

### 4. Event Listeners in Lifecycle Hooks

Register event listeners in `onMounted` and clean up in `onUnmounted`:

```tsx
import { onMounted, onUnmounted } from "sinwan/component";

const WithEventListener = cc(() => {
  const windowWidth = signal(window.innerWidth);

  onMounted(() => {
    const handleResize = () => {
      windowWidth.value = window.innerWidth; // ✅ Works
    };

    window.addEventListener("resize", handleResize);

    // Cleanup to prevent memory leaks
    onUnmounted(() => {
      window.removeEventListener("resize", handleResize);
    });
  });

  return <div>Width: {windowWidth}</div>;
});
```

## Technical Deep Dive

### How Sinwan Tracks Context

Sinwan uses a stack-based context system similar to React:

```ts
// Internal implementation
let instanceStack: ComponentInstance[] = [];

function setCurrentInstance(instance: ComponentInstance | null) {
  if (instance) {
    instanceStack.push(instance);
  } else {
    instanceStack.pop();
  }
}

function getCurrentInstance(): ComponentInstance | null {
  return instanceStack[instanceStack.length - 1] || null;
}
```

### Async Components Maintain Context

Async components keep the context on the stack during the entire async operation:

```ts
// How async components work
async function runAsyncComponent(fn, instance) {
  setCurrentInstance(instance);
  try {
    const result = await fn(); // Context maintained during await
    return result;
  } finally {
    setCurrentInstance(null);
  }
}
```

### Why setTimeout Breaks This

`setTimeout` breaks the synchronous execution flow:

```ts
// What happens with setTimeout
function componentSetup(instance) {
  setCurrentInstance(instance);
  
  setTimeout(() => {
    // This runs in a new call stack
    // instanceStack is empty here
    getCurrentInstance(); // returns null
  }, 100);
  
  setCurrentInstance(null); // Context cleared immediately
}
```

## Comparison with React

React has the same issue with hooks, but handles it differently:

```tsx
// React - useEffect solves this
const ReactComponent = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCount(10); // ✅ Works in React
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  return <div>{count}</div>;
};
```

Sinwan's equivalent is `onMounted` for one-time effects and `effect` for reactive effects.

## Best Practices Summary

| Operation | Where to Use | Why |
|-----------|--------------|-----|
| Async delays | `await` in component body | Maintains context |
| Side effects on mount | `onMounted` | Has instance context |
| Reactive side effects | `effect` | Tracks dependencies |
| Event listeners | `onMounted` + `onUnmounted` | Proper cleanup |
| Intervals | `onMounted` + cleanup | Prevents memory leaks |
| API calls | `await` in component body | Maintains context |
| DOM mutations | `onMounted` | After DOM is ready |

## Common Mistakes

### ❌ Don't use setTimeout in component body

```tsx
const Wrong = cc(() => {
  setTimeout(() => doSomething(), 100); // ❌ Context lost
});
```

### ✅ Use await instead

```tsx
const Right = cc(async () => {
  await new Promise(r => setTimeout(r, 100)); // ✅ Context maintained
  doSomething();
});
```

### ❌ Don't add event listeners directly

```tsx
const Wrong = cc(() => {
  button.onClick = () => setState(10); // ❌ Context lost
});
```

### ✅ Use onMounted

```tsx
const Right = cc(() => {
  onMounted(() => {
    button.onClick = () => setState(10); // ✅ Has context
  });
});
```

## Conclusion

Context loss with `setTimeout` and similar operations is a fundamental limitation of how component instance tracking works. The key insight is:

- **Component setup**: Context available
- **After setup completes**: Context cleared
- **Delayed callbacks**: Run after setup → no context

The solution is to use the appropriate lifecycle hook (`onMounted`, `effect`) or use `await` to keep the async operation within the setup context.
