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
 * const Timer = createComponent(() => {
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
