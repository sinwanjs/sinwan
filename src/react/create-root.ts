import { mount } from "../renderer/mount.ts";
import type { AppInstance, MountedNode } from "../renderer/types.ts";
import type { SinwanComponent, SinwanElement, SinwanNode } from "../types.ts";
import type { ReactNode } from "./_types/core.ts";
import { assertClient } from "./_internal/is-server.ts";
import {
  softHideInstance,
  setCurrentInstance,
  fireMountedHooks,
  fireUnmountedHooks,
  handleComponentError,
  resetHookCursorLocal,
  type ComponentInstance,
} from "../component/instance.ts";
import { renderElementToDOM } from "../renderer/render-element.ts";
import { renderNodeToDOM } from "../renderer/render-children.ts";
import { unmountNode } from "../renderer/unmount.ts";
import {
  registerRefreshRoot,
  resolveLatestComponent,
} from "../hmr/component-registry.ts";

export interface Root {
  render(children: ReactNode | SinwanComponent<any>): void;
  unmount(): void;
}

export interface CreateRootOptions {
  identifierPrefix?: string;
  onUncaughtError?: (
    error: unknown,
    errorInfo?: { componentStack?: string },
  ) => void;
  onCaughtError?: (
    error: unknown,
    errorInfo?: { componentStack?: string },
  ) => void;
  onRecoverableError?: (
    error: unknown,
    errorInfo?: { componentStack?: string },
  ) => void;
}

/**
 * React-compatible `createRoot(container)` — `[CLIENT]`.
 *
 * Returns a `Root` with `render(node)` and `unmount()` methods backed by
 * Sinwan's `mount()`. The `node` can be either a Sinwan component or a
 * Sinwan element returned by JSX.
 *
 * SSR: throws (matches React: there is no DOM to mount into).
 * Reactivity: pass-through to Sinwan's renderer.
 *
 * HMR: when `render()` is called again on an already-mounted root, the root
 * ComponentInstance is reused (hook_slots / state preserved) and only the
 * component function + DOM output are swapped. This gives plugin-free
 * Fast Refresh behaviour — `useState`, `useRef`, etc. keep their values.
 *
 * @example
 * ```tsx
 * import { createRoot } from "sinwan/react-client";
 *
 * const root = createRoot(document.getElementById("app")!);
 * root.render(<App />);
 * ```
 */
export function createRoot(
  container: Element,
  options?: CreateRootOptions,
): Root {
  assertClient("createRoot");

  if (!container || (container as any).nodeType !== 1) {
    throw new TypeError(
      "[sinwan/react] createRoot: Target container is not a DOM element.",
    );
  }

  let app: AppInstance | null = null;
  let unmounted = false;

  // DEV only: register a Fast Refresh re-render for this root so per-component
  // HMR edits (injected by the Vite/Bun plugin) can re-run the tree in place,
  // picking up the latest component code while preserving state. DCE'd in prod.
  let disposeRefresh: (() => void) | null = null;
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    disposeRefresh = registerRefreshRoot(() => {
      if (unmounted || !app || !app._instance) return;
      const latest = resolveLatestComponent(app._instance.component);
      if (hotSwapRootInstance(app._instance, latest, container)) {
        app.root = app._instance.element!;
      }
    });
  }

  return {
    render(children: ReactNode) {
      if (unmounted) {
        throw new Error("[sinwan/react] Cannot update an unmounted root.");
      }

      const cmp = toComponent(children);

      // HMR fast path (DEV only): if a root is already mounted, hot-swap the
      // component function on the existing ComponentInstance to preserve
      // hook_slots / signal_slots (state). Dead-code-eliminated in production,
      // where render() keeps its original unmount + remount behaviour.
      if (typeof __DEV__ !== "undefined" && __DEV__ && app && app._instance) {
        const swapped = hotSwapRootInstance(app._instance, cmp, container);
        if (swapped) {
          app.root = app._instance.element!;
          return;
        }
      }

      // Normal path: full unmount + mount
      if (app) {
        app.unmount();
      }
      app = mount(cmp, container, undefined, {
        identifierPrefix: options?.identifierPrefix,
      });
    },
    unmount() {
      if (disposeRefresh) {
        disposeRefresh();
        disposeRefresh = null;
      }
      if (app) {
        app.unmount();
        app = null;
      }
      unmounted = true;
    },
  };
}

// ─── HMR slot preservation ──────────────────────────────────

const HOOK_KEY = Symbol.for("sinwan.react.hook_slots");
const SIGNAL_SLOTS_KEY = Symbol.for("sinwan.signal_slots");

/**
 * Global HMR context. When set, `renderComponentToDOM` (via the
 * `_onChildCreated` hook) will inject saved hook_slots into newly
 * created child instances BEFORE the component function runs.
 * This way, `useSlot` sees the existing Signals and returns them,
 * so the DOM is rendered bound to the preserved state.
 */
const HMR_CONTEXT_KEY = Symbol.for("sinwan.hmr.context");
const HMR_HOOK_KEY = Symbol.for("sinwan.hmr.onChildCreated");
interface SavedSlots {
  hookSlots?: unknown;
  signalSlots?: unknown;
}
interface HmrContext {
  savedSlots: Map<string, SavedSlots>;
  rootInstance: ComponentInstance;
}
type GlobalHmrSlot = {
  [HMR_CONTEXT_KEY]?: HmrContext | null;
  [HMR_HOOK_KEY]?: ((instance: ComponentInstance) => void) | null;
};
const hmrGlobal = globalThis as unknown as GlobalHmrSlot;

/**
 * Recursively collect hook_slots and signal_slots from a component instance
 * tree, keyed by position path (e.g. "0", "0.2", "1.0.3").
 */
