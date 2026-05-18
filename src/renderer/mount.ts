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
} from "../component/instance.ts";

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
export function mount(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
  options?: { identifierPrefix?: string },
): AppInstance {
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

  // Set instance as current for BOTH setup AND rendering,
  // so child components can discover their parent.
  setCurrentInstance(instance);

  try {
    result = component(mergedProps);

    if (result instanceof Promise) {
      // Async component — render placeholder, then swap
      const placeholder = domOps.createTextNode("");
      domOps.appendChild(container, placeholder);
      root = { type: "text", node: placeholder };

      // Mutable cell so unmount() sees the resolved root after swap
      const rootRef: { current: MountedNode } = { current: root };

      setCurrentInstance(null);

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

      return {
        root: rootRef.current,
        unmount() {
          fireUnmountedHooks(instance);
          unmountNode(rootRef.current);
          container.innerHTML = "";
        },
      };
    } else if (result && typeof result === "object" && "tag" in result) {
      root = renderElementToDOM(result, container);
    } else {
      root = renderNodeToDOM(result as SinwanNode, container);
    }
  } catch (err) {
    setCurrentInstance(null);
    handleComponentError(instance, err as Error);
    return {
      root: { type: "text", node: domOps.createTextNode("") },
      unmount() {},
    };
  }

  // Restore — no instance is current at the top level
  setCurrentInstance(null);

  instance.element = root;

  // Fire onMounted hooks (bottom-up: children first, then parent)
  fireMountedHooks(instance);

  return {
    root,
    unmount() {
      // Fire onUnmounted hooks and dispose all effects
      fireUnmountedHooks(instance);
      // Clean up DOM tree
      unmountNode(root);
      container.innerHTML = "";
    },
  };
}

/**
 * Render a raw SinwanElement or SinwanNode tree into a container.
 * Lower-level than mount() — doesn't call a component function.
 */
export function render(node: SinwanNode, container: Element): AppInstance {
  container.innerHTML = "";

  const root = renderNodeToDOM(node, container);

  return {
    root,
    unmount() {
      unmountNode(root);
      container.innerHTML = "";
    },
  };
}

export { unmountNode } from "./unmount.ts";
