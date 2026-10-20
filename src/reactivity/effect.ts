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

// ─── Effect scope ──────────────────────────────────────────

/**
 * An effect scope collects effect dispose functions so they can be torn down
 * together — e.g. when a component instance is unmounted, soft-hidden, or
 * hot-swapped via HMR.
 *
 * `ComponentInstance` structurally satisfies this interface via its
 * `effects: CleanupFn[]` field, so an instance can serve directly as a scope.
 */
export interface EffectScope {
  effects: CleanupFn[];
}

const EFFECT_SCOPE_KEY = Symbol.for("sinwan.effectScope");
type ScopeSlot = { [EFFECT_SCOPE_KEY]?: EffectScope | null };
const scopeSlot = globalThis as unknown as ScopeSlot;
if (!(EFFECT_SCOPE_KEY in scopeSlot)) {
  scopeSlot[EFFECT_SCOPE_KEY] = null;
}

/**
 * Set the active effect scope. Effects created via `effect()` while a scope is
 * active auto-register their dispose function on it, so they are cleaned up
 * when the scope is torn down. Returns the previous scope for restoration.
 */
export function setActiveEffectScope(
  scope: EffectScope | null,
): EffectScope | null {
  const prev = scopeSlot[EFFECT_SCOPE_KEY] ?? null;
  scopeSlot[EFFECT_SCOPE_KEY] = scope;
  return prev;
}

/**
 * Returns the currently active effect scope (or null outside any scope).
 */
export function getActiveEffectScope(): EffectScope | null {
  return scopeSlot[EFFECT_SCOPE_KEY] ?? null;
}

// ─── Subscription interface ────────────────────────────────

/**
 * A Dep is any object that can track subscribers.
 * Signals and computeds implement this internally.
 * Dense array (not Set): Create-10k allocates tens of thousands of
 * subscriptions — Set add/delete dominated that path.
 */
export interface Dep {
  subscribers: ReactiveEffect[];
  /** Called when the last subscriber is removed (e.g. createSelector Map trim). */
  onEmpty?: () => void;
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
  /**
   * Deps tracked in the current run. Array (not Set): template text/class
   * effects almost always have 0–2 deps, and Create-10k allocates tens of
   * thousands of effects — Set overhead dominated the create path.
   */
  _newDeps: Dep[] = [];
  /**
   * When true, a re-run whose dependency list is unchanged skips
   * unsubscribe/resubscribe. The run still tracks, so a getter that switches
   * signals (flag ? a : b) subscribes to the new source.
   */
  fixed = false;
  private _fixedReady = false;

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
    this._newDeps.length = 0;

    try {
      const result = this.fn();
      if (typeof result === "function") {
        this.cleanup = result;
      }
    } finally {
      activeEffect = prevEffect;
      effectStack.pop();
      // Stable fixed bindings keep their subscriptions. A changed list still
      // unsubscribes dropped deps and keeps newly tracked ones.
      if (
        this.fixed &&
        this._fixedReady &&
        sameDepList(this.deps, this._newDeps)
      ) {
        this._newDeps.length = 0;
      } else {
        this.cleanupDeps();
        if (this.fixed) this._fixedReady = true;
      }
    }
  }

  /**
   * Unsubscribe from deps that were not re-tracked in the latest run.
   * Swaps the tracked-deps buffer to avoid allocating a fresh array each run.
   */
  private cleanupDeps(): void {
    const next = this._newDeps;
    const prev = this.deps;
    for (let i = 0; i < prev.length; i++) {
      const dep = prev[i]!;
      let found = false;
      for (let j = 0; j < next.length; j++) {
        if (next[j] === dep) {
          found = true;
          break;
        }
      }
      if (!found) {
        removeSubscriber(dep, this);
      }
    }
    // Swap buffers: deps becomes the just-tracked list; recycle the old array.
    this.deps = next;
    prev.length = 0;
    this._newDeps = prev;
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
      removeSubscriber(dep, this);
    }
    this.deps.length = 0;
    this._newDeps.length = 0;

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
export interface EffectOptions {
  /**
   * Skip unsubscribe/resubscribe when a re-run reads the same dependencies
   * in the same order. New dependencies are still tracked. For template text
   * bindings whose source usually stays on one signal.
   */
  fixed?: boolean;
}

export function effect(fn: EffectFn, options?: EffectOptions): CleanupFn {
  const e = new ReactiveEffect(fn);
  if (options?.fixed) e.fixed = true;
  // Run immediately (synchronous first run for initial tracking)
  e.run();
  const dispose = () => e.dispose();

  // Auto-register on the active effect scope (e.g. a component instance) so
  // the effect is disposed when the scope is torn down — unmount, Activity
  // soft-hide, or HMR hot-swap. Without this, effects created directly in a
  // component body leak across HMR edits and fire once per accumulated
  // version. ReactiveEffect.dispose() is idempotent, so a manual dispose()
  // call by the caller is still safe.
  const scope = getActiveEffectScope();
  if (scope) {
    scope.effects.push(dispose);
  }

  return dispose;
}

// ─── Tracking helpers (used by signals/computed) ───────────

/**
 * Track a dependency from the currently active effect.
 * Called by signal.value getters.
 */
export function track(dep: Dep): void {
  if (activeEffect) {
    const effect = activeEffect;
    const tracked = effect._newDeps;

    // Prevent duplicate tracking in the same run (linear — deps are tiny).
    for (let i = 0; i < tracked.length; i++) {
      if (tracked[i] === dep) {
        return;
      }
    }

    tracked.push(dep);
    addSubscriber(dep, effect);
  }
}

/**
 * Trigger all subscribers of a dependency.
 * Called by signal.value setters.
 */
export function trigger(dep: Dep): void {
  const subs = dep.subscribers;
  const n = subs.length;
  if (n === 0) return;
  if (n === 1) {
    const effect = subs[0]!;
    if (effect.active) effect.notify();
    return;
  }
  // Snapshot so dispose during notify cannot skip remaining subscribers.
  const snapshot = subs.slice();
  for (let i = 0; i < snapshot.length; i++) {
    const effect = snapshot[i]!;
    if (effect.active) {
      effect.notify();
    }
  }
}

function sameDepList(prev: Dep[], next: Dep[]): boolean {
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

function addSubscriber(dep: Dep, effect: ReactiveEffect): void {
  const subs = dep.subscribers;
  for (let i = 0; i < subs.length; i++) {
    if (subs[i] === effect) return;
  }
  subs.push(effect);
}

function removeSubscriber(dep: Dep, effect: ReactiveEffect): void {
  const subs = dep.subscribers;
  for (let i = 0; i < subs.length; i++) {
    if (subs[i] === effect) {
      const last = subs.length - 1;
      subs[i] = subs[last]!;
      subs.pop();
      if (subs.length === 0) {
        dep.onEmpty?.();
      }
      return;
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
