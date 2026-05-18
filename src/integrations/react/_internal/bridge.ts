/**
 * Signal ↔ React-style state bridge.
 *
 * Every CLIENT hook in the React-compatible API stores its slot on the
 * current Sinwan ComponentInstance. This file owns the slot machinery and
 * the helpers that convert between Sinwan signals and React-shaped state
 * tuples / refs / store snapshots.
 *
 * RULE: never mix `signal.set()` and `setState()` on the same value. This
 * module is the only source of truth for that translation.
 */

import {
  getCurrentInstance,
  type ComponentInstance,
} from "../../../component/instance.ts";
import { signal, type Signal } from "../../../reactivity/signal.ts";
import type { Computed } from "../../../reactivity/computed.ts";

// ─── Hook slot storage on the component instance ───────────

interface HookSlots {
  cursor: number;
  slots: unknown[];
  /** Signals owned by this instance — disposed on unmount via the instance. */
  signals: Signal<any>[];
}

const HOOK_KEY = Symbol.for("sinwan.react.hook_slots");

function getSlots(): HookSlots {
  const instance = getCurrentInstance();
  if (!instance) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "Warning: Invalid hook call. Hooks can only be called inside the body of a component setup function.\n" +
        "In SinwanJS, make sure you are not calling hooks inside event handlers, inside `setTimeout`/`setInterval`, " +
        "or after an `await` in an async component. Hooks must be called synchronously at the top level of the component."
      );
    }
    throw new Error(
      "[sinwan/react] Hook called outside of a component setup function. " +
        "Hooks may only be invoked at the top level of a component.",
    );
  }
  let slots = (instance as unknown as Record<symbol, HookSlots>)[HOOK_KEY];
  if (!slots) {
    slots = { cursor: 0, slots: [], signals: [] };
    (instance as unknown as Record<symbol, HookSlots>)[HOOK_KEY] = slots;
  }
  return slots;
}

/**
 * Reset the hook cursor at the start of each render. Sinwan setup runs once
 * per component instance, so this is mostly a safety helper for re-renders
 * triggered by transitions.
 */
export function resetHookCursor(instance: ComponentInstance): void {
  const slots = (instance as unknown as Record<symbol, HookSlots>)[HOOK_KEY];
  if (slots) slots.cursor = 0;
}

/**
 * Acquire (or initialise) the slot at the current cursor position. The
 * `init` factory runs only once per component instance.
 */
export function useSlot<T>(init: () => T): T {
  const slots = getSlots();
  const i = slots.cursor++;
  if (i >= slots.slots.length) {
    slots.slots.push(init());
  }
  return slots.slots[i] as T;
}

/**
 * Create (or reuse) a signal-backed slot. The signal is owned by the
 * component instance and lives until unmount (it is automatically GC'd
 * with the instance).
 */
export function useSignalSlot<T>(initial: () => T): Signal<T> {
  return useSlot<Signal<T>>(() => {
    const s = signal<T>(initial());
    const instance = getCurrentInstance();
    if (instance) {
      const slots = (instance as unknown as Record<symbol, HookSlots>)[
        HOOK_KEY
      ];
      slots.signals.push(s);
    }
    return s;
  });
}

/**
 * Apply a SetStateAction-style update against a value. Used by useState /
 * useReducer / useOptimistic.
 */
export function applyUpdate<T>(prev: T, action: T | ((prev: T) => T)): T {
  return typeof action === "function" ? (action as (p: T) => T)(prev) : action;
}

/**
 * Marker symbol used by `resolveDeps` to identify state getters that
 * should be called (dereferenced) during dependency comparison.
 */
export const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

/**
 * Type representing a state getter function created by `createStateGetter`.
 * This is a function that has the `STATE_GETTER_MARKER` symbol attached.
 */
export type StateGetter<T> = (() => T) & {
  [STATE_GETTER_MARKER]: true;
};

/**
 * Create a reactive getter for a signal that behaves like the underlying
 * value in arithmetic and string contexts while remaining reactive in
 * the Sinwan renderer (functions are treated as reactive nodes).
 */
export function createStateGetter<T>(
  sig: Signal<T> | Computed<T>,
): StateGetter<T> {
  const getter = () => sig.value;
  (getter as any)[STATE_GETTER_MARKER] = true;
  // Store the signal reference for dependency comparison
  (getter as any).__signal__ = sig;
  getter.valueOf = () => sig.value as any;
  getter.toString = () => String(sig.value);
  (getter as any)[Symbol.toPrimitive] = (hint: string) => {
    const val = sig.value;
    if (hint === "string") return String(val);
    return Number(val);
  };
  return getter as StateGetter<T>;
}
