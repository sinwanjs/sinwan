/**
 * SinwanJS Component Runtime — Lifecycle Hooks
 *
 * Vue-style lifecycle hooks that register on the current component instance.
 * Must be registered while a component instance is active: during setup,
 * or synchronously from another lifecycle hook owned by that component.
 */

import { getCurrentInstance, withInstance } from "./instance.ts";

/**
 * Register a callback that fires after the component is mounted to the DOM.
 *
 * @example
 * const Timer = cc(() => {
 *   onMounted(() => {
 *     console.log("Timer mounted!");
 *   });
 *   return <div>Timer</div>;
 * });
 */
export function onMounted(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onMounted() called outside of component setup.");
  }
  instance._mountedHooks.push(() => withInstance(instance, fn));
}

/**
 * Register a callback that fires when the component is unmounted.
 * Use for cleanup: cancel timers, remove global listeners, etc.
 *
 * @example
 * onMounted(() => {
 *   const id = setInterval(tick, 1000);
 *   onUnmounted(() => clearInterval(id));
 * });
 */
export function onUnmounted(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onUnmounted() called outside of component setup.");
  }
  instance._unmountedHooks.push(() => withInstance(instance, fn));
}

/**
 * Register a callback that fires after any reactive DOM update
 * within this component. Useful for post-update DOM measurements.
 */
export function onUpdated(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onUpdated() called outside of component setup.");
  }
  instance._updatedHooks.push(() => withInstance(instance, fn));
}

/**
 * Register a callback that fires when the component's effects are disposed.
 * Unlike onUnmounted, this also fires during Activity soft-hide when effects
 * are cleaned up but the DOM is preserved.
 */
export function onDispose(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onDispose() called outside of component setup.");
  }
  instance._disposeHooks.push(() => withInstance(instance, fn));
}

/**
 * Register a callback that fires after the component is hydrated.
 * Only runs during hydration; never fires on a fresh client mount.
 */
export function onHydrated(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onHydrated() called outside of component setup.");
  }
  instance._hydratedHooks.push(() => withInstance(instance, fn));
}

/**
 * Register a callback that fires immediately during setup if running on the
 * server. No-op on the client. Useful for server-only initialization.
 */
export function onServer(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onServer() called outside of component setup.");
  }
  if (typeof window === "undefined") {
    withInstance(instance, fn);
  }
}

/**
 * Register a callback that fires immediately during setup if running on the
 * client. No-op on the server. Useful for client-only initialization.
 */
export function onClient(fn: () => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onClient() called outside of component setup.");
  }
  if (typeof window !== "undefined") {
    withInstance(instance, fn);
  }
}

/**
 * Register an error handler for this component and its children.
 * Errors bubble up the component tree until a handler is found.
 */
export function onError(fn: (err: Error) => void): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("onError() called outside of component setup.");
  }
  instance._errorHooks.push((err) => withInstance(instance, () => fn(err)));
}
