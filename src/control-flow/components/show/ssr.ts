import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { resolveShowChildren } from "./resolve.ts";

/**
 * Resolve `<Show>` content for SSR / stream from the current `when` value.
 */
export function resolveShowRenderNode(element: SinwanElement): SinwanNode {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
  };
  const when = resolve(props.when);
  return when ? resolveShowChildren(element, when) : (props.fallback ?? null);
}
