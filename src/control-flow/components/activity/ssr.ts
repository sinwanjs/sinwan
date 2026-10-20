import type { SinwanElement } from "../../../types.ts";
import {
  createActivityWrapperElement,
  isActivityHidden,
} from "../../shared/createActivityWrapperElement.ts";

export {
  createActivityWrapperElement,
  isActivityHidden,
} from "../../shared/createActivityWrapperElement.ts";

/**
 * SSR entry: expand `<Activity>` into the wrapper intrinsic element that
 * plain / hydratable / stream renderers already know how to serialize.
 */
export function renderActivityElement(element: SinwanElement): SinwanElement {
  return createActivityWrapperElement(element);
}
