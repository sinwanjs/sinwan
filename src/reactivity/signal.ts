/**
 * SinwanJS Reactivity — Signal
 *
 * A signal is a reactive container for a single value.
 * Reading `.value` tracks the current effect as a subscriber.
 * Writing `.value` notifies all subscribers.
 *
 * Inspired by Vue 3 ref(), Solid signals, Preact signals.
 */

import { type Dep, track, trigger } from "./effect.ts";

// ─── HMR signal slot storage ────────────────────────────────
//
// When a signal is created inside a component setup, it auto-registers on
// the ComponentInstance so its value survives HMR hot-swaps. Uses the same
// cursor pattern as hook_slots: on first run, signals are pushed; on re-run
// (after hot-swap reset), the existing signal is returned instead of creating
// a new one.
//
// Access to currentInstance is via globalThis Symbol to avoid circular imports
// (instance.ts → reactivity/index.ts → signal.ts).

const CURRENT_INSTANCE_KEY = Symbol.for("sinwan.currentInstance");
const SIGNAL_SLOTS_KEY = Symbol.for("sinwan.signal_slots");

interface SignalSlots {
  cursor: number;
  signals: Signal<any>[];
}

function getSignalSlots(): SignalSlots | null {
  const instance = (globalThis as any)[CURRENT_INSTANCE_KEY];
  if (!instance) return null;
  let slots: SignalSlots = (instance as any)[SIGNAL_SLOTS_KEY];
  if (!slots) {
    slots = { cursor: 0, signals: [] };
    (instance as any)[SIGNAL_SLOTS_KEY] = slots;
  }
  return slots;
}

// When > 0, signals created via `signal()` are NOT registered into the
// instance's signal_slots. The React hook bridge uses this so hook-internal
// signals (useState/useReducer/...) — which are already preserved via
// hook_slots and created only once via the slot init — do not pollute the
// user-land signal_slots cursor. Without this, mixing useState + signal()
// misaligns the signal cursor across HMR hot-swaps (hook-internal signal()
// runs on first render but not on reuse), cross-wiring unrelated state.
let suppressSlotRegistration = 0;

/**
 * Internal: run `fn` without registering any signals it creates into the
 * current instance's signal_slots. Re-entrant (nesting-safe).
 */
export function withoutSignalSlotRegistration<T>(fn: () => T): T {
  suppressSlotRegistration++;
  try {
    return fn();
  } finally {
    suppressSlotRegistration--;
  }
}

// ─── Signal interface ──────────────────────────────────────

export interface Signal<T> {
  /** Get or set the reactive value. Reading tracks; writing notifies. */
  value: T;

  /** Read the value without tracking dependencies. */
  peek(): T;

  /** Manually subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn: (value: T) => void): () => void;
}

// Brand for type-checking — Symbol.for ensures recognition across bundle boundaries
const SIGNAL_BRAND = Symbol.for("Sinwan:signal");

// ─── Implementation ────────────────────────────────────────

class SignalImpl<T> implements Signal<T>, Dep {
  [SIGNAL_BRAND] = true;

  subscribers = new Set<import("./effect.ts").ReactiveEffect>();
  private _value: T;
  private _manualSubs = new Set<(value: T) => void>();

  constructor(initial: T) {
    this._value = initial;
  }

  get value(): T {
    track(this);
    return this._value;
  }

  set value(newValue: T) {
    if (Object.is(this._value, newValue)) return;
    this._value = newValue;
    trigger(this);

    // Notify manual subscribers
    for (const fn of this._manualSubs) {
      fn(newValue);
    }
  }

  peek(): T {
    return this._value;
  }

  subscribe(fn: (value: T) => void): () => void {
    this._manualSubs.add(fn);
    return () => {
      this._manualSubs.delete(fn);
    };
  }

  /**
   * toString() for interpolation in templates.
   */
  toString(): string {
    return String(this.value);
  }

  /**
   * valueOf() for numeric operations.
   */
  valueOf(): T {
    return this.value;
  }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Create a reactive signal.
 *
 * @example
 * const count = signal(0);
 * console.log(count.value); // 0
 *
 * effect(() => {
 *   console.log(count.value); // re-runs when count changes
 * });
 *
 * count.value = 5; // triggers the effect
 */
export function signal<T>(initial: T): Signal<T> {
  // DEV only: auto-register on the ComponentInstance so the signal's value
  // survives HMR hot-swaps. In production this branch is dead-code-eliminated.
  if (
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    suppressSlotRegistration === 0
  ) {
    const slots = getSignalSlots();
    if (slots) {
      const i = slots.cursor++;
      if (i < slots.signals.length) {
        // Re-run after HMR hot-swap: return the existing signal (value preserved)
        return slots.signals[i] as Signal<T>;
      }
      // First run: create new signal and store it
      const s = new SignalImpl(initial);
      slots.signals.push(s);
      return s;
    }
  }
  return new SignalImpl(initial);
}

/**
 * Type guard: check if a value is a Signal.
 */
export function isSignal(value: unknown): value is Signal<unknown> {
  return (
    value != null && typeof value === "object" && SIGNAL_BRAND in (value as any)
  );
}
