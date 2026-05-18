import { useSlot, STATE_GETTER_MARKER } from "./_internal/bridge.ts";
import type { GetterDependencyList } from "./_types/hooks.ts";

interface MemoSlot<T> {
  deps: GetterDependencyList | undefined;
  value: T;
}

/**
 * React-compatible `useMemo` — `[CLIENT]`.
 *
 * SSR: safe.
 * Reactivity: native (memoised by `deps` array using `Object.is`). For
 * derived reactive values prefer Sinwan's `computed()`; this hook exists
 * for React-style call sites.
 *
 * @example
 * ```tsx
 * import { useMemo } from "sinwan/react-client";
 *
 * const Sum = ({ items }: { items: number[] }) => {
 *   const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);
 *   return <span>{total}</span>;
 * };
 * ```
 */
export function useMemo<T>(factory: () => T, deps?: GetterDependencyList): T {
  const slot = useSlot<MemoSlot<T>>(() => ({
    deps: undefined,
    value: undefined as T,
  }));
  if (deps === undefined) {
    // No dependency array → recompute every "render" (React behavior when
    // the array is accidentally omitted).
    return factory();
  }
  if (slot.deps === undefined || !depsAreEqual(slot.deps, deps)) {
    slot.value = factory();
    slot.deps = deps;
  }
  return slot.value;
}

export function depsAreEqual(
  a: GetterDependencyList,
  b: GetterDependencyList,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const depA = a[i];
    const depB = b[i];

    // For state getters, compare by underlying signal reference instead of function reference
    if (
      typeof depA === "function" &&
      typeof depB === "function" &&
      (depA as any)[STATE_GETTER_MARKER] &&
      (depB as any)[STATE_GETTER_MARKER]
    ) {
      if (!Object.is((depA as any).__signal__, (depB as any).__signal__)) {
        return false;
      }
    } else if (!Object.is(depA, depB)) {
      return false;
    }
  }
  return true;
}
