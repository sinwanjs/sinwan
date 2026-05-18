/**
 * Thin wrapper that ties React-style "transition" / "deferred" priorities to
 * Sinwan's existing batch / nextTick scheduler. Sinwan effects are
 * synchronous, so transition work is deferred via `nextTick` rather than a
 * concurrent reconciler.
 */

import { batch } from "../../../reactivity/batch.ts";
import { nextTick } from "../../../reactivity/scheduler.ts";

/** Run `fn` inside a single Sinwan batch (atomic re-renders). */
export function runInBatch<T>(fn: () => T): T {
  let result!: T;
  batch(() => {
    result = fn();
  });
  return result;
}

/** Defer non-urgent work to the next tick. */
export function deferToNextTick(fn: () => void): void {
  nextTick(fn);
}

/** Pending transition stack — used by `useTransition` / `startTransition`. */
let transitionDepth = 0;
export function inTransition(): boolean {
  return transitionDepth > 0;
}
export function withTransition<T>(fn: () => T): T {
  transitionDepth++;
  try {
    return fn();
  } finally {
    transitionDepth--;
  }
}
