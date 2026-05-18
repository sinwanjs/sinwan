import {
  useSignalSlot,
  useSlot,
  createStateGetter,
} from "./_internal/bridge.ts";
import {
  runInBatch,
  withTransition,
  inTransition,
} from "./_internal/scheduler.ts";
import { clearTransitionTypes } from "./add-transition-type.ts";
import type { TransitionStartFunction } from "./_types/hooks.ts";

/**
 * React-compatible `useTransition` — `[CLIENT]`.
 *
 * Returns `[isPending, startTransition]`. The `startTransition` callback
 * runs its body inside a Sinwan batch and toggles `isPending` while async
 * work is in flight.
 *
 * SSR: safe.
 * Reactivity: bridge — `isPending` is backed by a signal owned by the
 * component instance.
 *
 * @example
 * ```tsx
 * import { useTransition } from "sinwan/react-client";
 *
 * const Tabs = () => {
 *   const [isPending, startTransition] = useTransition();
 *   const switchTab = (id: string) =>
 *     startTransition(async () => { await load(id); });
 *   return <button disabled={isPending}>switch</button>;
 * };
 * ```
 */
export function useTransition(): [boolean, TransitionStartFunction] {
  const isPending = useSignalSlot<boolean>(() => false);

  const startTransition = useSlot<TransitionStartFunction>(() => (callback) => {
    if (!inTransition()) {
      clearTransitionTypes();
    }
    isPending.value = true;
    try {
      const result = withTransition(() => runInBatch(() => callback()));
      if (
        result &&
        typeof (result as PromiseLike<unknown>).then === "function"
      ) {
        (result as Promise<unknown>)
          .finally(() => {
            isPending.value = false;
          })
          .catch(() => {});
        return;
      }
      isPending.value = false;
    } catch (e) {
      isPending.value = false;
      throw e;
    }
  });

  return [createStateGetter(isPending) as unknown as boolean, startTransition];
}
