import { useSlot, STATE_GETTER_MARKER } from "./_internal/bridge.ts";
import { onUnmounted } from "../../component/lifecycle.ts";
import { isServer } from "./_internal/is-server.ts";
import { effect as sinwanEffect } from "../../reactivity/effect.ts";
import { depsAreEqual } from "./use-memo.ts";
import type { EffectCallback, GetterDependencyList } from "./_types/hooks.ts";

interface LayoutEffectSlot {
  deps: any[] | undefined;
  cleanup: (() => void) | void;
  dispose: (() => void) | undefined;
}

function resolveDeps(
  deps: GetterDependencyList | undefined,
): any[] | undefined {
  if (deps === undefined) return undefined;
  return deps.map((d) => {
    if (typeof d === "function" && (d as any)[STATE_GETTER_MARKER]) {
      return d();
    }
    return d;
  });
}

/**
 * React-compatible `useLayoutEffect` — `[CLIENT]`.
 *
 * Runs synchronously immediately after the component is mounted to the DOM
 * (and synchronously whenever deps change), before the browser paints.
 * On the server it is a no-op (React-compatible).
 *
 * SSR: guarded.
 * Reactivity: deps are watched inside a Sinwan `effect()`. When a dependency
 * changes, the previous cleanup runs and the setup runs synchronously.
 *
 * @example
 * ```tsx
 * import { useLayoutEffect, useRef } from "sinwan/react-client";
 *
 * const Measure = () => {
 *   const ref = useRef<HTMLDivElement>(null);
 *   useLayoutEffect(() => {
 *     if (ref.current) console.log(ref.current.getBoundingClientRect());
 *   }, []);
 *   return <div ref={ref} />;
 * };
 * ```
 */
export function useLayoutEffect(
  effect: EffectCallback,
  deps?: GetterDependencyList,
): void {
  const slot = useSlot<LayoutEffectSlot>(() => ({
    deps: undefined,
    cleanup: undefined,
    dispose: undefined,
  }));

  if (isServer()) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "Warning: useLayoutEffect does nothing on the server, because its effect cannot " +
        "be encoded into the server renderer's output format. This will lead to a mismatch " +
        "between the initial, non-hydrated UI and the intended UI. To avoid this, useLayoutEffect " +
        "should only be used in components that render exclusively on the client."
      );
    }
    return;
  }
  if (slot.dispose) return;

  let unmounted = false;

  if (deps === undefined) {
    // ── No dependency array ──────────────────────────────────────────────
    // React: runs synchronously after every render (mount + every update).
    // Sinwan equivalent: wrap the effect body in a reactive sinwanEffect
    // so it re-runs whenever any signal read inside changes.
    slot.dispose = () => {}; // mark as registered

    let cleanup: (() => void) | void;

    const innerDispose = sinwanEffect(() => {
      if (unmounted) return;
      if (typeof cleanup === "function") {
        cleanup();
        cleanup = undefined;
      }
      cleanup = effect() as (() => void) | void;
    });

    // Replace the no-op dispose with the real one so onUnmounted can stop it
    slot.dispose = innerDispose;

    onUnmounted(() => {
      unmounted = true;
      innerDispose();
      if (typeof cleanup === "function") cleanup();
    });
  } else {
    // ── Dependency array (empty [] or [a, b, ...]) ───────────────────────
    slot.dispose = sinwanEffect(() => {
      const currentDeps = resolveDeps(deps);

      if (
        slot.deps === undefined ||
        currentDeps === undefined ||
        !depsAreEqual(slot.deps, currentDeps)
      ) {
        if (typeof slot.cleanup === "function") {
          slot.cleanup();
          slot.cleanup = undefined;
        }
        slot.deps = currentDeps;
        if (!unmounted) {
          slot.cleanup = effect() as (() => void) | void;
        }
      }
    });

    onUnmounted(() => {
      unmounted = true;
      if (slot.dispose) slot.dispose();
      if (typeof slot.cleanup === "function") slot.cleanup();
    });
  }
}
