import { renderNodeToHydratableString } from "../server/hydration-markers.ts";
import {
  createComponentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../types.ts";

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
  // Create a temporary root instance so `useId` works even when the
  // rendered tree is a plain function component (not a cc component).
  const dummy = createComponentInstance(() => null, {}, null);
  dummy.identifierPrefix = options?.identifierPrefix ?? "";
  const prev = setCurrentInstance(dummy);

  try {
    return renderNodeToHydratableString(node as SinwanNode, options);
  } finally {
    setCurrentInstance(prev);
  }
}
