import { hydrate } from "../hydration/hydrate.ts";
import { mount } from "../renderer/mount.ts";
import type { AppInstance } from "../renderer/types.ts";
import type { SinwanComponent, SinwanElement } from "../types.ts";
import type { ReactNode } from "./_types/core.ts";
import {
  type Root,
  type CreateRootOptions,
  hotSwapRootInstance,
} from "./create-root.ts";
import {
  registerRefreshRoot,
  resolveLatestComponent,
} from "../hmr/component-registry.ts";
import { assertClient } from "./_internal/is-server.ts";

/**
 * React-compatible `hydrateRoot(container, children, options?)` — `[CLIENT]`.
 *
 * Wraps Sinwan's `hydrate()` in a Root-shaped object so call sites authored
 * against React's API work unchanged.
 *
 * The initial call hydrates existing server-rendered DOM. Subsequent
 * `root.render()` calls perform a client-side mount (the container is
 * already live, so hydration markers are no longer needed).
 *
 * SSR: throws.
 * Reactivity: pass-through.
 *
 * @example
 * ```tsx
 * import { hydrateRoot } from "sinwan/react";
 *
 * hydrateRoot(document.getElementById("app")!, <App />);
 * ```
 */
export function hydrateRoot(
  container: Element,
  children: ReactNode | SinwanComponent<any>,
  options?: CreateRootOptions,
): Root {
  assertClient("hydrateRoot");

  if (!container || (container as any).nodeType !== 1) {
    throw new TypeError(
      "[sinwan/react] hydrateRoot: Target container is not a DOM element.",
    );
  }

  const cmp = toComponent(children);
  let app: AppInstance | null = hydrate(cmp, container, undefined, {
    identifierPrefix: options?.identifierPrefix,
  });
  let unmounted = false;

  // DEV only: register a Fast Refresh re-render for this hydrated root so
  // per-component HMR edits re-run the tree in place (state preserved).
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
    render(next: ReactNode) {
      if (unmounted) {
        throw new Error("[sinwan/react] Cannot update an unmounted root.");
      }

      const nextCmp = toComponent(next);

      // HMR fast path (DEV only): hot-swap the component on the existing
      // (hydrated) ComponentInstance to preserve hook_slots / signal_slots.
      // Dead-code-eliminated in production, where render() keeps its original
      // unmount + client-side remount behaviour.
      if (typeof __DEV__ !== "undefined" && __DEV__ && app && app._instance) {
        const swapped = hotSwapRootInstance(app._instance, nextCmp, container);
        if (swapped) {
          app.root = app._instance.element!;
          return;
        }
      }

      if (app) {
        app.unmount();
      }
      // After the initial hydration, subsequent renders are client-side mounts.
      app = mount(nextCmp, container, undefined, {
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

function toComponent(
  children: ReactNode | SinwanComponent<any>,
): SinwanComponent<{}> {
  if (typeof children === "function") {
    return children as SinwanComponent<{}>;
  }
  const cmp: SinwanComponent<{}> = (() =>
    children as unknown as SinwanElement) as SinwanComponent<{}>;
  cmp._SinwanComponent = true;
  cmp._displayName = "HydratedRoot";
  return cmp;
}
