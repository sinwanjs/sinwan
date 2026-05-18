import { useSignalSlot, createStateGetter } from "./_internal/bridge.ts";
import type { Dispatch, Reducer } from "./_types/hooks.ts";

/**
 * React-compatible `useReducer` — `[CLIENT]`.
 *
 * SSR: safe.
 * Reactivity: bridge — backed by a signal owned by the component instance.
 *
 * @example
 * ```tsx
 * import { useReducer } from "sinwan/react-client";
 *
 * type Action = { type: "inc" } | { type: "dec" };
 * const reducer = (n: number, a: Action) => a.type === "inc" ? n + 1 : n - 1;
 *
 * const Counter = () => {
 *   const [n, dispatch] = useReducer(reducer, 0);
 *   return <button onClick={() => dispatch({ type: "inc" })}>{n}</button>;
 * };
 * ```
 */
export function useReducer<S, A>(
  reducer: Reducer<S, A>,
  initialState: S,
  init?: (initial: S) => S,
): [() => S, Dispatch<A>] {
  const sig = useSignalSlot<S>(() =>
    init ? init(initialState) : initialState,
  );
  const dispatch: Dispatch<A> = (action) => {
    sig.value = reducer(sig.peek(), action);
  };
  return [createStateGetter(sig), dispatch];
}
