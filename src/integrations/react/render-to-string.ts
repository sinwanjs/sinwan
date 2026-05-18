import { renderNodeToHydratableString } from "../../server/hydration-markers.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../../types.ts";

/**
 * React-compatible `renderToString` — `[SERVER]`.
 *
 * NOTE on signatures: React's `renderToString` is synchronous, but Sinwan's
 * renderer awaits async children, so the adapter returns `Promise<string>`.
 * This deviates from React exact signature but is the only way to
 * support async components inside an SSR call. Document accordingly.
 *
 * SSR: server-only.
 * Reactivity: pass-through to Sinwan's renderer.
 *
 * @example
 * ```ts
 * import { renderToString } from "sinwan/react-server";
 *
 * const html = await renderToString(<App />);
 * Bun.serve({ fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
 * ```
 */
export function renderToString(
  node: ReactNode,
  options?: { identifierPrefix?: string },
): Promise<string> {
  return renderNodeToHydratableString(node as SinwanNode, options);
}
