import {
  flushSync as flushScheduler,
  nextTick,
} from "../../reactivity/scheduler.ts";

/**
 * React-compatible `act(scope)` — `[CLIENT]` (test helper).
 *
 * Runs `scope`, awaits any returned promise, drains Sinwan's effect queue
 * synchronously, and resolves once everything has settled. Matches React's
 * test-act semantics closely enough for unit testing.
 *
 * SSR: safe (no-op flush).
 * Reactivity: pass-through to Sinwan's scheduler.
 *
 * @example
 * ```ts
 * import { act } from "sinwan/react-client";
 *
 * await act(async () => {
 *   counter.value = 5;
 *   await Promise.resolve();
 * });
 * ```
 */
export function act<T>(scope: () => T | Promise<T>): Promise<T> {
  if (!(globalThis as any).IS_REACT_ACT_ENVIRONMENT) {
    throw new Error(
      "The current testing environment is not configured to support act(...). " +
        "To fix, set global.IS_REACT_ACT_ENVIRONMENT = true in your test setup.",
    );
  }

  try {
    const result = scope();
    return Promise.resolve(result).then(async (value) => {
      // Drain microtasks + Sinwan effects until quiescent.
      for (let i = 0; i < 5; i++) {
        flushScheduler();
        await new Promise<void>((r) => nextTick(r));
      }
      flushScheduler();
      return value;
    });
  } catch (error) {
    return Promise.reject(error);
  }
}
