/**
 * SinwanJS Reactivity — Effect
 *
 * Fine-grained effect system with automatic dependency tracking.
 * When an effect runs, any signal reads are tracked as dependencies.
 * When those signals change, the effect is re-scheduled.
 */

import {
  type EffectNode,
  scheduleEffect,
  unscheduleEffect,
} from "./scheduler.ts";

// ─── Global tracking state ─────────────────────────────────

let activeEffect: ReactiveEffect | null = null;
const effectStack: ReactiveEffect[] = [];
let effectIdCounter = 0;

// ─── Subscription interface ────────────────────────────────

/**
 * A Dep is any object that can track subscribers.
 * Signals and computeds implement this internally.
 */
export interface Dep {
  subscribers: Set<ReactiveEffect>;
}

// ─── ReactiveEffect ────────────────────────────────────────

export type CleanupFn = () => void;
export type EffectFn = () => CleanupFn | void;

export class ReactiveEffect implements EffectNode {
  id: number;
  active = true;

  /** The user-supplied function */
  private fn: EffectFn;

  /** Cleanup returned from the last run */
  private cleanup: CleanupFn | void = undefined;

  /** All deps this effect is subscribed to (for bidirectional cleanup) */
  deps: Dep[] = [];
  _depsLength = 0;

  constructor(fn: EffectFn) {
    this.id = effectIdCounter++;
    this.fn = fn;
  }

  /**
   * Execute the effect function while tracking dependencies.
   */
  run(): void {
    if (!this.active) return;

    // Prevent infinite re-entry
    if (effectStack.includes(this)) return;

    // Run user cleanup from previous execution
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }

    // Push onto the tracking stack
    effectStack.push(this);
    const prevEffect = activeEffect;
    activeEffect = this;

    try {
      const result = this.fn();
      if (typeof result === "function") {
        this.cleanup = result;
      }
    } finally {
      activeEffect = prevEffect;
      effectStack.pop();
      // Clean up dependencies that weren't re-tracked in this run
      this.cleanupDeps();
    }
  }

  /**
   * Unsubscribe from deps that were not re-tracked in the latest run.
   * Truncates the deps array to only keep actively tracked deps.
   */
  private cleanupDeps(): void {
    for (let i = this._depsLength; i < this.deps.length; i++) {
      this.deps[i].subscribers.delete(this);
    }
    this.deps.length = this._depsLength;
    this._depsLength = 0;
  }

  /**
   * Notify the scheduler that this effect should re-run.
   */
  notify(): void {
    scheduleEffect(this);
  }

  /**
   * Permanently dispose this effect — stop tracking & unsubscribe.
   */
  dispose(): void {
    if (!this.active) return;
    this.active = false;

    // Run user cleanup
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }

    // Remove from all deps and clear
    for (const dep of this.deps) {
      dep.subscribers.delete(this);
    }
    this.deps.length = 0;
    this._depsLength = 0;

    unscheduleEffect(this);
  }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Create a reactive effect.
 *
 * The effect function runs immediately to establish initial dependencies.
 * It re-runs whenever any tracked signal changes.
 * Returns a dispose function to stop the effect.
 *
 * @example
 * const count = signal(0);
 * const dispose = effect(() => {
 *   console.log("count is", count.value);
 * });
 * // logs "count is 0" immediately
 *
 * count.value = 1;
 * // logs "count is 1" on next microtask
 *
 * dispose(); // stops tracking
 */
export function effect(fn: EffectFn): CleanupFn {
  const e = new ReactiveEffect(fn);
  // Run immediately (synchronous first run for initial tracking)
  e.run();
  return () => e.dispose();
}

// ─── Tracking helpers (used by signals/computed) ───────────

/**
 * Track a dependency from the currently active effect.
 * Called by signal.value getters.
 */
export function track(dep: Dep): void {
  if (activeEffect) {
    const effect = activeEffect;
    dep.subscribers.add(effect);
    const oldDep = effect.deps[effect._depsLength];
    if (oldDep !== dep) {
      if (oldDep) {
        oldDep.subscribers.delete(effect);
      }
      effect.deps[effect._depsLength] = dep;
    }
    effect._depsLength++;
  }
}

/**
 * Trigger all subscribers of a dependency.
 * Called by signal.value setters.
 */
export function trigger(dep: Dep): void {
  for (const effect of dep.subscribers) {
    if (effect.active) {
      effect.notify();
    }
  }
}

/**
 * Run a function without tracking dependencies.
 * Any signal reads inside `fn` will NOT subscribe the active effect.
 */
export function untrack<T>(fn: () => T): T {
  const prevEffect = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = prevEffect;
  }
}

/**
 * Returns the currently active effect (for advanced usage).
 */
export function getActiveEffect(): ReactiveEffect | null {
  return activeEffect;
}
