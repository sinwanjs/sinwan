/**
 * SinwanJS Reactivity — Scheduler
 *
 * Microtask-based flush queue for batching reactive updates.
 * Effects are NOT run synchronously on signal write — they are
 * queued and flushed in a microtask (like Vue's nextTick).
 */

export interface EffectNode {
  id: number;
  run(): void;
  active: boolean;
}

const pendingEffects = new Set<EffectNode>();
let flushScheduled = false;
let isFlushing = false;

// Pending nextTick callbacks
const pendingCallbacks: (() => void)[] = [];

/**
 * Schedule an effect for the next microtask flush.
 */
export function scheduleEffect(effect: EffectNode): void {
  if (!effect.active) return;
  pendingEffects.add(effect);
  scheduleFlush();
}

/**
 * Remove a scheduled effect (e.g. when disposed before flush).
 */
export function unscheduleEffect(effect: EffectNode): void {
  pendingEffects.delete(effect);
}

/**
 * Schedule the microtask flush if not already scheduled.
 */
function scheduleFlush(): void {
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

/**
 * Flush all pending effects. Effects added during flush are
 * processed in the same pass (convergence loop with a safety limit).
 */
function extractEffects(): EffectNode[] {
  const size = pendingEffects.size;
  if (size <= 1) {
    const out: EffectNode[] = new Array(size);
    let i = 0;
    for (const effect of pendingEffects) {
      out[i++] = effect;
    }
    return out;
  }
  const out: EffectNode[] = new Array(size);
  let i = 0;
  for (const effect of pendingEffects) {
    out[i++] = effect;
  }
  return out.sort((a, b) => a.id - b.id);
}

function flush(): void {
  isFlushing = true;

  let effects = extractEffects();
  pendingEffects.clear();

  for (const effect of effects) {
    if (effect.active) {
      try {
        effect.run();
      } catch (err) {
        console.error("[Sinwan] Effect flush error:", err);
      }
    }
  }

  // If new effects were queued during the flush, drain them too
  // (safety limit to prevent infinite loops)
  let safety = 10;
  while (pendingEffects.size > 0 && safety-- > 0) {
    effects = extractEffects();
    pendingEffects.clear();
    for (const effect of effects) {
      if (effect.active) {
        try {
          effect.run();
        } catch (err) {
          console.error("[Sinwan] Effect flush error:", err);
        }
      }
    }
  }

  flushScheduled = false;
  isFlushing = false;

  // Run nextTick callbacks after all effects
  const cbs = pendingCallbacks.splice(0);
  for (const cb of cbs) {
    cb();
  }
}

/**
 * Returns true if the scheduler is currently flushing effects.
 */
export function isFlushingEffects(): boolean {
  return isFlushing;
}

/**
 * Queue a callback that runs after the next reactive flush completes.
 * Similar to Vue's nextTick().
 */
export function nextTick(fn?: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    const callback = () => {
      fn?.();
      resolve();
    };
    if (flushScheduled || isFlushing) {
      // Effects are pending — run after they flush
      pendingCallbacks.push(callback);
    } else {
      // No pending effects — run on next microtask
      queueMicrotask(callback);
    }
  });
}

/**
 * Force synchronous flush of all pending effects.
 * Primarily for testing and batch().
 */
export function flushSync(): void {
  if (flushScheduled) {
    flushScheduled = false;
    flush();
  }
}
