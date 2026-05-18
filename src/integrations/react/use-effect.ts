import { useSlot, STATE_GETTER_MARKER } from "./_internal/bridge.ts";
import {
  onMounted,
  onUpdated,
  onUnmounted,
} from "../../component/lifecycle.ts";
import {
  getCurrentInstance,
  setCurrentInstance,
} from "../../component/instance.ts";
import { isServer } from "./_internal/is-server.ts";
import { effect as sinwanEffect } from "../../reactivity/effect.ts";
import { depsAreEqual } from "./use-memo.ts";
import type { EffectCallback, GetterDependencyList } from "./_types/hooks.ts";

interface EffectSlot {
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

function registerEffect(
  effect: EffectCallback,
  schedule: (fn: () => void) => void,
  deps?: GetterDependencyList,
): void {
  const slot = useSlot<EffectSlot>(() => ({
    deps: undefined,
    cleanup: undefined,
    dispose: undefined,
  }));

  if (isServer()) return;
  if (slot.dispose) return;

  const instance = getCurrentInstance();
  let unmounted = false;

  function runEffect(): (() => void) | void {
    if (!instance) return effect();
    const prev = setCurrentInstance(instance);
    try {
      return effect();
    } finally {
      setCurrentInstance(prev);
    }
  }

  if (deps === undefined) {
    // ── No dependency array ──────────────────────────────────────────────
    // React: runs after every render (mount + every update).
    // Sinwan equivalent: run after mount and after every reactive DOM update
    // (onUpdated fires when this component's reactive blocks update).
    slot.dispose = () => {}; // mark as registered

    let cleanup: (() => void) | void;
    let pending = false;

    const run = () => {
      if (typeof cleanup === "function") {
        cleanup();
        cleanup = undefined;
      }
      if (!pending) {
        pending = true;
        schedule(() => {
          pending = false;
          if (unmounted) return;
          cleanup = runEffect() as (() => void) | void;
        });
      }
    };

    onMounted(() => run());
    onUpdated(() => run());

    onUnmounted(() => {
      unmounted = true;
      if (typeof cleanup === "function") cleanup();
    });
  } else {
    // ── Dependency array (empty [] or [a, b, ...]) ───────────────────────
    // React: run once on mount, then re-run (cleanup → setup) whenever
    // any dependency changes. Comparison uses Object.is.
    let pending = false;

    slot.dispose = sinwanEffect(() => {
      const currentDeps = resolveDeps(deps);

      if (
        slot.deps === undefined ||
        currentDeps === undefined ||
        !depsAreEqual(slot.deps, currentDeps)
      ) {
        // Deps changed (or first run) — cleanup previous effect, then schedule new setup
        if (typeof slot.cleanup === "function") {
          slot.cleanup();
          slot.cleanup = undefined;
        }
        slot.deps = currentDeps;

        if (!pending) {
          pending = true;
          schedule(() => {
            pending = false;
            if (unmounted) return;
            slot.cleanup = runEffect() as (() => void) | void;
          });
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

/**
 * React-compatible `useEffect` — `[CLIENT]`.
 *
 * SSR: guarded — registers a no-op on the server (effect callbacks never
 * fire during SSR; matches React semantics).
 * Reactivity: deps are watched inside a Sinwan `effect()`. When a dependency
 * changes, the previous cleanup runs and the setup is re-scheduled via
 * `queueMicrotask` (after paint, matching React semantics).
 *
 * NOTE on deps: Dep values should be Sinwan state getters (e.g. from `useState`).
 * Pass the getter function itself (e.g. `count`), not the called value (e.g. `count()`).
 * Getters are resolved inside a reactive context so changes are tracked automatically.
 *
 * @example
 * ```tsx
 * import { useEffect } from "sinwan/react-client";
 *
 * const Counter = () => {
 *   const [count, setCount] = useState(0);
 *   useEffect(() => {
 *     console.log(`count changed: ${count()}`);
 *   }, [count]); // Pass the getter, not count()
 *   return <span>{count}</span>;
 * };
 * ```
 */
export function useEffect(
  effect: EffectCallback,
  deps?: GetterDependencyList,
): void {
  registerEffect(effect, queueMicrotask, deps);
}
