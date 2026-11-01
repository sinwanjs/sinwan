/**
 * SinwanJS Hooks — shared helpers for the `sinwan/hook` entry.
 */

import { getCurrentInstance } from "../component/instance.ts";
import { onUnmounted } from "../component/lifecycle.ts";

export type Fn = () => void;
export type EventHookOn<T = unknown> = (fn: (param: T) => void) => Fn;

export interface EventHook<T> {
  on: EventHookOn<T>;
  trigger(param: T): void;
}

/** A small listener set: `on` subscribes and returns the unsubscribe function. */
export function createEventHook<T = unknown>(): EventHook<T> {
  const fns = new Set<(param: T) => void>();
  return {
    on(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    trigger(param) {
      for (const fn of fns) fn(param);
    },
  };
}

/**
 * Runs `fn` when the calling component unmounts. Outside component setup
 * (module scope, tests, stores) it does nothing: the caller cleans up itself.
 */
export function tryOnUnmounted(fn: Fn): void {
  if (getCurrentInstance()) onUnmounted(fn);
}

/** True in a browser-like environment (not during server rendering). */
export function isClient(): boolean {
  return typeof window !== "undefined";
}
