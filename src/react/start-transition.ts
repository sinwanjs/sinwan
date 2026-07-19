import {
  runInBatch,
  withTransition,
  inTransition,
} from "./_internal/scheduler.ts";
import { clearTransitionTypes } from "./add-transition-type.ts";

/**
 * React-compatible top-level `startTransition` — `[CLIENT]`.
 *
 * Imperatively run a transition outside of any component. Mirrors React's
 * standalone export. Sinwan executes the callback inside a batch and tags
 * the active transition so `addTransitionType` works.
 *
 * SSR: safe.
 * Reactivity: bridge.
 *
 * @example
 * ```ts
 * import { startTransition } from "sinwan/react-client";
 *
 * startTransition(() => navigate("/about"));
 * ```
 */
export function startTransition(callback: () => void | Promise<void>): void {
  if (!inTransition()) {
    clearTransitionTypes();
  }
  withTransition(() => runInBatch(() => callback()));
}
