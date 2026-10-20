/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Attribute Handling
 *
 * Applies native DOM props to elements (general / non-hoisted path).
 * Single-attribute setters live in `set-attribute.ts` so templates can
 * import them without this reactive multi-prop loop.
 */

import { isEventProp } from "./events.ts";
import { effect, isReactive, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";
import { isBindingDescriptor } from "./template-identity.ts";
import {
  setSingleAttribute,
  type AttributeBindingState,
} from "./set-attribute.ts";

export { DOM_PROPERTIES, setSingleAttribute } from "./set-attribute.ts";
export type { AttributeBindingState } from "./set-attribute.ts";

const SKIP_PROPS = new Set([
  "children",
  "key",
  "ref",
  "dangerouslySetInnerHTML",
]);

/**
 * Apply all non-event props to a DOM element.
 * Handles static values, reactive signals, and special cases.
 * Returns an array of disposers for reactive attributes.
 */
export interface ApplyAttrsResult {
  disposers: CleanupFn[] | null;
  hasEventProps: boolean;
}

export function applyAttributes(
  el: Element,
  props: Record<string, unknown>,
): ApplyAttrsResult {
  let disposers: CleanupFn[] | null = null;
  let hasEventProps = false;
  const owner = getCurrentInstance();

  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    if (SKIP_PROPS.has(key)) continue;

    if (isEventProp(key)) {
      hasEventProps = true;
      continue;
    }

    const value = props[key];

    const attrValue = isBindingDescriptor(value)
      ? (value as { getter: unknown }).getter
      : value;

    const isComplex = key === "class" || key === "style";

    if (isReactive(attrValue) || (isComplex && containsReactive(attrValue))) {
      const state: AttributeBindingState = { previousStyleProps: new Set() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, resolve(attrValue as never), state);
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
      });
      if (!disposers) disposers = [];
      disposers.push(dispose);
    } else {
      setSingleAttribute(el, key, attrValue);
    }
  }

  return { disposers, hasEventProps };
}

function containsReactive(value: unknown): boolean {
  if (isReactive(value)) return true;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (containsReactive(value[i])) return true;
    }
    return false;
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (containsReactive(obj[key])) return true;
      }
    }
    return false;
  }
  return false;
}
