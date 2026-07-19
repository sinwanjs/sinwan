import {
  useSignalSlot,
  useSlot,
  createStateGetter,
  applyUpdate,
} from "./_internal/bridge.ts";
import type { OptimisticReducer } from "./_types/hooks.ts";

/**
 * React-compatible `useOptimistic` — `[CLIENT]`.
 *
 * Returns `[optimisticState, addOptimistic]`. `addOptimistic(action)`
 * applies the reducer immediately so the UI reflects the optimistic update
 * before the server response settles. The optimistic state automatically
 * resets to `passthrough` whenever the input changes.
 *
 * SSR: safe — initial render returns `passthrough`.
 * Reactivity: bridge — backed by a signal owned by the component.
 *
 * @example
 * ```tsx
 * import { useOptimistic } from "sinwan/react-client";
 *
 * const TodoList = ({ todos }: { todos: Todo[] }) => {
 *   const [optimistic, addOptimistic] = useOptimistic(
 *     todos,
 *     (state, newTodo: Todo) => [...state, newTodo],
 *   );
 *   return <ul>{optimistic.map(t => <li key={t.id}>{t.text}</li>)}</ul>;
 * };
 * ```
 */
export function useOptimistic<S, A = S>(
  passthrough: S,
  reducer?: OptimisticReducer<S, A>,
): [() => S, (action: A) => void] {
  const reduce =
    reducer ??
    (((state, action) =>
      applyUpdate(
        state,
        action as unknown as S | ((prev: S) => S),
      )) as OptimisticReducer<S, A>);

  const sig = useSignalSlot<S>(() => passthrough);
  const tracker = useSlot<{ last: S }>(() => ({ last: passthrough }));

  // Reset whenever the upstream value changes.
  if (!Object.is(tracker.last, passthrough)) {
    tracker.last = passthrough;
    sig.value = passthrough;
  }

  const addOptimistic = (action: A) => {
    sig.value = reduce(sig.peek(), action);
  };

  return [createStateGetter(sig), addOptimistic];
}
