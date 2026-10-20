import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { createViewTransitionWrapperElement } from "../../shared/createViewTransitionWrapperElement.ts";

export { createViewTransitionWrapperElement } from "../../shared/createViewTransitionWrapperElement.ts";

/**
 * Resolve `<ViewTransition>` content for SSR / stream.
 * Named transitions expand to a wrapper intrinsic; unnamed pass children through.
 */
export function resolveViewTransitionRenderNode(
  element: SinwanElement,
): SinwanNode {
  const wrapper = createViewTransitionWrapperElement(element);
  if (wrapper) return wrapper;
  return (element.props as { children?: SinwanNode }).children ?? null;
}
