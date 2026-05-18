import { useSlot } from "./_internal/bridge.ts";
import type { MutableRefObject, RefObject } from "./_types/core.ts";

/**
 * React-compatible `useRef` — `[CLIENT]`.
 *
 * SSR: safe — returns a `{ current }` container without DOM access.
 * Reactivity: native (not reactive — mirrors React semantics exactly).
 *
 * @example
 * ```tsx
 * import { useRef } from "sinwan/react-client";
 *
 * const Input = () => {
 *   const ref = useRef<HTMLInputElement>(null);
 *   return <input ref={ref} />;
 * };
 * ```
 */
export function useRef<T>(initialValue: T): MutableRefObject<T>;
export function useRef<T>(initialValue: T | null): RefObject<T>;
export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
export function useRef(initialValue?: unknown): { current: unknown } {
  return useSlot(() => ({ current: initialValue }));
}
