/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Event Binding
 *
 * Most client `on*` props use Solid-style document delegation (`$$click` +
 * one listener per event type) in the *capture* phase so ancestor
 * `stopPropagation()` during bubble (e.g. DialogContent) cannot skip handlers.
 *
 * Non-bubbling geometry events (`mouseenter`, `mouseleave`, `focus`, `blur`)
 * are bound with direct `addEventListener` on the element — same as Solid.
 * Document capture cannot see them when the pointer hits a child (SVG icon
 * inside a tooltip trigger), which left only a thin padding hit target.
 */

import type { CleanupFn } from "../reactivity/index.ts";

/** Property prefix for delegated handlers (Solid-compatible). */
const DELEGATE_PREFIX = "$$";

/**
 * Events that must use per-element listeners (Solid does not put these in
 * DelegatedEvents — it uses mouseover/focusin instead, or direct bind).
 */
const DIRECT_EVENTS = new Set([
  "mouseenter",
  "mouseleave",
  "focus",
  "blur",
]);

/** Event types already registered, keyed by document (tests swap happy-dom windows). */
let delegatedByDocument = new WeakMap<Document, Set<string>>();

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
 * e.g., "onclick" → "click", "onmouseenter" → "mouseenter"
 */
export function toEventName(key: string): string {
  return key.slice(2).toLowerCase();
}

function delegatePropName(eventName: string): string {
  return `${DELEGATE_PREFIX}${eventName}`;
}

function delegatedListener(event: Event): void {
  let node: EventTarget | null = event.target;
  const prop = delegatePropName(event.type);

  while (node != null) {
    const handler = (node as unknown as Record<string, unknown>)[prop];
    if (typeof handler === "function") {
      const current = node;
      Object.defineProperty(event, "currentTarget", {
        configurable: true,
        get() {
          return current;
        },
      });
      (handler as EventListener).call(current, event);
      if (event.cancelBubble) return;
    }
    node = node instanceof Node ? node.parentNode : null;
  }
}

/**
 * Ensure a single document-level listener exists for `eventName`.
 */
export function ensureDelegated(
  eventName: string,
  doc: Document = document,
): void {
  if (typeof doc === "undefined") return;
  let types = delegatedByDocument.get(doc);
  if (!types) {
    types = new Set();
    delegatedByDocument.set(doc, types);
  }
  if (types.has(eventName)) return;
  types.add(eventName);
  // Capture phase: run before target/bubble so ancestor stopPropagation
  // (DialogContent, etc.) cannot skip delegated $$ handlers.
  doc.addEventListener(eventName, delegatedListener, true);
}

/**
 * Bind an event. Bubbling events use document capture + `$$eventName`.
 * mouseenter/mouseleave/focus/blur use a direct element listener.
 * Returns a cleanup that clears the binding.
 */
export function bindDelegatedEvent(
  el: Element,
  eventName: string,
  handler: EventListener,
  doc: Document = document,
): CleanupFn {
  if (DIRECT_EVENTS.has(eventName)) {
    el.addEventListener(eventName, handler);
    return () => {
      el.removeEventListener(eventName, handler);
    };
  }

  const prop = delegatePropName(eventName);
  (el as unknown as Record<string, unknown>)[prop] = handler;
  ensureDelegated(eventName, doc);
  return () => {
    // Range.deleteContents / bulk detach already dropped the node — skip
    // explicit $$ delete (Solid also leaves props for GC). Keep delete when
    // the element is still live (single-row remove / reuse).
    if (!el.isConnected) return;
    delete (el as unknown as Record<string, unknown>)[prop];
  };
}

/**
 * Bind a single event handler on an element.
 * Prefer this or `bindEvents` at call sites; both use the shared model.
 */
export function bindEvent(
  el: Element,
  eventName: string,
  handler: EventListener,
  doc: Document = document,
): CleanupFn {
  return bindDelegatedEvent(el, eventName, handler, doc);
}

/**
 * Bind all event props from an element's props object.
 * Returns an array of cleanup functions.
 */
export function bindEvents(
  el: Element,
  props: Record<string, unknown>,
  doc: Document = document,
): CleanupFn[] | null {
  let cleanups: CleanupFn[] | null = null;

  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    if (isEventProp(key)) {
      const handler = props[key];
      if (typeof handler === "function") {
        const eventName = toEventName(key);
        if (!cleanups) cleanups = [];
        cleanups.push(
          bindDelegatedEvent(el, eventName, handler as EventListener, doc),
        );
      }
    }
  }

  return cleanups;
}

/** Test helper: clear delegated event registry (does not remove document listeners). */
export function __resetDelegatedEventsForTests(): void {
  delegatedByDocument = new WeakMap();
}
