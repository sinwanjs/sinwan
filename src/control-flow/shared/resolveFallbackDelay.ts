import { resolve, untrack } from "../../reactivity/index.ts";

/**
 * A `fallbackDelay` prop in milliseconds: a positive finite number, else 0
 * (show the fallback at once). Getters and signals are read without tracking,
 * so changing the delay never re-renders a block by itself.
 */
export function resolveFallbackDelay(value: unknown): number {
  const ms = untrack(() => resolve(value));
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : 0;
}
