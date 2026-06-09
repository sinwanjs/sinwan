# Event Bus

Sinwan provides a built-in event bus system for decoupled component communication. It supports global events, component-scoped listeners with automatic cleanup, namespace patterns, and SSR-safe isolation.

## Overview

The event bus allows components to communicate without direct parent-child relationships. It's particularly useful for:

- Cross-component communication (e.g., auth notifications, toast messages)
- Global signals (socket messages, route changes)
- Decoupled architecture patterns

## Core API

### SinwanEventBus

The core event bus class with full API support.

```typescript
import { SinwanEventBus } from "sinwan/event";

const bus = new SinwanEventBus();

// Subscribe to an event
const unsubscribe = bus.on("user:login", (data) => {
  console.log("User logged in:", data);
});

// Emit an event
bus.emit("user:login", { id: 1, name: "Alice" });

// Unsubscribe manually
unsubscribe();

// Subscribe to namespace patterns
bus.onNamespace("chat:*", (event, data) => {
  console.log("Chat event:", event, data);
});

// Emit - matches "chat:message", "chat:typing", etc.
bus.emit("chat:message", { text: "Hello" });
bus.emit("chat:typing", { userId: 1 });

// One-time listener
bus.once("app:init", () => {
  console.log("App initialized");
});

// Check listeners
bus.listenerCount("user:login"); // 2
bus.hasListeners("user:login"); // true

// Clear listeners
bus.clear("user:login"); // Clear specific event
bus.clear(); // Clear all events
```

### Global Event Bus

A singleton instance for app-wide events.

```typescript
import { globalEventBus } from "sinwan/event";

// Use anywhere in your app
globalEventBus.emit("toast:show", { message: "Success!" });
globalEventBus.on("toast:show", (toast) => {
  // Handle toast
});
```

## Component Hooks

### useEvent

Subscribe to events within a component with automatic cleanup on unmount.

```typescript
import { cc } from "sinwan/component";
import { useEvent } from "sinwan/event";

const UserProfile = cc(() => {
  useEvent("user:login", (user) => {
    console.log("User logged in:", user);
  });

  return <div>User Profile</div>;
});
```

### useEventNamespace

Subscribe to namespace patterns within a component.

```typescript
import { cc } from "sinwan/component";
import { useEventNamespace } from "sinwan/event";

const ChatComponent = cc(() => {
  useEventNamespace("chat:*", (event, data) => {
    console.log("Chat event:", event, data);
  });

  return <div>Chat</div>;
});
```

### useEventOnce

Subscribe to an event that fires only once.

```typescript
import { cc } from "sinwan/component";
import { useEventOnce } from "sinwan/event";

const InitializeApp = cc(() => {
  useEventOnce("app:init", () => {
    console.log("App initialized - runs once");
  });

  return <div>App</div>;
});
```

## Namespace Patterns

The event bus supports wildcard patterns for flexible subscriptions.

### Basic Patterns

```typescript
bus.onNamespace("user:*", handler); // Matches "user:login", "user:logout"
bus.onNamespace("chat:*", handler); // Matches "chat:message", "chat:typing"
bus.onNamespace("*", handler); // Matches all events
```

### Pattern Matching Rules

- `*` matches any event
- `prefix:*` matches any event starting with `prefix:`
- Exact match required if no wildcard present

```typescript
bus.onNamespace("user:*", handler);
bus.emit("user:login", data); // ✓ Matches
bus.emit("user:logout", data); // ✓ Matches
bus.emit("other:event", data); // ✗ No match
```

## SSR Safety

The event bus provides SSR-safe context isolation to prevent cross-request memory leaks.

### Server-Side Usage

```typescript
import { createSSRContext, withSSRContext } from "sinwan/event";
import { renderToString } from "sinwan/server";

// Create a fresh context for each request
const context = createSSRContext();

// Render with isolated event bus
withSSRContext(context, () => {
  const html = renderToString(App);
});

// Context is automatically cleaned up after request
```

### Request-Scoped Event Bus

Each SSR context gets its own event bus instance:

```typescript
const context = createSSRContext();
context.eventBus.emit("request:event", data); // Isolated to this request
```

## Best Practices

### When to Use Event Bus

**Good use cases:**

- Cross-component communication (far apart in tree)
- Global signals (auth, notifications, socket messages)
- Decoupled architecture patterns
- Toast notifications, modal triggers

**Avoid when:**

- Simple parent-child communication → use props
- UI state synchronization → use signals/stores
- Predictable data flow needed → use store (Zustand, Redux, Sinwan stores)

### Event Naming Convention

Use `namespace:action` pattern for clarity:

```typescript
"user:login"; // User-related events
"toast:show"; // Toast notifications
"socket:message"; // Socket events
"route:change"; // Navigation events
```

### Memory Management

The event bus includes automatic cleanup for component hooks:

