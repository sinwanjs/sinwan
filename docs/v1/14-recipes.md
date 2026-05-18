# Recipes

A collection of small, complete examples covering the most common Sinwan patterns. Each recipe is self-contained and can be pasted into a new project.

---

## Counter

The hello-world of reactive UI.

```tsx
import { signal, mount, cc } from "sinwan";

const Counter = cc(() => {
  const count = signal(0);
  return (
    <div>
      <p>You clicked {count} times.</p>
      <button onClick={() => count.value++}>Increment</button>
      <button onClick={() => (count.value = 0)}>Reset</button>
    </div>
  );
});

mount(Counter, document.getElementById("app")!);
```

---

## Computed values

```tsx
import { signal, computed, cc } from "sinwan";

const TempConverter = cc(() => {
  const c = signal(20);
  const f = computed(() => (c.value * 9) / 5 + 32);

  return (
    <div>
      <input
        type="number"
        value={c}
        onInput={(e) =>
          (c.value = Number((e.currentTarget as HTMLInputElement).value))
        }
      />
      <p>
        {c}°C = {f}°F
      </p>
    </div>
  );
});
```

---

## Todo list

```tsx
import { signal, cc, For } from "sinwan";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

let nextId = 0;

const TodoApp = cc(() => {
  const todos = signal<Todo[]>([]);
  const draft = signal("");

  const add = () => {
    const text = draft.value.trim();
    if (!text) return;
    todos.value = [...todos.value, { id: nextId++, text, done: false }];
    draft.value = "";
  };

  const toggle = (id: number) => {
    todos.value = todos.value.map((t) =>
      t.id === id ? { ...t, done: !t.done } : t,
    );
  };

  return (
    <div class="todo-app">
      <h1>Todo</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onInput={(e) =>
            (draft.value = (e.currentTarget as HTMLInputElement).value)
          }
          placeholder="What needs doing?"
        />
        <button type="submit">Add</button>
      </form>
      <ul>
        <For
          each={todos}
          fallback={<li class="empty">No todos yet!</li>}
          key={(t) => t.id}
        >
          {(t) => (
            <li class={{ done: t.done }}>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
              />
              <span>{t.text}</span>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
});
```

---

## Async data fetching

```tsx
import { signal, cc, onMounted } from "sinwan";

interface User {
  id: number;
  name: string;
}

const UserList = cc(() => {
  const users = signal<User[]>([]);
  const loading = signal(true);
  const error = signal<string | null>(null);

  onMounted(async () => {
    try {
      const res = await fetch("/api/users");
      users.value = await res.json();
    } catch (err) {
      error.value = (err as Error).message;
    } finally {
      loading.value = false;
    }
  });

  return (
    <section>
      {loading.value && <p>Loading…</p>}
      {error.value && <p class="err">{error.value}</p>}
      <ul>
        {users.value.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </section>
  );
});
```

---

## Theme via provide / inject

```tsx
// theme.ts
import { signal, type InjectionKey, type Signal } from "sinwan";

export type Theme = "light" | "dark";
export const ThemeKey: InjectionKey<Signal<Theme>> = Symbol("theme");
```

```tsx
// App.tsx
import { signal, computed, provide, cc } from "sinwan";
import { ThemeKey } from "./theme";

const App = cc(({ children }) => {
  const theme = signal<"light" | "dark">("light");
  const appClass = computed(() => `app theme-${theme.value}`);
  provide(ThemeKey, theme);
  return (
    <div class={appClass}>
      <button
        onClick={() =>
          (theme.value = theme.value === "light" ? "dark" : "light")
        }
      >
        Toggle theme
      </button>
      {children}
    </div>
  );
});
```

```tsx
// Card.tsx
import { inject, computed, cc } from "sinwan";
import { ThemeKey } from "./theme";

export const Card = cc(({ children }) => {
  const theme = inject(ThemeKey)!;
  const cardClass = computed(() => `card card--${theme.value}`);
  return <article class={cardClass}>{children}</article>;
});
```

---

## Form with validation

