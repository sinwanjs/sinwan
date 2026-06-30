/**
 * Sinwan Fast Refresh — component registry (DEV only).
 *
 * Plugin-free Fast Refresh needs to map a component function to its latest
 * hot-swapped version, even when a parent module still references the old
 * version through a stale ESM import binding (which happens when an edited
 * leaf module is its own HMR boundary).
 *
 * The registry is a simple "old function → new function" chain stored in a
 * WeakMap. The Vite plugin injects, per edited module, a call that records
 * `oldExport → newExport`; `resolveLatestComponent` then follows the chain so
 * the renderer always runs the freshest code.
 *
 * This module has NO other imports so it can be shared by both the renderer
 * and the React integration without creating cycles. In production it has no
 * importer (the plugin injects nothing) and is tree-shaken away.
 */

type AnyFn = (...args: any[]) => any;

const latestOf = new WeakMap<AnyFn, AnyFn>();

/** Live root re-render callbacks. Each mounted root registers one. */
const rootRerenders = new Set<() => void>();

/**
 * Record that `oldFn` has been superseded by `newFn` after an HMR edit.
 * No-op for non-functions or identical references.
 */
export function replaceComponent(oldFn: unknown, newFn: unknown): void {
  if (
    typeof oldFn === "function" &&
    typeof newFn === "function" &&
    oldFn !== newFn
  ) {
    latestOf.set(oldFn as AnyFn, newFn as AnyFn);
  }
}

/**
 * Resolve a component to its latest hot-swapped version by following the
 * replacement chain. Returns the input unchanged when it is not a function or
 * has never been replaced. Cycle-guarded.
 */
export function resolveLatestComponent<T>(fn: T): T {
  if (typeof fn !== "function") return fn;
  let cur = fn as unknown as AnyFn;
  let guard = 0;
  while (latestOf.has(cur)) {
    cur = latestOf.get(cur)!;
    if (++guard > 10000) break;
  }
  return cur as unknown as T;
}

/**
 * Register a root's re-render callback. Returns a disposer.
 */
export function registerRefreshRoot(rerender: () => void): () => void {
  rootRerenders.add(rerender);
  return () => {
    rootRerenders.delete(rerender);
  };
}

/**
 * Re-render every mounted root. Called by injected module code after a
 * component module is hot-updated. Errors in one root do not block the others.
 */
export function rerenderRefreshRoots(): void {
  for (const rerender of [...rootRerenders]) {
    try {
      rerender();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[sinwan] Fast Refresh re-render failed:", err);
    }
  }
}
