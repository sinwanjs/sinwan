/// <reference lib="dom" />

/**
 * Apply ref callbacks / ref objects to a DOM element.
 * Split from `render-element` so templates do not import the full element path.
 */

import type { CleanupFn } from "../reactivity/index.ts";

type RefCallback = (el: Element | null) => void;
type RefObject = { current: Element | null };
type RefValue = RefCallback | RefObject | null | undefined;

export function applyRef(el: Element, ref: unknown): CleanupFn | null {
  const value = ref as RefValue;
  if (!value) {
    return null;
  }

  if (typeof value === "function") {
    value(el);
    return () => value(null);
  }

  if (typeof value === "object" && "current" in value) {
    value.current = el;
    return () => {
      value.current = null;
    };
  }

  return null;
}
