import type { SinwanElement, SinwanNode } from "../../types.ts";
import { resolve } from "../../reactivity/index.ts";
import { normalizeContent } from "./normalizeContent.ts";

/**
 * Build the Activity wrapper element used by client, SSR, and hydratable SSR.
 * Children stay mounted; visibility is expressed via attrs / soft-hide.
 */
export function createActivityWrapperElement(
  element: SinwanElement,
): SinwanElement {
  const props = element.props as {
    mode?: unknown;
    as?: string;
    children?: SinwanNode;
  };
  const mode = resolve(props.mode) ?? "visible";
  const activityChildren = props.children;
  const tag = props.as ?? "div";
  const hidden = mode === "hidden";

  return {
    tag,
    props: {
      "data-sinwan-activity": hidden ? "hidden" : "visible",
      ...(hidden ? { hidden: true } : {}),
      children: activityChildren,
    },
    children: normalizeContent(activityChildren),
  };
}

/** Whether Activity should soft-hide after mount (mode === "hidden"). */
export function isActivityHidden(element: SinwanElement): boolean {
  const mode = resolve((element.props as { mode?: unknown }).mode) ?? "visible";
  return mode === "hidden";
}
