import type { SinwanElement, SinwanNode } from "../../../types.ts";

/**
 * Resolve `<Suspense>` content for SSR / stream.
 * SSR awaits children (not fallback); streaming flushes resolved content.
 */
export function resolveSuspenseRenderNode(element: SinwanElement): SinwanNode {
  return (element.props as { children?: SinwanNode }).children ?? null;
}
