import {
  useSignalSlot,
  applyUpdate,
  createStateGetter,
  type StateGetter,
} from "./_internal/bridge.ts";
import type { Dispatch, SetStateAction } from "./_types/hooks.ts";

/**
 * React-compatible `useState` — `[CLIENT]`.
 *
 * SSR: safe — runs during component setup; the initial value is returned.
 * Reactivity: bridge — backed by a Sinwan signal owned by the current
 * component instance. Reading the returned value tracks the current effect
 * (Sinwan's fine-grained reactivity replaces React's re-render mechanism).
 *
 * @example
 * ```tsx
 * import { useState } from "sinwan/react-client";
 *
 * const Counter = () => {
 *   const [count, setCount] = useState(0);
 *   return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
 * };
 * ```
 */
export function useState<S>(
  initial: S | (() => S),
): [StateGetter<S>, Dispatch<SetStateAction<S>>] {
  const sig = useSignalSlot<S>(() =>
    typeof initial === "function" ? (initial as () => S)() : initial,
  );
  const setState: Dispatch<SetStateAction<S>> = (action) => {
    sig.value = applyUpdate(sig.peek(), action);
  };
  return [createStateGetter(sig), setState];
}