```tsx
import { signal, computed, cc } from "sinwan";

const SignUp = cc(() => {
  const email = signal("");
  const password = signal("");

  const valid = computed(
    () => /\S+@\S+\.\S+/.test(email.value) && password.value.length >= 8,
  );
  const isSubmitDisabled = computed(() => !valid.value);

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!valid.value) return;
    // call API…
  };

  return (
    <form onSubmit={onSubmit}>
      <label>
        Email
        <input
          type="email"
          value={email}
          onInput={(e) =>
            (email.value = (e.currentTarget as HTMLInputElement).value)
          }
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onInput={(e) =>
            (password.value = (e.currentTarget as HTMLInputElement).value)
          }
        />
      </label>
      <button type="submit" disabled={isSubmitDisabled}>
        Sign up
      </button>
    </form>
  );
});
```

---

## Local state via a “store” object

A common pattern for complex screens.

```tsx
import { signal, computed, type Signal } from "sinwan";

export interface CartStore {
  items: Signal<{ id: string; price: number; qty: number }[]>;
  total: { value: number };
  add(id: string, price: number): void;
  remove(id: string): void;
}

export function createCartStore(): CartStore {
  const items = signal<CartStore["items"] extends Signal<infer T> ? T : never>(
    [],
  );
  const total = computed(() =>
    items.value.reduce((s, i) => s + i.qty * i.price, 0),
  );
  return {
    items,
    total,
    add(id, price) {
      const existing = items.value.find((i) => i.id === id);
      items.value = existing
        ? items.value.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i))
        : [...items.value, { id, price, qty: 1 }];
    },
    remove(id) {
      items.value = items.value.filter((i) => i.id !== id);
    },
  };
}
```

```tsx
// Use the store via provide/inject:
const CartKey: InjectionKey<CartStore> = Symbol("cart");

const App = cc(({ children }) => {
  provide(CartKey, createCartStore());
  return <>{children}</>;
});

const CartTotal = cc(() => {
  const cart = inject(CartKey)!;
  return <p>Total: {cart.total}</p>;
});
```

---

## SSR + hydrate (full flow)

See [`10-hydration.md`](./10-hydration.md) for the complete end-to-end example.

---

## Streaming SSR with Bun

```ts
import { Bun } from "bun";
import { streamPage, registerPage } from "sinwan/react-server";
import { cc } from "sinwan";

const HomePage = cc<{ title: string }>(({ title }) => (
  <html>
    <head><title>{title}</title></head>
    <body><h1>{title}</h1><AsyncSection /></body>
  </html>
));

registerPage("home", HomePage);

const AsyncSection = async () => {
  await new Promise(r => setTimeout(r, 200));
  return <p>Loaded after 200 ms.</p>;
};

Bun.serve({
  port: 3000,
  fetch() {
    const stream = streamPage(HomePage, { title: "Streamed" });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});
```

---

## Custom event listener cleanup

```tsx
import { onMounted, onUnmounted, cc } from "sinwan";

const KeyboardShortcut = cc(() => {
  onMounted(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    onUnmounted(() => window.removeEventListener("keydown", onKey));
  });
  return null;
});
```

---

## Trusted markdown rendering

```tsx
import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { safeHtml, cc } from "sinwan";

const Markdown = cc<{ source: string }>(({ source }) => {
  const dirty = marked.parse(source) as string;
  const clean = DOMPurify.sanitize(dirty);
  return <div class="md">{safeHtml(clean)}</div>;
});
```

---

## Test recipe

```ts
import { test, expect } from "bun:test";
import { signal, effect, nextTick } from "sinwan";

test("effect re-runs when signal changes", async () => {
  const c = signal(0);
  let observed = -1;
  effect(() => {
    observed = c.value;
  });
  expect(observed).toBe(0);

  c.value = 5;
  await nextTick();
  expect(observed).toBe(5);
});
```

---

## See also

- [`03-reactivity.md`](./03-reactivity.md) for advanced reactivity patterns
- [`05-lifecycle.md`](./05-lifecycle.md) for hook ordering details
- [`09-ssr.md`](./09-ssr.md) and [`10-hydration.md`](./10-hydration.md) for SSR specifics
