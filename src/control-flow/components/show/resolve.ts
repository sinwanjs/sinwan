import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { isValueRenderProp } from "../../shared/isValueRenderProp.ts";

/** Resolve `<Show>` children for a truthy `when` value. */
export function resolveShowChildren(
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

/** Render keys for a falsy `when`: the fallback is showing, or its `fallbackDelay` is still running. */
export const SHOW_FALLBACK: unique symbol = Symbol("show-fallback");
export const SHOW_WAITING: unique symbol = Symbol("show-waiting");
