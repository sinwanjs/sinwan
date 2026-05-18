# useFetch

`useFetch` is Sinwan's reactive data-fetching hook. It gives you a small, framework-native wrapper around `fetch` with signals for loading state, response data, errors, aborting, refetching, SSR-safe execution, and hydration-friendly updates.

Use it when a component needs HTTP data without giving up Sinwan's fine-grained reactivity model.

```ts
import { useFetch, createFetch } from "sinwan/hook";
```

---

## Why `useFetch` exists

A plain `fetch()` call returns a promise. That works for one-off server code, but UI code usually needs more state:

- **Loading state** — is a request currently running?
- **Completion state** — has the request finished?
- **Response metadata** — what status code and raw `Response` came back?
- **Error state** — did the request fail?
- **Reactive data** — can the DOM update when data changes?
- **Abort control** — can a slow request be cancelled?
- **Refetching** — can URL or payload signals trigger another request?

`useFetch` provides those states as Sinwan `Signal` and `Computed` values.

---

## Async components vs reactive components

`useFetch` is designed for **reactive components** where you need signals and reactivity. For **async components**, use native `fetch` with `Suspense` instead.

### Reactive component with `useFetch`

Use this when you need reactive state (loading, error, refetch, abort):

```tsx
import { cc } from "sinwan/component";
import { useFetch } from "sinwan/hook";
import { Show } from "sinwan/component";

export const UserCard = cc(() => {
  const user = useFetch<{ name: string; email: string }>("/api/user").json();

  return (
    <Show when={user.data} fallback={<p>Loading...</p>}>
      <article>
        <h2>{user.data.value!.name}</h2>
        <p>{user.data.value!.email}</p>
      </article>
    </Show>
  );
});
```

### Async component with native `fetch`

Use this for simple one-time data fetching without reactivity:

```tsx
import { cc } from "sinwan/component";
import { Suspense } from "sinwan/react-client";

const AsyncUserCard = cc(async () => {
  const response = await fetch("/api/user").then(
    (response) => response.json() as Promise<{ name: string; email: string }>,
  );
  return (
    <article>
      <h2>{response.name}</h2>
      <p>{response.email}</p>
    </article>
  );
});

// Usage with Suspense
export const App = cc(() => {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AsyncUserCard />
    </Suspense>
  );
});
```

### When to use which

| Use case                      | Approach                          |
| ----------------------------- | --------------------------------- |
| Need loading/error states     | `useFetch` in reactive component  |
| Need refetch/abort capability | `useFetch` in reactive component  |
| Reactive URL/payload          | `useFetch` in reactive component  |
| Simple one-time fetch         | Native `fetch` in async component |
| SSR with streaming            | Native `fetch` in async component |

**Important:** `useFetch` returns reactive signals (`Signal<T>`, `Computed<T>`). These don't work in async components because async components execute once and resolve with JSX, without re-rendering capability.

---

## Quick start

```tsx
import { cc } from "sinwan/component";
import { useFetch } from "sinwan/hook";

export const UserCard = cc(() => {
  const user = useFetch<{ name: string; email: string }>("/api/user").json();

  return (
    <section>
      {() => user.isFetching.value && <p>Loading...</p>}
      {() => user.error.value && <p>Failed: {user.error.value}</p>}
      {() =>
        user.data.value && (
          <article>
            <h2>{user.data.value.name}</h2>
            <p>{user.data.value.email}</p>
          </article>
        )
      }
    </section>
  );
});
```

By default, `useFetch` executes automatically on the next microtask. This lets you configure the request immediately after creation:

```ts
const posts = useFetch<Post[]>("/api/posts").get().json<Post[]>();
```

---

## Manual execution

Pass `immediate: false` when you want to call `execute()` yourself.

```tsx
import { cc } from "sinwan/component";
import { useFetch } from "sinwan/hook";

export const SearchButton = cc(() => {
  const result = useFetch<{ total: number }>("/api/search?q=sinwan", {
    immediate: false,
  }).json<{ total: number }>();

  return (
    <button
      disabled={() => result.isFetching.value}
      onClick={() => result.execute()}
    >
      {() => (result.isFetching.value ? "Searching..." : "Search")}
    </button>
  );
});
```

`execute()` returns the raw `Response` on success and `null` on cancellation or handled failure.

```ts
const response = await result.execute();

if (response) {
  console.log(response.status);
}
```

If you want request failures to reject, pass `true`:

```ts
await result.execute(true);
```

---

## Reactive state

`useFetch` returns a stable object with reactive fields.

