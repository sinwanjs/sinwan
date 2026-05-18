import { useSignalSlot, createStateGetter } from "./_internal/bridge.ts";
import { onMounted, onUnmounted } from "../../component/lifecycle.ts";
import { isServer } from "./_internal/is-server.ts";

/**
 * React-compatible `useSyncExternalStore` — `[CLIENT]`.
 *
 * The canonical bridge between an external mutable store and Sinwan's
 * reactive component tree. Always prefer this hook when reading shared
 * state authored outside the component (Zustand-shaped stores, browser
 * APIs, sinwan signals you don't own, etc.).
 *
 * SSR: safe — returns `getServerSnapshot()` when available, otherwise
 * `getSnapshot()`.
 * Reactivity: bridge — internally allocates a Sinwan signal that re-emits
 * the snapshot whenever `subscribe` fires.
 *
 * @example
 * ```tsx
 * import { useSyncExternalStore } from "sinwan/react-client";
 * import { signal } from "sinwan";
 *
 * const counter = signal(0);
 * const subscribe = (cb: () => void) => counter.subscribe(() => cb());
 * const getSnapshot = () => counter.peek();
 *
 * const Counter = () => {
 *   const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
 *   return <span>{value}</span>;
 * };
 * ```
 */
export function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  if (isServer()) {
    if (getServerSnapshot) {
      return getServerSnapshot();
    }
    throw new Error(
      "[sinwan/react] useSyncExternalStore: `getServerSnapshot` is required " +
        "for server rendering. Provide a `getServerSnapshot` function or " +
        "wrap the component in a client-only guard.",
    );
  }

  const sig = useSignalSlot<T>(() => getSnapshot());

  // Wire the subscription on mount; tear down on unmount.
  let unsubscribe: (() => void) | null = null;
  onMounted(() => {
    // Refresh once after mount in case the store changed during setup.
    sig.value = getSnapshot();
    unsubscribe = subscribe(() => {
      const next = getSnapshot();
      if (!Object.is(next, sig.peek())) sig.value = next;
    });
  });
  onUnmounted(() => {
    if (unsubscribe) unsubscribe();
  });

  return createStateGetter(sig) as unknown as T;
}
