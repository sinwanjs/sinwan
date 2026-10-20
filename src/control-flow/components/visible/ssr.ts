import type { SinwanElement } from "../../../types.ts";
import { expandVisibleElement } from "./factory.ts";

/**
 * Resolve `<Visible>` for SSR / stream — expand to the styled intrinsic element.
 */
export function resolveVisibleRenderNode(element: SinwanElement): SinwanElement {
  return expandVisibleElement(element);
}
