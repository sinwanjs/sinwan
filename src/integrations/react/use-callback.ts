import { useMemo } from "./use-memo.ts";
import type { GetterDependencyList } from "./_types/hooks.ts";

/**
 * React-compatible `useCallback` — `[CLIENT]`.
 *
 * SSR: safe.
 * Reactivity: native — equivalent to `useMemo(() => fn, deps)`.
 *
 * @example
 * ```tsx
 * import { useCallback } from "sinwan/react-client";
 *
 * const Form = () => {
 *   const onSubmit = useCallback((e: Event) => e.preventDefault(), []);
 *   return <form onSubmit={onSubmit} />;
 * };
 * ```
 */
export function useCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps?: GetterDependencyList,
): T {
  // NOTE: React allows calling useCallback without a dependency array.
  // When omitted, the hook returns a new function on every render,
  // effectively disabling memoization.
  if (deps === undefined) {
    return callback;
  }
  return useMemo(() => callback, deps);
}
