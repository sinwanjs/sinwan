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
 * NOTE: Functions with arity > 0 are treated as callbacks and returned
 * as-is to avoid accidental invocation of event handlers or render props.
 */
export function resolve<T>(value: T | Signal<T> | Computed<T> | (() => T)): T {
  if (isSignal(value) || isComputed(value)) {
    return (value as any).value;
  }
  if (typeof value === "function" && (value as any).length === 0) {
    return (value as any)();
  }
  return value as T;
}
