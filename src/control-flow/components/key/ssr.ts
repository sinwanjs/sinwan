import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { resolveKeyChildren } from "./resolve.ts";

/**
 * Resolve `<Key>` content for SSR / stream from the current `when` value.
 */
export function resolveKeyRenderNode(element: SinwanElement): SinwanNode {
  const key = resolve((element.props as { when?: unknown }).when);
  return resolveKeyChildren(element, key);
}
