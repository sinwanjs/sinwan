import { renderNodeToHydratableString } from "../server/hydration-markers.ts";
import { DEFAULT_HYDRATION_ADAPTER } from "../hydration/markers.ts";
import {
  createComponentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../types.ts";

function ssrHostComponent(): null {
  return null;
}

/**
 * React-compatible `renderToStaticMarkup` — `[SERVER]`.
 *
 * Renders a non-interactive React tree to an HTML string without hydration
 * markers. Unlike `renderToString`, the output is cheaper to produce and
 * cannot be hydrated on the client.
 *
 * SSR: server-only.
 * Reactivity: pass-through to Sinwan's renderer.
 *
 * @example
 * ```ts
 * import { renderToStaticMarkup } from "sinwan/react";
 *
 * const html = await renderToStaticMarkup(<Page />);
 * response.send(html);
 * ```
 */
export async function renderToStaticMarkup(
  node: ReactNode,
  options?: { identifierPrefix?: string },
): Promise<string> {
  // Create a temporary root instance so `useId` works correctly and
  // inherits the optional `identifierPrefix`.
  const dummy = createComponentInstance(ssrHostComponent as any, {}, null);
  dummy.identifierPrefix = options?.identifierPrefix ?? "";
  ssrHostComponent();
  const prev = setCurrentInstance(dummy);

  try {
    const html = await renderNodeToHydratableString(
      node as SinwanNode,
      options,
    );
    return DEFAULT_HYDRATION_ADAPTER.stripMarkers(html);
  } finally {
    setCurrentInstance(prev);
  }
}
