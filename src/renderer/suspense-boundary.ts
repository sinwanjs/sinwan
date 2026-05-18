/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Suspense boundary stack
 *
 * Tracks the active Suspense boundary during rendering so that
 * `renderComponentToDOM` can propagate thrown promises to the nearest
 * boundary instead of treating them as fatal errors.
 */

export interface SuspenseBoundary {
  /** Promises that have been thrown inside this boundary. */
  promises: Set<PromiseLike<unknown>>;
  /** Callback fired when a promise resolves (the boundary re-renders). */
  onResolved: () => void;
}

const stack: SuspenseBoundary[] = [];

/** Push a boundary onto the active stack before rendering its children. */
export function pushSuspenseBoundary(boundary: SuspenseBoundary): void {
  stack.push(boundary);
}

/** Pop the most-recently pushed boundary. */
export function popSuspenseBoundary(): void {
  stack.pop();
}

/** Return the currently active (innermost) Suspense boundary, or null. */
export function getActiveSuspenseBoundary(): SuspenseBoundary | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}