| Field        | Type                | Meaning                                                |
| ------------ | ------------------- | ------------------------------------------------------ | ------------------------------------- |
| `data`       | `Signal<T           | null>`                                                 | Parsed response body or `initialData` |
| `error`      | `Signal<any>`       | Last error message or transformed error                |
| `response`   | `Signal<Response    | null>`                                                 | Raw response object                   |
| `statusCode` | `Signal<number      | null>`                                                 | HTTP status code                      |
| `aborted`    | `Signal<boolean>`   | Whether the active request was aborted                 |
| `isFetching` | `Computed<boolean>` | `true` while a request is active                       |
| `isFinished` | `Computed<boolean>` | `true` when no request is active                       |
| `canAbort`   | `Computed<boolean>` | `true` when abort is supported and a request is active |

Example:

```tsx
const todos = useFetch<Todo[]>("/api/todos").json<Todo[]>();

return (
  <div>
    {() => todos.isFetching.value && <span>Loading</span>}
    {() =>
      todos.statusCode.value && <span>Status: {todos.statusCode.value}</span>
    }
    {() => todos.data.value?.map((todo) => <p>{todo.title}</p>)}
  </div>
);
```

---

## Response parsers

Choose how the body should be parsed before execution finishes.

```ts
useFetch("/api/user").json<User>();
useFetch("/api/readme.txt").text();
useFetch("/api/file.bin").arrayBuffer();
useFetch("/api/avatar.png").blob();
useFetch("/api/form").formData();
```

Available parser helpers:

| Helper          | Result type   |
| --------------- | ------------- |
| `json<JSON>()`  | `JSON`        |
| `text()`        | `string`      |
| `blob()`        | `Blob`        |
| `arrayBuffer()` | `ArrayBuffer` |
| `formData()`    | `FormData`    |

If you do not choose a parser, `text()` is the default.

---

## HTTP methods and payloads

`useFetch` supports method helpers:

```ts
const created = useFetch<Post>("/api/posts", { immediate: false })
  .post({ title: "Hello" })
  .json<Post>();

await created.execute();
```

Available method helpers:

| Helper                     | HTTP method |
| -------------------------- | ----------- |
| `get()`                    | `GET`       |
| `post(payload?, type?)`    | `POST`      |
| `put(payload?, type?)`     | `PUT`       |
| `delete(payload?, type?)`  | `DELETE`    |
| `patch(payload?, type?)`   | `PATCH`     |
| `head(payload?, type?)`    | `HEAD`      |
| `options(payload?, type?)` | `OPTIONS`   |

When the payload is a plain object or array and no payload type is supplied, Sinwan serializes it as JSON and sets `Content-Type: application/json`.

```ts
useFetch("/api/posts", { immediate: false }).post({ title: "Hello" }).json();
```

For explicit payload types, pass the second argument:

```ts
useFetch("/api/message", { immediate: false }).post("hello", "text").text();
```

You may also pass a full content type:

```ts
useFetch("/api/upload", { immediate: false })
  .post(body, "application/octet-stream")
  .text();
```

---

## Request options

The second argument can be native `RequestInit`:

```ts
const profile = useFetch<Profile>("/api/profile", {
  credentials: "include",
  headers: {
    Authorization: `Bearer ${token}`,
  },
}).json<Profile>();
```

Or it can be `UseFetchOptions`:

```ts
const profile = useFetch<Profile>("/api/profile", {
  immediate: false,
  initialData: null,
  timeout: 5000,
}).json<Profile>();
```

To pass both, use the three-argument overload:

```ts
const profile = useFetch<Profile>(
  "/api/profile",
  { credentials: "include" },
  { immediate: false, timeout: 5000 },
).json<Profile>();
```

---

## `UseFetchOptions`

```ts
interface UseFetchOptions {
  fetch?: typeof globalThis.fetch;
  immediate?: boolean;
  refetch?: MaybeReactive<boolean>;
  initialData?: any;
  timeout?: number;
  updateDataOnError?: boolean;
  beforeFetch?: (
    ctx: BeforeFetchContext,
  ) =>
    | Promise<Partial<BeforeFetchContext> | void>
    | Partial<BeforeFetchContext>
    | void;
  afterFetch?: (
    ctx: AfterFetchContext,
  ) => Promise<Partial<AfterFetchContext>> | Partial<AfterFetchContext>;
  onFetchError?: (
    ctx: OnFetchErrorContext,
  ) => Promise<Partial<OnFetchErrorContext>> | Partial<OnFetchErrorContext>;
}
```

