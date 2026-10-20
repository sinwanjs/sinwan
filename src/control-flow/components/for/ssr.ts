import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { readyIndex } from "../../../common/list-accessors.ts";

/**
 * Resolve `<For>` into a flat list of nodes for SSR / stream.
 * Empty / invalid lists yield `[fallback]` when present, otherwise `[]`.
 */
export function resolveForRenderNodes(element: SinwanElement): SinwanNode[] {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: {
      (item: unknown, index: { (): number }): SinwanNode;
    };
  };
  const each = resolve(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback != null ? [props.fallback] : [];
  }
  if (each.length === 0) {
    return props.fallback != null ? [props.fallback] : [];
  }

  const nodes: SinwanNode[] = new Array(each.length);
  for (let i = 0; i < each.length; i++) {
    nodes[i] = props.children(each[i], readyIndex(i));
  }
  return nodes;
}
