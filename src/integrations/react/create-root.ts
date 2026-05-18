import { mount } from "../../renderer/mount.ts";
import type { AppInstance } from "../../renderer/types.ts";
import type { SinwanComponent, SinwanElement } from "../../types.ts";
import type { ReactNode } from "./_types/core.ts";
import { assertClient } from "./_internal/is-server.ts";

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

  return {
    render(children: ReactNode) {
      if (unmounted) {
        throw new Error("[sinwan/react] Cannot update an unmounted root.");
      }
      if (app) {
        app.unmount();
      }
      const cmp = toComponent(children);
      app = mount(cmp, container, undefined, {
        identifierPrefix: options?.identifierPrefix,
      });
    },
    unmount() {
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
  cmp._displayName = "Root";
  return cmp;
}
