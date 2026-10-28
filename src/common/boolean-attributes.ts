// HTML enumerated attributes that accept "true" / "false" rather than being
// boolean presence/absence attributes. For these, value === true must render as
// the string "true" (e.g. draggable="true"), not a bare attribute name.
const ENUMERATED_BOOLEAN_ATTRIBUTES = new Set([
  "draggable",
  "contentEditable",
  "contenteditable",
  "spellcheck",
  "autocorrect",
  "writingsuggestions",
]);

/**
 * Serialized attribute value for a boolean JSX prop, or `null` when the
 * attribute must be absent. WAI-ARIA states are enumerated strings, so
 * `aria-*` renders an explicit "true" / "false".
 */
export function booleanAttributeValue(
  key: string,
  value: boolean,
): string | null {
  if (key.startsWith("aria-")) return value ? "true" : "false";
  if (!value) return null;
  return ENUMERATED_BOOLEAN_ATTRIBUTES.has(key) ? "true" : "";
}
