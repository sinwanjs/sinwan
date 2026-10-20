import type { SinwanElement } from "../../../types.ts";
import { normalizeContent } from "../../shared/normalizeContent.ts";

/**
 * Expand a `<Dynamic>` element into a concrete element for the resolved tag.
 * Returns `null` when `tag` is not a string or function.
 */
export function createDynamicElement(
  element: SinwanElement,
  tag: unknown,
): SinwanElement | null {
  if (typeof tag !== "string" && typeof tag !== "function") {
    return null;
  }

  const { component, ...props } = element.props as Record<string, unknown>;
  const children = normalizeContent(props.children ?? element.children);

  return {
    tag: tag as SinwanElement["tag"],
    props,
    children,
  };
}
