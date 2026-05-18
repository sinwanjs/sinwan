/// <reference lib="dom" />

/**
 * SinwanJS Hydration — Entry Point
 *
 * `hydrate(component, container, props?)` walks existing server-rendered
 * DOM and attaches reactivity + event listeners without creating new nodes.
 *
 * Algorithm:
 *   1. Run setup() → create signals, effects, lifecycle hooks
 *   2. Walk existing DOM (don't create new nodes)
 *   3. Match reactive text slots (<!--sinwan-t:N-->) to signal effects
 *   4. Attach event listeners to elements
 *   5. Fire onMounted hooks
 */

import type { SinwanComponent, SinwanNode, SinwanElement } from "../types.ts";
import type { AppInstance, MountedNode } from "../renderer/types.ts";
import { unmountNode } from "../renderer/mount.ts";
import {
  createComponentInstance,
  setCurrentInstance,
  fireMountedHooks,
  fireHydratedHooks,
  fireUnmountedHooks,
  handleComponentError,
} from "../component/instance.ts";
import { domOps } from "../renderer/dom-ops.ts";
import { hydrateNode, hydrateElement, type HydrationCursor } from "./walk.ts";

/**
 * Hydrate a component against existing server-rendered DOM.
 *
 * Unlike `mount()`, this does NOT clear the container or create new DOM nodes.
 * Instead it walks the existing DOM, attaching reactivity and events.
 *
 * @example
 * // Server rendered the HTML, now on the client:
 * const app = hydrate(Counter, document.getElementById("app")!, { initial: 5 });
 * // DOM is now interactive
 * app.unmount();
 */
export function hydrate(
  component: SinwanComponent<any>,
  container: Element,
  props?: Record<string, unknown>,
  options?: { identifierPrefix?: string },
): AppInstance {
  const mergedProps = props ?? {};

  // Create root component instance
  const instance = createComponentInstance(component, mergedProps, null);
  if (options?.identifierPrefix) {
    instance.identifierPrefix = options.identifierPrefix;
  }

  let result: any;
  let root: MountedNode;

  // Set instance as current for setup + hydration walk
  setCurrentInstance(instance);

  try {
    // 1. Run setup — creates signals, computed, registers hooks
    result = component(mergedProps);

    // 2-4. Walk existing DOM, attach reactivity + events
    const cursor: HydrationCursor = {
      parent: container,
      current: container.firstChild,
    };

    if (result && typeof result === "object" && "tag" in result) {
      root = hydrateElement(result as SinwanElement, cursor);
    } else {
      root = hydrateNode(result as SinwanNode, cursor);
    }
  } catch (err) {
    setCurrentInstance(null);
    handleComponentError(instance, err as Error);
    return {
      root: { type: "text", node: domOps.createTextNode("") },
      unmount() {},
    };
  }

  // Restore
  setCurrentInstance(null);

  instance.element = root;

  // 5. Fire onMounted hooks (bottom-up), then onHydrated hooks
  fireMountedHooks(instance);
  fireHydratedHooks(instance);

  return {
    root,
    unmount() {
      fireUnmountedHooks(instance);
      unmountNode(root);
      container.innerHTML = "";
    },
  };
}
