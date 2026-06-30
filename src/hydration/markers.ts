/// <reference lib="dom" />

/**
 * SinwanJS Hydration — Marker Protocol
 *
 * Constants and helpers for the hydration marker format. This file is the
 * single source of truth for marker strings. The default `HydrationAdapter`
 * is built from these constants and exported for use by the SSR renderer and
 * the hydration walker.
 *
 * Marker format:
 *
 *   data-sinwan-id="c0"             — component boundary
 *   <!--sinwan-t:0-->val<!--/sinwan-t-->  — reactive text boundary
 *   data-sinwan-ev="click:0"        — event binding reference
 */

import type { HydrationAdapter } from "./adapter.ts";
export type { HydrationAdapter };

// ─── Constants ─────────────────────────────────────────────

/** Attribute on the root element of each component instance. */
export const COMP_ID_ATTR = "data-sinwan-id";

/** Prefix for component IDs. */
export const COMP_ID_PREFIX = "c";

/** Opening comment prefix for reactive text slots: `sinwan-t:N` */
export const TEXT_MARKER_OPEN = "sinwan-t:";

/** Closing comment for reactive text slots. */
export const TEXT_MARKER_CLOSE = "/sinwan-t";

/** Opening comment for reactive function blocks: `sinwan-r` */
export const FUNCTION_MARKER_OPEN = "sinwan-r";

/** Closing comment for reactive function blocks. */
export const FUNCTION_MARKER_CLOSE = "/sinwan-r";

/** Attribute for event binding references. */
export const EVENT_ATTR = "data-sinwan-ev";

// ─── Server-side marker generation ────────────────────────

/** Build a component ID string, e.g. `"c0"`. */
export function compId(index: number): string {
  return `${COMP_ID_PREFIX}${index}`;
}

/** Build an opening text marker comment string. */
export function textMarkerOpen(index: number): string {
  return `<!--${TEXT_MARKER_OPEN}${index}-->`;
}

/** Build a closing text marker comment string. */
export function textMarkerCloseStr(): string {
  return `<!--${TEXT_MARKER_CLOSE}-->`;
}

/** Build an opening function block marker comment string. */
export function functionMarkerOpen(): string {
  return `<!--${FUNCTION_MARKER_OPEN}-->`;
}

/** Build a closing function block marker comment string. */
export function functionMarkerCloseStr(): string {
  return `<!--${FUNCTION_MARKER_CLOSE}-->`;
}

/** Build an event attribute value, e.g. `"click:0"`. */
export function eventAttrValue(event: string, index: number): string {
  return `${event}:${index}`;
}

// ─── Client-side marker parsing ───────────────────────────

/**
 * Check if a comment node is a reactive text opening marker.
 * Returns the slot index, or -1 if not a marker.
 */
export function parseTextOpenMarker(node: Comment): number {
  const data = node.data;
  if (data.startsWith(TEXT_MARKER_OPEN)) {
    const idx = parseInt(data.slice(TEXT_MARKER_OPEN.length), 10);
    return Number.isNaN(idx) ? -1 : idx;
  }
  return -1;
}

/**
 * Check if a comment node is a reactive text closing marker.
 */
export function isTextCloseMarker(node: Comment): boolean {
  return node.data === TEXT_MARKER_CLOSE;
}

/**
 * Check if a comment node is a reactive function block opening marker.
 */
export function isFunctionOpenMarker(node: Comment): boolean {
  return node.data === FUNCTION_MARKER_OPEN;
}

/**
 * Check if a comment node is a reactive function block closing marker.
 */
export function isFunctionCloseMarker(node: Comment): boolean {
  return node.data === FUNCTION_MARKER_CLOSE;
}

/**
 * Parse `data-sinwan-ev` attribute value into event entries.
 * Format: `"click:0"` or `"click:0,input:1"` for multiple.
 * Returns array of `[eventName, handlerIndex]` tuples.
 */
export function parseEventAttr(value: string): [string, number][] {
  const pairs = value.split(",");
  const result = new Array<[string, number]>(pairs.length);

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const colonIndex = pair.indexOf(":");

    result[i] = [pair.slice(0, colonIndex), Number(pair.slice(colonIndex + 1))];
  }

  return result;
}

/**
 * Parse `data-sinwan-id` into the component index.
 * e.g., `"c3"` → `3`
 */
export function parseCompId(value: string): number {
  return parseInt(value.slice(COMP_ID_PREFIX.length), 10);
}

// ─── Default HydrationAdapter ───────────────────────────────

/**
 * Default adapter implementing the Sinwan marker protocol.
 *
 * Exported as a singleton so all hydration producers and consumers use the
 * same format by default. Tests can inject a custom adapter to validate the
 * abstraction without changing the rest of the framework.
 */
export const DEFAULT_HYDRATION_ADAPTER: HydrationAdapter = {
  componentAttr: COMP_ID_ATTR,
  eventAttr: EVENT_ATTR,

  emitComponentMarker(index) {
    return `${COMP_ID_ATTR}="${compId(index)}"`;
  },

  emitEventMarker(bindings) {
    return `${EVENT_ATTR}="${bindings.map(([event, idx]) => eventAttrValue(event, idx)).join(",")}"`;
  },

  emitTextOpenMarker(index) {
    return textMarkerOpen(index);
  },

  emitTextCloseMarker() {
    return textMarkerCloseStr();
  },

  emitFunctionOpenMarker() {
    return functionMarkerOpen();
  },

  emitFunctionCloseMarker() {
    return functionMarkerCloseStr();
  },

  parseComponentMarker(el) {
    const value = el.getAttribute(COMP_ID_ATTR);
    if (value == null) return null;
    return parseCompId(value);
  },

  parseEventMarker(value) {
    return parseEventAttr(value);
  },

  parseTextOpenMarker(node) {
    return parseTextOpenMarker(node);
  },

  isTextCloseMarker(node) {
    return isTextCloseMarker(node);
  },

  isFunctionOpenMarker(node) {
    return isFunctionOpenMarker(node);
  },

  isFunctionCloseMarker(node) {
    return isFunctionCloseMarker(node);
  },

  stripMarkers(html) {
    return html
      .replace(/\s+data-sinwan-id="c\d+"/g, "")
      .replace(/\s+data-sinwan-ev="[^"]*"/g, "")
      .replace(/<!--sinwan-t:\d+-->/g, "")
      .replace(/<!--\/sinwan-t-->/g, "");
  },
};
