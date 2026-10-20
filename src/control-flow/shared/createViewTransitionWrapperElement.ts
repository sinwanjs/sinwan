import type { SinwanElement, SinwanNode } from "../../types.ts";
import { normalizeContent } from "./normalizeContent.ts";

/**
 * Build the ViewTransition wrapper element, or `null` when there is no name
 * (callers should render children directly).
 */
export function createViewTransitionWrapperElement(
  element: SinwanElement,
): SinwanElement | null {
  const props = element.props as {
    name?: string;
    as?: string;
    children?: SinwanNode;
  };
  const name = props.name;
  if (!name) return null;

  const viewChildren = props.children;
  const wrapperTag = props.as ?? "div";

  return {
    tag: wrapperTag,
    props: {
      style: { viewTransitionName: name },
      children: viewChildren,
    },
    children: normalizeContent(viewChildren),
  };
}
