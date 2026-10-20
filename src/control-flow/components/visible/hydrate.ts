import type { SinwanElement } from "../../../types.ts";
import { expandVisibleElement } from "./client.ts";

/**
 * Expand `<Visible>` before hydration (no dedicated boundary — becomes an intrinsic).
 */
export function expandVisibleForHydrate(element: SinwanElement): SinwanElement {
  return expandVisibleElement(element);
}
