/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Event Binding
 *
 * Direct event binding (not delegation). Each handler is attached
 * directly to its target element for simplicity and easy hydration.
 *
 * Design decision: direct binding like Solid.js, not delegation like React.
 */

import { domOps } from "./dom-ops.ts";
import type { CleanupFn } from "../reactivity/index.ts";

/**
 * React-to-DOM event name overrides.
 */
const EVENT_NAME_MAP: Record<string, string> = {
  doubleclick: "dblclick",
};

/**
 * Check if a prop key is an event handler (starts with "on").
 * Note: this will match any prop beginning with "on", but bindEvents()
 * guards against false positives by requiring the value to be a function.
 */
export function isEventProp(key: string): boolean {
  return key.length > 2 && key.startsWith("on");
}

/**
 * Extract the DOM event name from a prop key.
 * e.g., "onClick" → "click", "onMouseEnter" → "mouseenter"
 */
export function toEventName(key: string): string {
  const raw = key.slice(2).toLowerCase();
  return EVENT_NAME_MAP[raw] ?? raw;
}

/**
 * Bind an event handler to an element.
 * Returns a cleanup function to remove the listener.
 */
export function bindEvent(
  el: Element,
  eventName: string,
  handler: EventListener,
): CleanupFn {
  domOps.addEventListener(el, eventName, handler);
  return () => {
    domOps.removeEventListener(el, eventName, handler);
  };
}

/**
 * Bind all event props from an element's props object.
 * Returns an array of cleanup functions.
 */
export function bindEvents(
  el: Element,
  props: Record<string, unknown>,
): CleanupFn[] | null {
  let cleanups: CleanupFn[] | null = null;

  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    if (isEventProp(key)) {
      const handler = props[key];
      if (typeof handler === "function") {
        const eventName = toEventName(key);
        if (!cleanups) cleanups = [];
        cleanups.push(bindEvent(el, eventName, handler as EventListener));
      }
    }
  }

  return cleanups;
}
