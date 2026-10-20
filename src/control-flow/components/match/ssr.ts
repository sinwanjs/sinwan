import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { resolveMatchChildren } from "./client.ts";

/**
 * Resolve `<Match>` content for SSR / stream.
 * Falsy `when` yields `null`; truthy yields resolved children.
 */
export function resolveMatchRenderNode(element: SinwanElement): SinwanNode {
  const when = resolve((element.props as { when?: unknown }).when);
  return when ? resolveMatchChildren(element, when) : null;
}
