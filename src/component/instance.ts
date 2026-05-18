/**
 * SinwanJS Component Runtime — Instance Management
 *
 * Each component rendered on the client gets a ComponentInstance
 * that tracks its lifecycle hooks, effects, parent/child tree,
 * and provide/inject context.
 *
 * A global `currentInstance` stack lets lifecycle hooks (onMounted, etc.)
 * register themselves during setup or synchronous lifecycle callbacks —
 * same pattern as Vue's getCurrentInstance.
 */

import type { SinwanComponent } from "../types.ts";
import type { MountedNode } from "../renderer/types.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import { nextTick } from "../reactivity/scheduler.ts";

// ─── ComponentInstance ─────────────────────────────────────

let uidCounter = 0;

export interface ComponentInstance {
  /** Unique identifier for this instance. */
  uid: number;

  /** The component definition (setup function). */
  component: SinwanComponent<any>;

  /** Props passed to this component. */
  props: Record<string, any>;

  /** The rendered DOM subtree (set after render). */
  element: MountedNode | null;

  /** Parent instance in the component tree. */
  parent: ComponentInstance | null;

  /** Child component instances. */
  children: ComponentInstance[];

  /** All effect dispose functions owned by this component. */
  effects: CleanupFn[];

  // ─── Lifecycle hook queues ────────────────────────────

  /** Callbacks to fire after the component is mounted to DOM. */
  _mountedHooks: (() => void)[];

  /** Callbacks to fire when the component is unmounted. */
  _unmountedHooks: (() => void)[];

  /** Callbacks to fire after any reactive update in this component. */
  _updatedHooks: (() => void)[];

  /** Callbacks to fire when the component's effects are disposed. */
  _disposeHooks: (() => void)[];

  /** Callbacks to fire after the component is hydrated. */
  _hydratedHooks: (() => void)[];

  /** Error handler callbacks. */
  _errorHooks: ((err: Error) => void)[];

  // ─── Provide/Inject context ───────────────────────────

  /** Values provided by this instance (for inject in children). */
  provides: Record<string | symbol, unknown>;

  // ─── React-compatible identifier prefix ─────────────────

  /** Prefix for useId-generated identifiers (inherited from parent). */
  identifierPrefix: string;

  // ─── State flags ──────────────────────────────────────

  isMounted: boolean;
  isUnmounted: boolean;
}

/**
 * Create a fresh ComponentInstance.
 */
export function createComponentInstance(
  component: SinwanComponent<any>,
  props: Record<string, any>,
  parent: ComponentInstance | null,
): ComponentInstance {
  return {
    uid: uidCounter++,
    component,
    props,
    element: null,
    parent,
    children: [],
    effects: [],
    _mountedHooks: [],
    _unmountedHooks: [],
    _updatedHooks: [],
    _disposeHooks: [],
    _hydratedHooks: [],
    _errorHooks: [],
    // Inherit parent's provides (prototype chain for lookup)
    provides: parent ? Object.create(parent.provides) : Object.create(null),
    identifierPrefix: parent?.identifierPrefix ?? "",
    isMounted: false,
    isUnmounted: false,
  };
}

// ─── Current instance stack ────────────────────────────────

// The active component instance must be shared across every Sinwan bundle
// (e.g. `sinwan` and `sinwan/react-client`). Each entry point is bundled with
// `splitting: false`, so a plain module-scoped variable would be duplicated
// per bundle and the renderer's `setCurrentInstance` would not be visible
// to hooks living in another bundle. We anchor the slot on `globalThis`
// using a registered Symbol so all copies of this module share one cell.
const CURRENT_INSTANCE_KEY = Symbol.for("sinwan.currentInstance");
type GlobalSlot = {
  [CURRENT_INSTANCE_KEY]?: ComponentInstance | null;
};
const globalSlot = globalThis as unknown as GlobalSlot;
if (!(CURRENT_INSTANCE_KEY in globalSlot)) {
  globalSlot[CURRENT_INSTANCE_KEY] = null;
}

