import { useSlot, STATE_GETTER_MARKER } from "./_internal/bridge.ts";
import { onUnmounted } from "../../component/lifecycle.ts";
import { isServer } from "./_internal/is-server.ts";
import { effect as sinwanEffect } from "../../reactivity/effect.ts";
import { depsAreEqual } from "./use-memo.ts";
import type { EffectCallback, GetterDependencyList } from "./_types/hooks.ts";

interface InsertionEffectSlot {
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
 * React-compatible `useInsertionEffect` — `[CLIENT]`.
 *
 * Designed for CSS-in-JS libraries that must inject `<style>` tags before
 * any layout effect reads computed styles. In Sinwan's model this fires
 * synchronously on mount and whenever dependencies change, ahead of
 * `useLayoutEffect`.
 *
 * SSR: guarded — no-op on server.
 * Reactivity: deps are watched inside a Sinwan `effect()`. When a dependency
 * changes, the previous cleanup runs and the setup runs synchronously.
 *
 * @example
 * ```tsx
 * import { useInsertionEffect } from "sinwan/react-client";
 *
 * useInsertionEffect(() => {
 *   const tag = document.createElement("style");
 *   tag.textContent = ".btn { color: red }";
 *   document.head.appendChild(tag);
 *   return () => tag.remove();
 * }, []);
 * ```
 */
export function useInsertionEffect(
  effect: EffectCallback,
  deps?: GetterDependencyList,
): void {
  const slot = useSlot<InsertionEffectSlot>(() => ({
    deps: undefined,
    cleanup: undefined,
    dispose: undefined,
  }));

  if (isServer()) return;
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
    // React: run once on mount, then re-run (cleanup → setup) whenever
    // any dependency changes. Comparison uses Object.is.
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