function collectChildSlots(
  instance: ComponentInstance,
  prefix: string,
  out: Map<string, SavedSlots>,
): void {
  for (let i = 0; i < instance.children.length; i++) {
    const child = instance.children[i];
    const path = prefix ? `${prefix}.${i}` : String(i);
    const rec = child as unknown as Record<symbol, unknown>;
    const hookSlots = rec[HOOK_KEY];
    const signalSlots = rec[SIGNAL_SLOTS_KEY];
    if (hookSlots || signalSlots) {
      out.set(path, { hookSlots, signalSlots });
    }
    collectChildSlots(child, path, out);
  }
}

/**
 * Compute the position path for a child instance relative to the HMR root.
 * Walks up the parent chain counting each instance's index among its siblings.
 */
function getInstancePath(
  instance: ComponentInstance,
  root: ComponentInstance,
): string | null {
  const segments: number[] = [];
  let current: ComponentInstance | null = instance;
  while (current && current !== root) {
    const parent: ComponentInstance | null = current.parent;
    if (!parent) return null;
    const idx = parent.children.indexOf(current);
    if (idx === -1) return null;
    segments.unshift(idx);
    current = parent;
  }
  return current === root ? segments.join(".") : null;
}

/**
 * Called by `renderComponentToDOM` (via globalThis hook) when a new
 * child instance is created during an HMR re-render. Injects saved
 * hook_slots and signal_slots BEFORE the component function runs.
 */
export function _hmrOnChildCreated(instance: ComponentInstance): void {
  const ctx = hmrGlobal[HMR_CONTEXT_KEY];
  if (!ctx) return;

  const path = getInstancePath(instance, ctx.rootInstance);
  if (path === null) return;

  const saved = ctx.savedSlots.get(path);
  if (saved) {
    const rec = instance as unknown as Record<symbol, unknown>;
    if (saved.hookSlots) rec[HOOK_KEY] = saved.hookSlots;
    if (saved.signalSlots) rec[SIGNAL_SLOTS_KEY] = saved.signalSlots;
    resetHookCursorLocal(instance);
  }
}

// ─── Hot-swap implementation ─────────────────────────────────

/**
 * Hot-swap the root component function on an existing ComponentInstance.
 *
 * 1. Collect hook_slots from the entire child tree (keyed by position)
 * 2. softHideInstance — disposes effects & lifecycle hooks, preserves hook_slots
 * 3. Clean up old tree + DOM
 * 4. Swap instance.component to the new function
 * 5. Activate HMR context so child instances get saved hook_slots injected
 * 6. Re-run the new component function + render new DOM
 * 7. Deactivate HMR context
 * 8. Fire mounted hooks
 *
 * Returns true if the swap succeeded, false to fall back to full remount.
 */
export function hotSwapRootInstance(
  instance: ComponentInstance,
  newComponent: SinwanComponent<any>,
  container: Element,
): boolean {
  try {
    // 1. Save child hook_slots BEFORE destroying anything
    const savedChildSlots = new Map<string, SavedSlots>();
    collectChildSlots(instance, "", savedChildSlots);

    // 2. Soft-hide: dispose effects + lifecycle hooks, keep hook_slots
    softHideInstance(instance);

    // 3. Unmount old children
    for (const child of [...instance.children]) {
      fireUnmountedHooks(child);
    }
    instance.children = [];

    // 4. Clean up old DOM tree
    if (instance.element) {
      unmountNode(instance.element);
    }
    container.innerHTML = "";

    // 5. Swap the component function
    instance.component = newComponent;
    instance.isUnmounted = false;
    instance.isMounted = false;

    // 6. Activate HMR context — child instances created during rendering
    //    will have their saved hook_slots injected before their setup runs.
    if (savedChildSlots.size > 0) {
      hmrGlobal[HMR_CONTEXT_KEY] = {
        savedSlots: savedChildSlots,
        rootInstance: instance,
      };
      hmrGlobal[HMR_HOOK_KEY] = _hmrOnChildCreated;
    }

    // 7. Reset hook cursor so useSlot returns existing slots from index 0,
    //    then re-run the new component function with the instance as current.
    resetHookCursorLocal(instance);
    const prev = setCurrentInstance(instance);
    let result: any;
    let root: MountedNode;

    try {
      result = newComponent(instance.props);

      if (result && typeof result === "object" && "tag" in result) {
        root = renderElementToDOM(result as SinwanElement, container);
      } else {
        root = renderNodeToDOM(result as SinwanNode, container);
      }
    } catch (err) {
      setCurrentInstance(prev);
      hmrGlobal[HMR_CONTEXT_KEY] = null;
      hmrGlobal[HMR_HOOK_KEY] = null;
      handleComponentError(instance, err as Error);
      return false;
    }

    setCurrentInstance(prev);

    // 8. Deactivate HMR context
    hmrGlobal[HMR_CONTEXT_KEY] = null;
    hmrGlobal[HMR_HOOK_KEY] = null;

    // 9. Update instance and fire lifecycle hooks
    instance.element = root;
    instance.isMounted = false; // fireMountedHooks will set this to true
    fireMountedHooks(instance);

    return true;
  } catch {
    hmrGlobal[HMR_CONTEXT_KEY] = null;
    hmrGlobal[HMR_HOOK_KEY] = null;
    // Any failure → fall back to full remount
    return false;
  }
}

function toComponent(
  children: ReactNode | SinwanComponent<any>,
): SinwanComponent<{}> {
  if (typeof children === "function") {
    return children as SinwanComponent<{}>;
  }
  const cmp: SinwanComponent<{}> = (() =>
    children as unknown as SinwanElement) as SinwanComponent<{}>;
  cmp._SinwanComponent = true;
  cmp._displayName = "Root";
  return cmp;
}