/**
 * Get the currently active component instance.
 * Used by lifecycle hooks to register themselves.
 */
export function getCurrentInstance(): ComponentInstance | null {
  return globalSlot[CURRENT_INSTANCE_KEY] ?? null;
}

/**
 * Set the current instance (called by renderer before setup).
 * Returns the previous instance for restoration.
 */
export function setCurrentInstance(
  instance: ComponentInstance | null,
): ComponentInstance | null {
  const prev = globalSlot[CURRENT_INSTANCE_KEY] ?? null;
  globalSlot[CURRENT_INSTANCE_KEY] = instance;
  return prev;
}

/**
 * Run a function with `instance` as the current component instance.
 * Automatically restores the previous instance when done.
 */
export function withInstance<T>(instance: ComponentInstance, fn: () => T): T {
  const prev = setCurrentInstance(instance);
  try {
    return fn();
  } finally {
    setCurrentInstance(prev);
  }
}

// ─── Lifecycle execution ───────────────────────────────────

/**
 * Fire all onMounted hooks for an instance and its children (depth-first).
 */
export function fireMountedHooks(instance: ComponentInstance): void {
  if (instance.isUnmounted) {
    return;
  }

  // Children first
  for (const child of instance.children) {
    fireMountedHooks(child);
  }

  if (!instance.isMounted) {
    instance.isMounted = true;
    for (const hook of instance._mountedHooks) {
      hook();
    }
  }
}

/**
 * Fire all onUnmounted hooks and dispose all effects for an instance
 * and its children (depth-first, children first).
 */
export function fireUnmountedHooks(instance: ComponentInstance): void {
  // Children first
  const children = [...instance.children];
  for (const child of children) {
    fireUnmountedHooks(child);
  }

  if (!instance.isUnmounted) {
    instance.isUnmounted = true;

    // Only fire unmounted hooks if it was ever mounted
    if (instance.isMounted) {
      instance.isMounted = false;
      for (const hook of instance._unmountedHooks) {
        hook();
      }
    }

    // Fire dispose hooks when effects are torn down
    for (const hook of instance._disposeHooks) {
      hook();
    }

    // ALWAYS dispose effects owned by this component
    for (const dispose of instance.effects) {
      dispose();
    }
    instance.effects.length = 0;

    // Remove from parent to prevent memory leaks
    if (instance.parent) {
      const idx = instance.parent.children.indexOf(instance);
      if (idx !== -1) {
        instance.parent.children.splice(idx, 1);
      }
    }
  }
}

const REACT_HOOK_KEY = Symbol.for("sinwan.react.hook_slots");

function resetHookCursorLocal(instance: ComponentInstance): void {
  const slots = (instance as unknown as Record<symbol, { cursor?: number }>)[
    REACT_HOOK_KEY
  ];
  if (slots) slots.cursor = 0;
}

function clearReactEffectSlots(instance: ComponentInstance): void {
  const slots = (instance as unknown as Record<symbol, { slots?: unknown[] }>)[
    REACT_HOOK_KEY
  ];
  if (!slots?.slots) return;
  for (const slot of slots.slots) {
    if (slot && typeof slot === "object") {
      const s = slot as Record<string, unknown>;
      if ("dispose" in s && ("cleanup" in s || "deps" in s)) {
        // onUnmounted hooks already called cleanup and disposed the effect.
        // Just clear the slot state so registerEffect will re-register on show.
        s.dispose = undefined;
        s.cleanup = undefined;
        s.deps = undefined;
      }
    }
  }
}

/**
 * Soft-hide an instance — calls unmount hooks, disposes effects, and
 * clears lifecycle hook arrays so they can be re-registered later.
 * The instance stays in the component tree and state is preserved.
 * Used by Activity boundaries.
 */
