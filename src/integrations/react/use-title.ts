import { useSlot } from "./_internal/bridge.ts";
import { isServer } from "./_internal/is-server.ts";
import { onUnmounted } from "../../component/lifecycle.ts";
import { effect } from "../../reactivity/index.ts";
import { isReactive, resolve } from "../../reactivity/index.ts";

export interface UseTitleOptions {
  restoreOnUnmount?: boolean;
}

/**
 * React-compatible `useTitle` — `[CLIENT]`.
 *
 * Declaratively updates `document.title`. When the component unmounts,
 * the previous title is restored by default (matching the common React
 * pattern shown in the `<title>` documentation).
 *
 * SSR: no-op — `document` is not available on the server.
 * Reactivity: when `title` is a reactive getter (signal / computed /
 * zero-arity function), the DOM title updates automatically.
 *
 * @example
 * ```tsx
 * import { useTitle } from "sinwan/react-client";
 *
 * const Page = ({ pageTitle }: { pageTitle: string }) => {
 *   useTitle(pageTitle);
 *   return <h1>{pageTitle}</h1>;
 * };
 * ```
 */
export function useTitle(
  title: string | (() => string),
  options?: UseTitleOptions,
): void {
  useSlot(() => ({})); // validates we're inside a component

  if (isServer()) return;

  const restoreOnUnmount = options?.restoreOnUnmount ?? true;
  const originalTitle = restoreOnUnmount ? document.title : undefined;

  const update = () => {
    const value = resolve(title);
    const str = typeof value === "string" ? value : String(value);
    if (document.title !== str) {
      document.title = str;
    }
  };

  update();

  let effectCleanup: (() => void) | undefined;
  if (isReactive(title)) {
    effectCleanup = effect(update);
  }

  onUnmounted(() => {
    effectCleanup?.();
    if (restoreOnUnmount && originalTitle !== undefined) {
      document.title = originalTitle;
    }
  });
}
