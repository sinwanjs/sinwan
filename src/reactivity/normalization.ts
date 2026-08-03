/**
 * SinwanJS Reactivity — Normalization
 *
 * Provides a unified way to handle different types of reactive inputs:
 * Signals, Computed values, and Function getters.
 */

import { isSignal, type Signal } from "./signal.ts";
import { isComputed, type Computed } from "./computed.ts";

/**
 * Checks if a value is reactive (Signal, Computed, or Function getter).
 */
export function isReactive(
  value: unknown,
): value is Signal<any> | Computed<any> | Function {
  return isSignal(value) || isComputed(value) || typeof value === "function";
}

/**
 * Resolves the current value of a potentially reactive input.
 * If the input is a signal, computed, or function, it returns its current value.
 * Otherwise, it returns the input as-is.
 *
 * Signals, computed, and zero-arity functions are all unwrapped recursively
 * (up to a small depth) so that a reactive value forwarded through a component
 * prop — which the compiler re-wraps into `() => prop` — resolves all the way
 * to the underlying value rather than stopping at an intermediate getter or
 * signal object. Functions with arity > 0 are treated as callbacks and returned
 * as-is to avoid accidental invocation of event handlers or render props.
 *
 * Use `unwrap` instead when the caller needs to access a property on the
 * reactive object itself (e.g. `unwrap(signal).value` or
 * `unwrap(proxy).name`), since `resolve` would unwrap the signal to its
 * value, making the subsequent `.value` access return `undefined`.
 */
const RESOLVE_MAX_DEPTH = 8;
export function resolve<T>(value: T | Signal<T> | Computed<T> | (() => T)): T {
  let current: unknown = value;
  for (let depth = 0; depth <= RESOLVE_MAX_DEPTH; depth++) {
    if (isSignal(current) || isComputed(current)) {
      current = (current as any).value;
      continue;
    }
    if (typeof current === "function" && (current as any).length === 0) {
      current = (current as any)();
      continue;
    }
    break;
  }
  return current as T;
}

/**
 * Unwraps zero-arity getter functions (depth-limited) WITHOUT unwrapping
 * Signals or Computed values.
 *
 * Used by the compiler for prop-rooted member expressions like `user.name`
 * where `user` may arrive as either a getter (forwarded through a component)
 * or a direct value (a Signal, a mutable proxy, or a plain object).
 *
 * - `unwrap(signal).value`   → returns the signal, then `.value` reads it
 * - `unwrap(() => signal).value` → calls getter → returns signal → `.value`
 * - `unwrap(proxy).name`     → returns the proxy → `.name` reads the property
 * - `unwrap(() => proxy).name` → calls getter → returns proxy → `.name`
 *
 * Unlike `resolve`, this never unwraps Signals/Computed themselves, so the
 * caller's `.value` / `.name` access always targets the underlying reactive
 * object rather than its already-resolved value.
 */
export function unwrap<T>(value: T): T {
  let current: unknown = value;
  for (let depth = 0; depth <= RESOLVE_MAX_DEPTH; depth++) {
    if (typeof current === "function" && (current as any).length === 0) {
      current = (current as any)();
      continue;
    }
    break;
  }
  return current as T;
}
