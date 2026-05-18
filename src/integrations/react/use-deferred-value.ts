import {
  useSignalSlot,
  useSlot,
  createStateGetter,
} from "./_internal/bridge.ts";
import { deferToNextTick, inTransition } from "./_internal/scheduler.ts";
import { isServer } from "./_internal/is-server.ts";
import { resolve } from "../../reactivity/normalization.ts";
import { effect } from "../../reactivity/effect.ts";
import { getCurrentInstance } from "../../component/instance.ts";

/**
 * React-compatible `useDeferredValue` — `[CLIENT]`.
 *
 * Returns a value that lags one Sinwan tick behind its input. Sinwan's
 * synchronous effect scheduler does not implement React's full concurrent
 * priority model, so the implementation is best-effort: the deferred copy
 * is updated via `nextTick`, never synchronously.
 *
 * SSR: returns the input value as-is (no deferral on the server).
 * Reactivity: bridge — backed by a signal updated through the scheduler.
 *
 * @example
 * ```tsx
 * import { useDeferredValue, useState } from "sinwan/react-client";
 *
 * const Search = () => {
 *   const [query, setQuery] = useState("");
 *   const deferred = useDeferredValue(query);
 *   return <Results query={deferred} />;
 * };
 * ```
 */
export function useDeferredValue<T>(value: T, initialValue?: T): T {
  if (isServer()) return value;

  // NOTE: In Sinwan, hooks like useState return getter functions instead of
  // raw values. We unwrap reactive inputs so useDeferredValue works
  // transparently with the rest of the React-compatible hook set.
  const resolvedValue = resolve(value as any) as T;
  const resolvedInitial =
    initialValue !== undefined
      ? (resolve(initialValue as any) as T)
      : undefined;

  const sig = useSignalSlot<T>(() =>
    resolvedInitial !== undefined ? resolvedInitial : resolvedValue,
  );

  // Mutable ref so the deferred callback always sees the latest rendered
  // value, preventing stale updates if the value changed back before the
  // microtask ran.
  const latestRef = useSlot<{ current: T }>(() => ({ current: resolvedValue }));
  latestRef.current = resolvedValue;

  // On mount, if the resolved value differs from the signal, schedule a
  // deferred update (or apply immediately if inside a transition).
  if (!Object.is(sig.peek(), resolvedValue)) {
    if (inTransition()) {
      sig.value = resolvedValue;
    } else {
      deferToNextTick(() => {
        if (!Object.is(sig.peek(), latestRef.current)) {
          sig.value = latestRef.current;
        }
      });
    }
  }

  // Create a reactive effect that tracks the input value and schedules
  // deferred updates. This is necessary because Sinwan components don't
  // re-render like React components do — signals update the DOM directly.
  const instance = getCurrentInstance();
  const dispose = effect(() => {
    const currentValue = resolve(value as any) as T;
    latestRef.current = currentValue;

    if (!Object.is(sig.peek(), currentValue)) {
      if (inTransition()) {
        sig.value = currentValue;
      } else {
        deferToNextTick(() => {
          if (!Object.is(sig.peek(), latestRef.current)) {
            sig.value = latestRef.current;
          }
        });
      }
    }
  });

  if (instance) {
    instance.effects.push(dispose);
  }

  return createStateGetter(sig) as unknown as T;
}
