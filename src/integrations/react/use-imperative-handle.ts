import {
  onMounted,
  onUpdated,
  onUnmounted,
} from "../../component/lifecycle.ts";
import { isServer } from "./_internal/is-server.ts";
import { useSlot, STATE_GETTER_MARKER } from "./_internal/bridge.ts";
import { effect as sinwanEffect } from "../../reactivity/effect.ts";
import { depsAreEqual } from "./use-memo.ts";
import type { Ref, RefCallback } from "./_types/core.ts";
import type { GetterDependencyList } from "./_types/hooks.ts";

interface ImperativeHandleSlot {
  deps: GetterDependencyList | undefined;
  dispose: (() => void) | undefined;
  cleanup: (() => void) | undefined;
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
 * React-compatible `useImperativeHandle` — `[CLIENT]`.
 *
 * Exposes an imperative handle object on a parent-supplied ref.
 *
 * SSR: guarded — no-op on the server (refs are not populated during SSR).
 * Reactivity: native — when deps include Sinwan state getters, changes are
 * tracked reactively and the handle is recreated automatically.
 *
 * @example
 * ```tsx
 * import { useImperativeHandle, useRef } from "sinwan/react-client";
 *
 * const Input = ({ apiRef }: { apiRef: { current: { focus(): void } | null } }) => {
 *   const inner = useRef<HTMLInputElement>(null);
 *   useImperativeHandle(apiRef, () => ({ focus: () => inner.current?.focus() }), []);
 *   return <input ref={inner} />;
 * };
 * ```
 */
export function useImperativeHandle<T, R extends T>(
  ref: Ref<T> | null | undefined,
  init: () => R,
  deps?: GetterDependencyList,
): void {
  const slot = useSlot<ImperativeHandleSlot>(() => ({
    deps: undefined,
    dispose: undefined,
    cleanup: undefined,
  }));

  if (isServer() || ref == null) return;
  if (slot.dispose) return;

  let unmounted = false;

  const assignHandle = (handle: R) => {
    if (typeof ref === "function") {
      slot.cleanup = (ref as RefCallback<T>)(handle) || undefined;
    } else {
      (ref as { current: T | null }).current = handle;
    }
  };

  const clearHandle = () => {
    if (typeof slot.cleanup === "function") {
      slot.cleanup();
      slot.cleanup = undefined;
    }
    if (ref != null && typeof ref !== "function") {
      (ref as { current: T | null }).current = null;
    }
  };

  if (deps === undefined) {
    // ── No dependency array ──────────────────────────────────────────────
    // React: runs on every render. Sinwan equivalent: run after mount
    // and after every reactive DOM update (onUpdated).
    slot.dispose = () => {};

    onMounted(() => {
      if (unmounted) return;
      assignHandle(init());
    });

    onUpdated(() => {
      if (unmounted) return;
      clearHandle();
      assignHandle(init());
    });

    onUnmounted(() => {
      unmounted = true;
      clearHandle();
    });
  } else {
    // ── Dependency array (empty [] or [a, b, ...]) ───────────────────────
    // React: run once on mount, then re-create handle whenever any
    // dependency changes. Comparison uses Object.is.
    let mounted = false;

    slot.dispose = sinwanEffect(() => {
      const currentDeps = resolveDeps(deps);

      if (
        slot.deps === undefined ||
        currentDeps === undefined ||
        !depsAreEqual(slot.deps, currentDeps)
      ) {
        slot.deps = currentDeps;
        if (mounted && !unmounted) {
          clearHandle();
          assignHandle(init());
        }
      }
    });

    onMounted(() => {
      mounted = true;
      if (!unmounted) {
        assignHandle(init());
      }
    });

    onUnmounted(() => {
      unmounted = true;
      mounted = false;
      if (slot.dispose) slot.dispose();
      clearHandle();
    });
  }
}
