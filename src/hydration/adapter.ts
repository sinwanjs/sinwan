/// <reference lib="dom" />

/**
 * SinwanJS Hydration — Adapter Interface
 *
 * Abstracts the marker protocol used to coordinate server-side rendering
 * with client-side hydration. The core renderer and the compiler do not
 * depend on this file; only the SSR renderer and hydration walker do.
 */

/**
 * Adapter that knows how to emit and parse hydration markers.
 *
 * All marker format details live behind this interface. Swapping the
 * implementation changes the wire format without touching the rest of
 * the framework.
 */
export interface HydrationAdapter {
  /** Attribute name used for component boundary markers. */
  readonly componentAttr: string;
  /** Attribute name used for event binding markers. */
  readonly eventAttr: string;

  /** Emit the component boundary attribute. */
  emitComponentMarker(index: number): string;
  /** Emit the event binding attribute. */
  emitEventMarker(bindings: [event: string, index: number][]): string;
  /** Emit an opening reactive text marker comment. */
  emitTextOpenMarker(index: number): string;
  /** Emit a closing reactive text marker comment. */
  emitTextCloseMarker(): string;
  /** Emit an opening reactive function block marker comment. */
  emitFunctionOpenMarker(): string;
  /** Emit a closing reactive function block marker comment. */
  emitFunctionCloseMarker(): string;

  /** Parse `data-sinwan-id` into the component index. */
  parseComponentMarker(el: Element): number | null;
  /** Parse `data-sinwan-ev` into event entries. */
  parseEventMarker(value: string): [event: string, index: number][];
  /** Parse a comment into a reactive text slot index. Returns -1 if not a marker. */
  parseTextOpenMarker(node: Comment): number;
  /** Check if a comment is a reactive text closing marker. */
  isTextCloseMarker(node: Comment): boolean;
  /** Check if a comment is a reactive function block opening marker. */
  isFunctionOpenMarker(node: Comment): boolean;
  /** Check if a comment is a reactive function block closing marker. */
  isFunctionCloseMarker(node: Comment): boolean;

  /** Remove all hydration markers from a static HTML string. */
  stripMarkers(html: string): string;
}
