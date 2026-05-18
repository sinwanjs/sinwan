const activeTypes = new Set<string>();

/**
 * React-compatible `addTransitionType(type)` — `[SHARED]`.
 *
 * Tags the active transition with a string label. Sinwan does not use
 * transition labels for scheduling; this implementation records them on a
 * per-tick set so consumers can introspect via `getActiveTransitionTypes()`.
 *
 * SSR: safe (no-op if no transition is active).
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { addTransitionType, startTransition } from "sinwan/react-client";
 *
 * startTransition(() => {
 *   addTransitionType("navigate");
 *   navigate("/about");
 * });
 * ```
 */
export function addTransitionType(type: string): void {
  activeTypes.add(type);
}

/**
 * Returns the set of transition types active in the current tick.
 *
 * SSR: safe.
 * Reactivity: pass-through.
 */
export function getActiveTransitionTypes(): ReadonlySet<string> {
  return activeTypes;
}

/**
 * Clear types after a transition flush.
 *
 * SSR: safe.
 * Reactivity: pass-through.
 */
export function clearTransitionTypes(): void {
  activeTypes.clear();
}
