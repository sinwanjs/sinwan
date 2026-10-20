import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { isValueRenderProp } from "../../shared/isValueRenderProp.ts";

export { Match, isMatchElement, type MatchProps } from "../../identity.ts";

/** Resolve `<Match>` children for a truthy `when` value. */
export function resolveMatchChildren(
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