export function softHideInstance(instance: ComponentInstance): void {
  // Children first
  for (const child of [...instance.children]) {
    softHideInstance(child);
  }

  if (instance.isMounted) {
    instance.isMounted = false;
    for (const hook of instance._unmountedHooks) {
      hook();
    }
  }

  // Dispose all effects
  for (const dispose of instance.effects) {
    dispose();
  }
  instance.effects.length = 0;

  // Fire dispose hooks when effects are torn down (Activity soft-hide)
  for (const hook of instance._disposeHooks) {
    hook();
  }

  // Clear lifecycle hooks so they can be re-registered on show
  instance._mountedHooks.length = 0;
  instance._unmountedHooks.length = 0;
  instance._updatedHooks.length = 0;
  instance._disposeHooks.length = 0;
  instance._hydratedHooks.length = 0;

  // Clear React effect slots
  clearReactEffectSlots(instance);
}

/**
 * Soft-show an instance — re-runs setup to re-register effects and
 * lifecycle hooks, then fires mounted hooks.
 * State (hook slots) is preserved because useSlot reuses existing slots.
 * Used by Activity boundaries.
 */
export function softShowInstance(instance: ComponentInstance): void {
  if (instance.isMounted || instance.isUnmounted) return;

  // Guard against double execution — if hooks are already registered
  // from a previous soft-show, skip the re-run.
  if (
    instance._mountedHooks.length > 0 ||
    instance._updatedHooks.length > 0 ||
    instance._unmountedHooks.length > 0
  ) {
    return;
  }

  // Reset hook cursor so hooks reuse their slots
  resetHookCursorLocal(instance);

  // Re-run setup to re-register effects and lifecycle hooks.
  // The component function should be idempotent; any state that
  // must survive soft-hide/soft-show should live in hook slots.
  const prev = setCurrentInstance(instance);
  try {
    instance.component(instance.props);
  } catch (err) {
    handleComponentError(instance, err as Error);
  } finally {
    setCurrentInstance(prev);
  }

  // Children first
  for (const child of [...instance.children]) {
    softShowInstance(child);
  }

  if (!instance.isMounted) {
    instance.isMounted = true;
    for (const hook of instance._mountedHooks) {
      hook();
    }
  }
}

/**
 * Fire onUpdated hooks for the current instance.
 */
export function fireUpdatedHooks(instance: ComponentInstance): void {
  for (const hook of instance._updatedHooks) {
    hook();
  }
}

/**
 * Fire all onHydrated hooks for an instance and its children (depth-first).
 */
export function fireHydratedHooks(instance: ComponentInstance): void {
  // Children first
  for (const child of instance.children) {
    fireHydratedHooks(child);
  }

  for (const hook of instance._hydratedHooks) {
    hook();
  }
}

const queuedUpdatedHooks = new Set<ComponentInstance>();

/**
 * Queue onUpdated hooks to run after the current reactive flush.
 * Multiple DOM effects in the same flush produce one updated callback.
 */
export function queueUpdatedHooks(instance: ComponentInstance | null): void {
  if (
    !instance ||
    !instance.isMounted ||
    instance.isUnmounted ||
    instance._updatedHooks.length === 0 ||
    queuedUpdatedHooks.has(instance)
  ) {
    return;
  }

  queuedUpdatedHooks.add(instance);
  nextTick(() => {
    queuedUpdatedHooks.delete(instance);
    if (instance.isMounted && !instance.isUnmounted) {
      fireUpdatedHooks(instance);
    }
  });
}

/**
 * Handle an error in the component tree — walks up to find an error handler.
 * Returns `true` if a handler was found and invoked, `false` otherwise.
 */
export function handleComponentError(
  instance: ComponentInstance,
  err: Error,
): boolean {
  let current: ComponentInstance | null = instance;
  while (current) {
    if (current._errorHooks.length > 0) {
      for (const hook of current._errorHooks) {
        hook(err);
      }
      return true;
    }
    current = current.parent;
  }
  // No handler found
  console.error("[Sinwan] Unhandled component error:", err);
  return false;
}
