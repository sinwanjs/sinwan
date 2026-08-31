/// <reference lib="dom" />

/**
 * SinwanJS Renderer — Template Slot Protocol
 *
 * Formal contract between the compiler and the runtime `_$createTemplate`
 * function for the `<!--s:N-->` slot markers embedded in compiled templates.
 */

/** A single dynamic slot inside a compiled template. */
export interface TemplateSlot {
  /** Path from the template root to the target node. */
  path: number[];
  /** Slot type: child, attribute, event, or ref. */
  type: "child" | "attr" | "event" | "ref";
  /** Attribute or event name (for attr/event slots). */
  name?: string;
}

/** Compiled template definition consumed by `_$createTemplate`. */
export interface TemplateDef {
  /** Static HTML string containing slot markers. */
  html: string;
  /** Slots in render order, matching the `dynamics` array. */
  slots: TemplateSlot[];
}

/**
 * Protocol for encoding/decoding template slot markers.
 *
 * The compiler and runtime share the same protocol instance so the format
 * cannot drift between generated code and its runtime interpreter.
 */
export interface TemplateSlotProtocol {
  /** Prefix used in marker comment data, e.g. `"s"`. */
  readonly slotPrefix: string;
  /** Encode a slot index into a comment string. */
  encodeSlot(index: number): string;
  /** Decode a comment node into a slot index, or null if it is not a slot marker. */
  decodeSlot(node: Comment): number | null;
}

/** Default template slot protocol used by the compiler and runtime. */
export const DEFAULT_TEMPLATE_SLOT_PROTOCOL: TemplateSlotProtocol = {
  slotPrefix: "s",

  encodeSlot(index) {
    return `s:${index}`;
  },

  decodeSlot(node) {
    const data = node.data;
    if (data.startsWith("s:")) {
      const idx = parseInt(data.slice(2), 10);
      return Number.isNaN(idx) ? null : idx;
    }
    return null;
  },
};
