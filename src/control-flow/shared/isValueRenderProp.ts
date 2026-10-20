import type { SinwanNode } from "../../types.ts";

type ValueRenderProp = (value: unknown) => SinwanNode;

/**
 * True for Key/Show/Match render props (arity ≥ 1).
 * Zero-arity `() => unknown` is a `SinwanNode` getter, not a render prop.
 */
export function isValueRenderProp(
  children: unknown,
): children is ValueRenderProp {
  return typeof children === "function" && children.length > 0;
}
