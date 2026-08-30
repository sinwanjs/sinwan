/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Mount
 *
 * Entry point for rendering a component tree into a DOM container.
 * Returns an AppInstance handle for unmounting.
 */

import type { SinwanComponent, SinwanNode, SinwanElement } from "../types.ts";
import type { AppInstance, MountedNode } from "./types.ts";
import { renderNodeToDOM } from "./render-children.ts";
import { renderElementToDOM } from "./render-element.ts";
import { unmountNode } from "./unmount.ts";
import { domOps } from "./dom-ops.ts";
import {
  createComponentInstance,
  setCurrentInstance,
  fireMountedHooks,
  fireUnmountedHooks,
  handleComponentError,
  runComponentSetup,
  restoreEffectScope,
} from "../component/instance.ts";
import type { EffectScope } from "../reactivity/effect.ts";

/**
 * Mount a component into a DOM container.
 *
 * Creates a root ComponentInstance, runs setup with lifecycle hooks,
 * renders to DOM, then fires onMounted hooks (bottom-up).
 *
 * @example
 * const app = mount(Counter, document.getElementById("app")!, { initial: 0 });
 * // later...
 * app.unmount();
 */
interface AppContainer extends Element {
  __sinwan_app__?: AppInstance;
}

export function mount(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
  options?: { identifierPrefix?: string },
): AppInstance {
  const appContainer = container as AppContainer;

  // Unmount previous instance if this container is being reused (e.g., during HMR)
  if (appContainer.__sinwan_app__) {
    appContainer.__sinwan_app__.unmount();
  }

  // Clear the container
  container.innerHTML = "";

  const mergedProps = props ?? {};

  // Create root component instance
  const instance = createComponentInstance(component, mergedProps, null);
  if (options?.identifierPrefix) {
    instance.identifierPrefix = options.identifierPrefix;
  }

  let result: any;
  let root: MountedNode;
  // Saved effect scope — restored after rendering so renderer-internal effects
  // created during the render phase do NOT auto-register on `instance.effects`.
  let prevScope: EffectScope | null = null;

  // Set instance as current for BOTH setup AND rendering,
  // so child components can discover their parent.
  setCurrentInstance(instance);

  try {
    // Run setup with `instance` as the active effect scope so user `effect()`
    // calls auto-register on `instance.effects` (disposed on unmount/HMR).
    // After setup the scope is cleared so the render phase below does not
    // auto-register renderer-internal DOM-binding effects.
    const setup = runComponentSetup(instance, () => component(mergedProps));
    result = setup.result;
    prevScope = setup.prevScope;

    if (result instanceof Promise) {
      // Async component — render placeholder, then swap
      const placeholder = domOps.createTextNode("");
      domOps.appendChild(container, placeholder);
      root = { type: "text", node: placeholder };

      // Mutable cell so unmount() sees the resolved root after swap
      const rootRef: { current: MountedNode } = { current: root };

      setCurrentInstance(null);
      restoreEffectScope(prevScope);

      result.then(
        (resolved) => {
          container.innerHTML = "";
          setCurrentInstance(instance);
          rootRef.current = renderElementToDOM(resolved, container);
          setCurrentInstance(null);
          instance.element = rootRef.current;
          fireMountedHooks(instance);
        },
        (err) => {
          // Promise rejected — clear placeholder and report error
          container.innerHTML = "";
          handleComponentError(instance, err as Error);
        },
      );

      const app: AppInstance = {
        root: rootRef.current,
        unmount() {
          fireUnmountedHooks(instance);
          unmountNode(rootRef.current);
          container.innerHTML = "";
          delete appContainer.__sinwan_app__;
        },
        _instance: instance,
      };
      appContainer.__sinwan_app__ = app;
      return app;
    } else if (result && typeof result === "object" && "tag" in result) {
      root = renderElementToDOM(result, container);
    } else {
      root = renderNodeToDOM(result as SinwanNode, container);
    }
  } catch (err) {
    restoreEffectScope(prevScope);
    setCurrentInstance(null);
    handleComponentError(instance, err as Error);
    return {
      root: { type: "text", node: domOps.createTextNode("") },
      unmount() {},
    };
  }

  // Restore — no instance is current at the top level
  restoreEffectScope(prevScope);
  setCurrentInstance(null);

  instance.element = root;

  // Fire onMounted hooks (bottom-up: children first, then parent)
  fireMountedHooks(instance);

  const app: AppInstance = {
    root,
    unmount() {
      // Fire onUnmounted hooks and dispose all effects
      fireUnmountedHooks(instance);
      // Clean up DOM tree
      unmountNode(root);
      container.innerHTML = "";
      delete appContainer.__sinwan_app__;
    },
    _instance: instance,
  };
  appContainer.__sinwan_app__ = app;
  return app;
}

/**
 * Render a raw SinwanElement or SinwanNode tree into a container.
 * Lower-level than mount() — doesn't call a component function.
 */
export function render(node: SinwanNode, container: Element): AppInstance {
  const appContainer = container as AppContainer;

  if (appContainer.__sinwan_app__) {
    appContainer.__sinwan_app__.unmount();
  }
  container.innerHTML = "";

  const root = renderNodeToDOM(node, container);

  const app: AppInstance = {
    root,
    unmount() {
      unmountNode(root);
      container.innerHTML = "";
      delete appContainer.__sinwan_app__;
    },
  };
  appContainer.__sinwan_app__ = app;
  return app;
}

export { unmountNode } from "./unmount.ts";
