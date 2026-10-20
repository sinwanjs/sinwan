import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { isValueRenderProp } from "../../shared/isValueRenderProp.ts";

/** Resolve `<Key>` children for the current key value. */
export function resolveKeyChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children =
    (element.props as { children?: SinwanNode | ((v: unknown) => SinwanNode) })
      .children ?? (element.children as SinwanNode);
  if (isValueRenderProp(children)) {
    return children(value);
  }
  return children;
}