```typescript
// useEvent automatically unsubscribes on unmount
useEvent("event", handler); // ✓ Auto cleanup

// Manual subscriptions require cleanup
const unsubscribe = bus.on("event", handler);
// Don't forget to call unsubscribe() when done
```

### TypeScript Typing

Define event types for type safety:

```typescript
interface UserEvents {
  "user:login": { id: number; name: string };
  "user:logout": { id: number };
}

// Type-safe emitter
function emit<K extends keyof UserEvents>(event: K, data: UserEvents[K]) {
  globalEventBus.emit(event, data);
}

// Type-safe listener
function on<K extends keyof UserEvents>(
  event: K,
  handler: (data: UserEvents[K]) => void,
) {
  globalEventBus.on(event, handler);
}
```

## Architecture Patterns

### Store + Event Bus Split

A clean architecture separates state management from event signals:

```typescript
// Store for state
const userStore = createStore({
  user: null as User | null,
});

// Event bus for signals
globalEventBus.emit("user:login", user);
globalEventBus.emit("toast:show", { message: "Welcome!" });
```

### Event-Driven Components

Components can react to events without direct coupling:

```typescript
// Component A - emits event
const LoginButton = cc(() => {
  const handleLogin = () => {
    globalEventBus.emit("user:login", { id: 1, name: "Alice" });
  };

  return <button onClick={handleLogin}>Login</button>;
});

// Component B - listens to event
const UserProfile = cc(() => {
  const [user, setUser] = useState<User | null>(null);

  useEvent("user:login", (userData) => {
    setUser(userData);
  });

  return user ? <div>Welcome, {user().name}</div> : <div>Not logged in</div>;
});
```

## API Reference

### SinwanEventBus

```typescript
class SinwanEventBus {
  on(event: string, listener: Listener): () => void;
  onNamespace(pattern: string, listener: Listener): () => void;
  off(event: string, listener: Listener): void;
  offNamespace(pattern: string, listener: Listener): void;
  emit(event: string, ...args: unknown[]): void;
  once(event: string, listener: Listener): () => void;
  clear(event?: string): void;
  listenerCount(event: string): number;
  hasListeners(event: string): boolean;
}
```

### Hooks

```typescript
function useEvent(event: string, handler: Listener, bus?: SinwanEventBus): void;
function useEventNamespace(
  pattern: string,
  handler: Listener,
  bus?: SinwanEventBus,
): void;
function useEventOnce(
  event: string,
  handler: Listener,
  bus?: SinwanEventBus,
): void;
```

### SSR Context

```typescript
interface SSRContext {
  eventBus: SinwanEventBus;
  state: Map<string, unknown>;
}

function createSSRContext(): SSRContext;
function getSSRContext(): SSRContext | null;
function setSSRContext(context: SSRContext | null): SSRContext | null;
function withSSRContext<T>(context: SSRContext, fn: () => T): T;
function getCurrentEventBus(fallback: SinwanEventBus): SinwanEventBus;
```

## Examples

### Toast Notification System

```typescript
// toast.ts
import { globalEventBus } from "sinwan/event";

export function showToast(message: string, type = "info") {
  globalEventBus.emit("toast:show", { message, type });
}

// ToastContainer.tsx
import { cc } from "sinwan/component";
import { useEvent } from "sinwan/event";

const ToastContainer = cc(() => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEvent("toast:show", (toast) => {
    setToasts([...toasts(), toast]);
  });

  return (
    <div>
      {toasts.map(toast => (
        <div key={toast().id}>{() => toast().message}</div>
      ))}
    </div>
  );
});
```

### Socket Integration

```typescript
// socket.ts
import { globalEventBus } from "sinwan/event";

socket.on("message", (data) => {
  globalEventBus.emit("socket:message", data);
});

// ChatComponent.tsx
import { cc } from "sinwan/component";
import { useEventNamespace } from "sinwan/event";

const ChatComponent = cc(() => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEventNamespace("socket:*", (event, data) => {
    if (event === "socket:message") {
      setMessages([...messages(), data]);
    }
  });

  return <div>{/* Render messages */}</div>;
});
```

## Migration from EventEmitter

If you're migrating from a plain EventEmitter:

```typescript
// Before
import { EventEmitter } from "events";
const emitter = new EventEmitter();

// After
import { SinwanEventBus } from "sinwan/event";
const bus = new SinwanEventBus();

// API is similar but with additional features:
bus.on("event", handler); // Same
bus.emit("event", data); // Same
bus.onNamespace("prefix:*", handler); // New: namespace support
```

## Performance Considerations

- Event listeners are stored in Sets for O(1) add/remove
- Namespace pattern matching is efficient with prefix checks
- Component hooks automatically prevent memory leaks
- SSR context isolation prevents cross-request contamination

## Limitations

- Events are synchronous (no async event handling)
- No event ordering guarantees
- No built-in event persistence
- No event replay on hydration (events fire only when emitted)

For advanced streaming/observable patterns, consider integrating with RxJS or similar libraries.
