import { renderNodeToHydratableString } from "../../server/hydration-markers.ts";
import {
  createComponentInstance,
  setCurrentInstance,
} from "../../component/instance.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../../types.ts";

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
 * import { renderToStaticMarkup } from "sinwan/react-server";
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
  const dummy = createComponentInstance(() => null, {}, null);
  dummy.identifierPrefix = options?.identifierPrefix ?? "";
  const prev = setCurrentInstance(dummy);

  try {
    const html = await renderNodeToHydratableString(node as SinwanNode);
    return stripHydrationMarkers(html);
  } finally {
    setCurrentInstance(prev);
  }
}

/** Strip Sinwan hydration markers from SSR output. */
function stripHydrationMarkers(html: string): string {
  return (
    html
      // Component boundary markers: ` data-sinwan-id="c0"`
      .replace(/\s+data-sinwan-id="c\d+"/g, "")
      // Event binding markers: ` data-sinwan-ev="click:0"`
      .replace(/\s+data-sinwan-ev="[^"]*"/g, "")
      // Reactive text open markers: `<!--sinwan-t:0-->`
      .replace(/<!--sinwan-t:\d+-->/g, "")
      // Reactive text close markers: `<!--/sinwan-t-->`
      .replace(/<!--\/sinwan-t-->/g, "")
  );
}
