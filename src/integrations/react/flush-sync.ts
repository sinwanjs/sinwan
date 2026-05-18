import { flushSync as flushScheduler } from "../../reactivity/scheduler.ts";
import { assertClient } from "./_internal/is-server.ts";

/**
 * React-compatible `flushSync` — `[CLIENT]`.
 *
 * Forces Sinwan to flush any pending reactive effects immediately.
 * When a callback is provided, it is executed first, then the
 * scheduler is drained synchronously.
 *
 * SSR: throws (matches React: server is always synchronous, no need).
 * Reactivity: pass-through to Sinwan's scheduler.
 *
 * @example
 * ```ts
 * import { flushSync } from "sinwan/react-client";
 *
 * flushSync(() => signal.value = 1);
 * // DOM is updated synchronously by the time we get here.
 * ```
 */
export function flushSync(): void;
export function flushSync<R>(fn: () => R): R;
export function flushSync<R>(fn?: () => R): R | void {
  assertClient("flushSync");
  const result = fn ? fn() : undefined;
  flushScheduler();
  return result;
}
