/**
 * SinwanJS Reactivity — Public API
 *
 * Fine-grained reactive primitives: signals, computed values,
 * effects, batching, and scheduling.
 */

// Core primitives
export { signal, isSignal } from "./signal.ts";
export type { Signal } from "./signal.ts";

export { computed, isComputed } from "./computed.ts";
export type { Computed } from "./computed.ts";

export { effect, untrack } from "./effect.ts";
export type { CleanupFn, EffectFn } from "./effect.ts";

// Explicit deps & Observable interop
export { on } from "./on.ts";
export { observable } from "./observable.ts";
export type { Observer, Subscription, Observable } from "./observable.ts";

// Batching & scheduling
export { batch } from "./batch.ts";
export { nextTick, flushSync } from "./scheduler.ts";
export { isReactive, resolve } from "./normalization.ts";