| Option              | Default            | Meaning                                          |
| ------------------- | ------------------ | ------------------------------------------------ |
| `fetch`             | `globalThis.fetch` | Custom fetch implementation                      |
| `immediate`         | `true`             | Execute automatically after setup                |
| `refetch`           | `false`            | Refetch when reactive URL or payload changes     |
| `initialData`       | `null`             | Initial value for `data`                         |
| `timeout`           | `0`                | Abort after N milliseconds; `0` disables timeout |
| `updateDataOnError` | `false`            | Allow error callbacks to update `data`           |
| `beforeFetch`       | `undefined`        | Transform or cancel before dispatch              |
| `afterFetch`        | `undefined`        | Transform successful response data               |
| `onFetchError`      | `undefined`        | Transform failure state                          |

---

## Lifecycle callbacks

### `beforeFetch`

Runs before the request is sent. It can mutate the URL/options or cancel the request.

```ts
const request = useFetch("/api/private", {
  beforeFetch(ctx) {
    return {
      options: {
        ...ctx.options,
        headers: {
          ...ctx.options.headers,
          Authorization: `Bearer ${token}`,
        },
      },
    };
  },
}).json();
```

Canceling:

```ts
useFetch("/api/private", {
  beforeFetch(ctx) {
    if (!token) ctx.cancel();
  },
});
```

### `afterFetch`

Runs after a successful `2xx` response and can replace `data`.

```ts
const users = useFetch<User[]>("/api/users", {
  afterFetch(ctx) {
    return {
      data: ctx.data?.filter((user) => user.active),
    };
  },
}).json<User[]>();
```

### `onFetchError`

Runs after a failed response or thrown fetch error.

```ts
const users = useFetch<User[]>("/api/users", {
  initialData: [],
  updateDataOnError: true,
  onFetchError(ctx) {
    return {
      error: "Could not load users",
      data: [],
    };
  },
}).json<User[]>();
```

---

## Event hooks

`useFetch` exposes event subscriptions:

```ts
const request = useFetch("/api/users").json<User[]>();

const stopResponse = request.onFetchResponse((response) => {
  console.log("status", response.status);
});

const stopError = request.onFetchError((error) => {
  console.error(error);
});

const stopFinally = request.onFetchFinally(() => {
  console.log("done");
});
```

Each subscription returns a cleanup function.

```ts
stopResponse();
stopError();
stopFinally();
```

---

## Abort and timeout

Manual abort:

```tsx
const upload = useFetch("/api/upload", { immediate: false }).post(file).text();

return (
  <div>
    <button onClick={() => upload.execute()}>Upload</button>
    <button
      disabled={() => !upload.canAbort.value}
      onClick={() => upload.abort()}
    >
      Cancel
    </button>
  </div>
);
```

Timeout abort:

```ts
const request = useFetch("/api/slow", {
  timeout: 3000,
}).json();
```

When aborted, `aborted.value` becomes `true`, `isFetching.value` becomes `false`, and `error.value` receives the abort error message or name.

---

## Reactive URL refetching

The URL can be a plain string, a signal, a computed value, or a getter.

```tsx
import { cc } from "sinwan/component";
import { signal } from "sinwan/reactivity";
import { useFetch } from "sinwan/hook";

export const UserLookup = cc(() => {
  const id = signal("1");

  const user = useFetch<User>(() => `/api/users/${id.value}`, {
    refetch: true,
  }).json<User>();

  return (
    <section>
      <input
        value={id}
        onInput={(event) => (id.value = event.currentTarget.value)}
      />
      {() =>
        user.data.value && <pre>{JSON.stringify(user.data.value, null, 2)}</pre>
      }
    </section>
  );
});
```

With `refetch: true`, `useFetch` tracks reactive URL dependencies and executes again after later changes. The initial tracking pass does not override `immediate: false`.

---

## Reactive payload refetching

Payloads can also be reactive.

```ts
const body = signal({ title: "First" });

const request = useFetch("/api/posts", {
  immediate: false,
  refetch: true,
})
  .post(body)
  .json<Post>();

await request.execute();

body.value = { title: "Second" };
```

When `refetch` is enabled and a signal payload changes, the request executes again with the latest payload.

---

## `createFetch`

`createFetch` creates a customized `useFetch` factory.

```ts
import { createFetch } from "sinwan/hook";

export const apiFetch = createFetch({
  baseUrl: "https://api.example.com",
  fetchOptions: {
    credentials: "include",
    headers: {
      "X-App": "dashboard",
    },
  },
  options: {
    timeout: 5000,
    beforeFetch(ctx) {
      return {
        options: {
          ...ctx.options,
          headers: {
            ...ctx.options.headers,
            Authorization: `Bearer ${token}`,
          },
        },
      };
    },
  },
});

const user = apiFetch("/users/1").json<User>();
```

If the target URL is relative, `baseUrl` is prefixed. Absolute URLs are left unchanged.

