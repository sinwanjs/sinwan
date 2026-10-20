import type { SinwanElement } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { createDynamicElement } from "./element.ts";

export { createDynamicElement } from "./element.ts";

/**
 * SSR entry: resolve `<Dynamic component>` and expand to a concrete element.
 * Returns `null` when the tag is missing / invalid (render as empty).
 */
export function renderDynamicElement(
  element: SinwanElement,
): SinwanElement | null {
  const tag = resolve((element.props as { component?: unknown }).component);
  return createDynamicElement(element, tag);
}
