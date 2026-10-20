/**
 * Production stub for Fast Refresh registry — identity resolve, no WeakMap.
 * Bundler redirects `component-registry` imports here when `__DEV__` is false.
 */

export function replaceComponent(_oldFn: unknown, _newFn: unknown): void {}

export function resolveLatestComponent<T>(fn: T): T {
  return fn;
}

export function registerRefreshRoot(_rerender: () => void): () => void {
  return () => {};
}

export function rerenderRefreshRoots(): void {}
