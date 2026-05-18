import type {
  ComponentType,
  LazyExoticComponent,
  React_ComponentProps,
} from "./_types/core.ts";
import { REACT_LAZY_TYPE } from "./_internal/symbols.ts";

interface LazyState<T> {
  status: "pending" | "resolved" | "rejected";
  promise?: PromiseLike<unknown>;
  result?: T;
  error?: unknown;
}

/**
 * React-compatible `lazy` — `[SHARED]`.
 *
 * SSR: safe (the component renders nothing until the import resolves).
 * Reactivity: bridge — throws a pending Promise on first render so that
 * a surrounding `<Suspense>` boundary catches it and shows fallback. After
 * resolution the component renders directly; the Promise and result are
 * cached so `load` is called at most once.
 *
 * @example
 * ```tsx
 * import { lazy, Suspense } from "sinwan/react-client";
 *
 * const Modal = lazy(() => import("./Modal.tsx"));
 *
 * <Suspense fallback={<div>Loading…</div>}>
 *   <Modal />
 * </Suspense>
 * ```
 */
export function lazy<C extends ComponentType<any>>(
  load: () => Promise<{ default: C }>,
): LazyExoticComponent<C> {
  const state: LazyState<C> = { status: "pending" };

  const start = (): PromiseLike<unknown> => {
    if (!state.promise) {
      const loadPromise = load();
      state.promise = loadPromise;
      loadPromise.then(
        (mod) => {
          state.status = "resolved";
          state.result = mod.default;
        },
        (err) => {
          state.status = "rejected";
          state.error = err;
        },
      );
    }
    return state.promise;
  };

  const Lazy = ((props: React_ComponentProps<C>) => {
    if (state.status === "resolved") {
      return (state.result as unknown as (p: any) => unknown)(props) as any;
    }
    if (state.status === "rejected") {
      throw state.error;
    }
    // Throw the promise so Suspense can catch it and show fallback.
    throw start();
  }) as unknown as LazyExoticComponent<C>;

  (Lazy as any).$$typeof = REACT_LAZY_TYPE;
  (Lazy as any)._result = state;
  (Lazy as any).displayName = "Lazy";

  return Lazy;
}
