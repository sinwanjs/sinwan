import {
  useSignalSlot,
  useSlot,
  createStateGetter,
} from "./_internal/bridge.ts";
import {
  inTransition,
  withTransition,
  runInBatch,
} from "./_internal/scheduler.ts";
import { isServer } from "./_internal/is-server.ts";
import type { ActionStateAction } from "./_types/hooks.ts";

interface QueuedAction<P, S> {
  payload: P;
  resolve: (value: S) => void;
  reject: (reason: unknown) => void;
}

/**
 * React-compatible `useActionState` — `[CLIENT]`.
 *
 * Returns a tuple `[state, dispatchAction, isPending]`, where:
 *   - `state` is the current action state.
 *   - `dispatchAction` is an async function that queues an action and resolves to the new state.
 *   - `isPending` is a boolean indicating if any actions are pending.
 *
 * Actions are queued and executed sequentially; each `reducerAction` receives the result of the previous call.
 * The `isPending` flag reflects whether the queue is active.
 *
 * SSR: Safe — initial render returns `[initialState, dispatchAction, false]`.
 * Reactivity: Bridge — state and pending flag are signal-backed slots.
 *
 * Usage: Call `useActionState` at the top level of your component to track the result of an action.
 *
 * @param reducerAction - Function called when the action is triggered. Receives `previousState` and `actionPayload`.
 * @param initialState - Initial value for the state. (Ignored after first dispatch.)
 * @param permalink - Optional unique page URL for progressive enhancement in Server Components.
 * @returns `[state, dispatchAction, isPending]`
 *
 * @example
 * ```tsx
 * import { useActionState } from "sinwan/react-client";
 *
 * async function submit(prev: { ok: boolean }, fd: FormData) {
 *   await fetch("/api", { method: "POST", body: fd });
 *   return { ok: true };
 * }
 *
 * const Form = () => {
 *   const [state, dispatchAction, pending] = useActionState(submit, { ok: false });
 *   return <form action={dispatchAction as any}>...</form>;
 * };
 * ```
 */
export function useActionState<S, P>(
  reducerAction: ActionStateAction<S, P>,
  initialState: Awaited<S>,
  permalink?: string,
): [Awaited<S>, (payload: P) => Promise<Awaited<S>>, boolean] {
  // NOTE: `permalink` is stored for progressive enhancement but is a
  // framework-level concern. Sinwan doesn't have a built-in form router,
  // so we accept it for API compatibility.
  void permalink;

  const state = useSignalSlot<Awaited<S>>(() => initialState);
  const pending = useSignalSlot<boolean>(() => false);
  const queue = useSlot<QueuedAction<P, Awaited<S>>[]>(() => []);
  const running = useSignalSlot<boolean>(() => false);

  const dispatchAction = (payload: P): Promise<Awaited<S>> => {
    // Dev-mode warning when an async action is dispatched outside a Transition.
    // NOTE: We match React's behavior: only async actions trigger the warning.
    if (!inTransition() && !isServer()) {
      const probe = reducerAction(state.peek() as Awaited<S>, payload);
      if (probe && typeof (probe as PromiseLike<S>).then === "function") {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.error(
            "An async function with useActionState was called outside of a transition. " +
              "This is likely not what you intended (for example, isPending will not update correctly). " +
              "Either call the returned function inside startTransition, " +
              "or pass it to an `action` or `formAction` prop.",
          );
        }
      }
    }

    const promise = new Promise<Awaited<S>>((resolve, reject) => {
      queue.push({ payload, resolve, reject });
    });
    pending.value = true;

    if (!running.peek()) {
      running.value = true;
      // Defer processing to the next microtask so that multiple
      // synchronous dispatches in the same tick get batched.
      queueMicrotask(() => processQueue());
    }

    return promise;
  };

  const processQueue = async (): Promise<void> => {
    try {
      while (queue.length > 0) {
        const item = queue[0]; // peek — removal happens after success or on error
        const currentState = state.peek() as Awaited<S>;

        try {
          const result = withTransition(() =>
            runInBatch(() => reducerAction(currentState, item.payload)),
          );

          let nextState: Awaited<S>;
          if (result && typeof (result as PromiseLike<S>).then === "function") {
            nextState = (await (result as Promise<S>)) as Awaited<S>;
          } else {
            nextState = result as Awaited<S>;
          }

          runInBatch(() => {
            state.value = nextState;
          });

          queue.shift(); // successfully processed, remove it
          item.resolve(nextState);
        } catch (e) {
          queue.shift(); // remove failed item
          item.reject(e);

          // React cancels all queued actions when one throws.
          // We reject every remaining queued promise with a cancellation error.
          while (queue.length > 0) {
            const remaining = queue.shift()!;
            remaining.reject(
              new Error("Action cancelled due to previous error"),
            );
          }

          pending.value = false;
          running.value = false;

          // NOTE: React would rethrow from the hook during render to trigger
          // the nearest Error Boundary. Sinwan doesn't have Error Boundaries
          // in the React sense, so we surface the error through Promise
          // rejections. The caller can `await dispatchAction()` and catch.
          return;
        }
      }
    } finally {
      // Only clear flags if the queue is truly empty. A new item may have
      // been added during the last await.
      if (queue.length === 0) {
        pending.value = false;
        running.value = false;
      } else {
        // New items arrived while we were processing; keep running.
        queueMicrotask(() => processQueue());
      }
    }
  };

  return [
    createStateGetter(state) as unknown as Awaited<S>,
    dispatchAction,
    createStateGetter(pending) as unknown as boolean,
  ];
}
