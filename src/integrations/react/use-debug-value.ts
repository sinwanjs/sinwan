import { getCurrentInstance } from "../../component/instance.ts";
import type { DebugValueFormatter } from "./_types/hooks.ts";

const DEBUG_VALUES_KEY = Symbol.for("sinwan.react.debug_values");

export interface DebugValueEntry {
  value: unknown;
  formatter?: unknown;
}

/**
 * React-compatible `useDebugValue` — `[CLIENT]`, dev-only.
 *
 * SSR: safe.
 * Reactivity: pass-through.
 *
 * Stores debug metadata on the current component instance for potential
 * DevTools integration. In Sinwan there is no DevTools panel, so the
 * values are collected but not displayed anywhere by default. The optional
 * `formatter` is stored lazily — it is **not** called during render, matching
 * React's behaviour of only invoking it when the component is inspected.
 *
 * @example
 * ```tsx
 * import { useDebugValue } from "sinwan/react-client";
 *
 * const useUser = () => {
 *   const user = ...;
 *   useDebugValue(user, (u) => u?.name ?? "(anonymous)");
 *   return user;
 * };
 * ```
 */
export function useDebugValue<T>(
  value: T,
  formatter?: DebugValueFormatter<T>,
): void {
  const instance = getCurrentInstance();
  if (!instance) {
    return;
  }

  let entries = (instance as any)[DEBUG_VALUES_KEY] as
    | DebugValueEntry[]
    | undefined;
  if (!entries) {
    entries = [];
    (instance as any)[DEBUG_VALUES_KEY] = entries;
  }
  entries.push({ value, formatter: formatter as any });
}

/**
 * Internal helper to read debug values from a component instance.
 * Used by tests and potentially future DevTools integration.
 */
export function getDebugValues(instance: {
  [key: symbol]: unknown;
}): DebugValueEntry[] {
  return (instance[DEBUG_VALUES_KEY] as DebugValueEntry[]) ?? [];
}