```ts
apiFetch("/users");
apiFetch("https://cdn.example.com/file.json");
```

---

## Callback combination

`createFetch` accepts `combination` for default and per-call callbacks.

```ts
createFetch({
  combination: "chain",
  options: {
    beforeFetch(ctx) {
      return ctx;
    },
  },
});
```

| Value       | Behavior                                                            |
| ----------- | ------------------------------------------------------------------- |
| `chain`     | Run default callback, then local callback, merging returned context |
| `overwrite` | Use the last callback that exists                                   |

`chain` is the default.

---

## SSR and hydration

`useFetch` is SSR-safe because it uses `globalThis.fetch` by default and does not touch `window` or `document`.

For SSR, choose the execution model intentionally:

```ts
const request = useFetch("https://api.example.com/posts", {
  immediate: false,
}).json<Post[]>();

await request.execute();
```

During hydration, the returned `Signal` and `Computed` values update normally. If the hook executes on the client, only the DOM nodes that read those reactive values update.

Recommended patterns:

- **Server-owned data:** fetch on the server and pass serialized data as props or `initialData`.
- **Client-owned data:** use `immediate: true` and render loading state during hydration.
- **Avoid duplicate work:** use `immediate: false` when server data is already present, then call `execute()` only for refresh.

```ts
const posts = useFetch<Post[]>("/api/posts", {
  immediate: false,
  initialData: serverPosts,
}).json<Post[]>();
```

---

## Type reference

```ts
type Fn = () => void;

type MaybeReactive<T> = T | Signal<T> | Computed<T> | (() => T);

type EventHookOn<T = unknown> = (fn: (param: T) => void) => Fn;
```

```ts
interface UseFetchReturn<T> {
  isFinished: Computed<boolean>;
  statusCode: Signal<number | null>;
  response: Signal<Response | null>;
  error: Signal<any>;
  data: Signal<T | null>;
  isFetching: Computed<boolean>;
  canAbort: Computed<boolean>;
  aborted: Signal<boolean>;
  abort: (reason?: any) => void;
  execute: (throwOnFailed?: boolean) => Promise<any>;
  onFetchResponse: EventHookOn<Response>;
  onFetchError: EventHookOn<any>;
  onFetchFinally: EventHookOn<any>;
  get: () => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  post: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  put: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  delete: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  patch: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  head: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  options: (
    payload?: MaybeReactive<unknown>,
    type?: string,
  ) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>;
  json: <JSON = any>() => UseFetchReturn<JSON> &
    PromiseLike<UseFetchReturn<JSON>>;
  text: () => UseFetchReturn<string> & PromiseLike<UseFetchReturn<string>>;
  blob: () => UseFetchReturn<Blob> & PromiseLike<UseFetchReturn<Blob>>;
  arrayBuffer: () => UseFetchReturn<ArrayBuffer> &
    PromiseLike<UseFetchReturn<ArrayBuffer>>;
  formData: () => UseFetchReturn<FormData> &
    PromiseLike<UseFetchReturn<FormData>>;
}
```

```ts
interface CreateFetchOptions {
  baseUrl?: MaybeReactive<string>;
  combination?: "overwrite" | "chain";
  options?: UseFetchOptions;
  fetchOptions?: RequestInit;
}
```

---

## Common pitfalls

### Forgetting `.value`

`data`, `error`, `statusCode`, and the loading flags are reactive containers.

```ts
request.data.value;
request.isFetching.value;
```

### Calling parser helpers after a request starts

Parser and method helpers configure the next request. Chain them before `execute()` or before automatic execution starts.

```ts
const request = useFetch("/api/users", { immediate: false }).json<User[]>();
await request.execute();
```

### Using `immediate: true` with SSR data already present

If data was already fetched on the server, use `initialData` and `immediate: false` to avoid a duplicate client request.

```ts
useFetch("/api/posts", {
  immediate: false,
  initialData: postsFromServer,
}).json<Post[]>();
```

### Expecting `fetch` to reject on HTTP errors

Native `fetch` resolves for `404` and `500`. `useFetch` treats non-`ok` responses as errors, sets `error.value`, and returns `null` unless `execute(true)` is used.

---

## Related pages

- [`03-reactivity.md`](./03-reactivity.md) — signals, computed values, effects, and scheduler behavior.
- [`09-ssr.md`](./09-ssr.md) — server rendering patterns.
- [`10-hydration.md`](./10-hydration.md) — hydration and reactive DOM reuse.
- [`14-recipes.md`](./14-recipes.md) — async data patterns.
- [`15-api-reference.md`](./15-api-reference.md) — public export index.
