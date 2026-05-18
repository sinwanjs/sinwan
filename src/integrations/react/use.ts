import { readContext } from "./create-context.ts";
import { REACT_CONTEXT_TYPE } from "./_internal/symbols.ts";
import type { Context } from "./_types/context.ts";
import type { Usable } from "./_types/hooks.ts";

const promiseCache = new WeakMap<
  PromiseLike<unknown>,
  {
    status: "pending" | "fulfilled" | "rejected";
    value?: unknown;
    reason?: unknown;
  }
>();

/**
 * React-compatible `use(usable)` — `[SHARED]`.
 *
 * SSR: safe — promise unwrapping suspends the surrounding async render.
 * Reactivity: bridge — for Context, delegates to `inject()`. For Promises,
 * unwraps via `await`-style suspension by throwing the pending promise (the
 * Sinwan async control-flow surfaces it as a Suspense boundary fallback).
 *
 * Unlike React's `use`, this implementation runs at component-call time
 * inside a Sinwan setup function. Conditional usage is allowed because
 * Sinwan does not memoise hook order across renders.
 *
 * @example
 * ```tsx
 * import { use, createContext } from "sinwan/react-client";
 *
 * const UserCtx = createContext<{ name: string } | null>(null);
 *
 * const Greeting = () => {
 *   const user = use(UserCtx);
 *   return <span>Hello {user?.name}</span>;
 * };
 * ```
 */
export function use<T>(usable: Usable<T> | Context<T>): T {
  // Context branch — must come before the thenable check because
  // Sinwan Context objects are callable functions (valid JSX types).
  if (
    usable != null &&
    (typeof usable === "object" || typeof usable === "function") &&
    "$$typeof" in (usable as any) &&
    (usable as any).$$typeof === REACT_CONTEXT_TYPE
  ) {
    return readContext<T>(usable as unknown as Context<T>);
  }

  // Thenable / promise branch — suspend by throwing the promise.
  if (usable != null && typeof (usable as PromiseLike<T>).then === "function") {
    const promise = usable as PromiseLike<T>;
    let entry = promiseCache.get(promise);
    if (!entry) {
      entry = { status: "pending" };
      promiseCache.set(promise, entry);
      promise.then(
        (v) => {
          entry!.status = "fulfilled";
          entry!.value = v;
        },
        (e) => {
          entry!.status = "rejected";
          entry!.reason = e;
        },
      );
    }
    if (entry.status === "fulfilled") return entry.value as T;
    if (entry.status === "rejected") throw entry.reason;
    throw promise;
  }

  throw new Error("[sinwan/react] use() expected a Promise or Context.");
}
