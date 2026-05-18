import { isServer } from "./_internal/is-server.ts";

let currentRequestSignal: AbortSignal | null = null;

/** Internal: set the request-scoped signal at the start of an SSR render. */
export function setRequestAbortSignal(signal: AbortSignal | null): void {
  currentRequestSignal = signal;
}

/**
 * React-compatible `cacheSignal()` — `[SHARED]`.
 *
 * Returns an `AbortSignal` scoped to the current render if called during
 * rendering, otherwise `null`.
 *
 * - On the **client**: always returns `null` (matching React's current
 *   Client Component behaviour).
 * - On the **server**: returns the request-scoped `AbortSignal` when called
 *   inside an active render (set via `setRequestAbortSignal`), otherwise
 *   `null`.
 *
 * SSR: safe.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { cacheSignal } from "sinwan";
 *
 * async function loader() {
 *   const signal = cacheSignal();
 *   if (signal) {
 *     const res = await fetch(url, { signal });
 *     return res.json();
 *   }
 * }
 * ```
 */
export function cacheSignal(): AbortSignal | null {
  if (!isServer()) return null;
  return currentRequestSignal;
}
