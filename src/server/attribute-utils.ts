import { escapeHtml } from "../common/escaper.ts";

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

// Attributes that accept URLs and should have dangerous protocols blocked.
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "cite",
  "poster",
]);

// Protocols that can execute JavaScript or inject HTML.
const DANGEROUS_PROTOCOLS = new Set([
  "javascript:",
  "data:text/html",
  "data:image/svg+xml",
  "vbscript:",
]);

function hasDangerousProtocol(value: string): boolean {
  const lower = value.trimStart().toLowerCase();
  for (const protocol of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(protocol)) {
      return true;
    }
  }
  return false;
}

export function renderServerAttribute(key: string, value: unknown): string {
  // JSX writes the label association attribute as htmlFor; render the
  // standard HTML attribute name.
  if (key === "htmlFor") key = "for";
  // Uncontrolled form defaults are JSX props; HTML uses value/checked.
  if (key === "defaultValue") key = "value";
  if (key === "defaultChecked") key = "checked";

  if (value == null || value === false) {
    return "";
  }

  if (value === true) {
    if (ENUMERATED_BOOLEAN_ATTRIBUTES.has(key)) {
      return ` ${key}="true"`;
    }
    return ` ${key}`;
  }

  // Skip non-renderable values
  if (typeof value === "function" || typeof value === "symbol") {
    return "";
  }
  if (typeof value === "bigint") {
    return "";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return "";
  }
  if (typeof value === "object" && key !== "class" && key !== "style") {
    return "";
  }

  const attrValue =
    key === "class" && typeof value === "object"
      ? stringifyClass(value)
      : key === "style" && typeof value === "object"
        ? stringifyStyle(value)
        : String(value);

  // Block dangerous URLs in sensitive attributes (XSS prevention)
  if (
    URL_ATTRIBUTES.has(key) &&
    typeof attrValue === "string" &&
    hasDangerousProtocol(attrValue)
  ) {
    console.warn(`[Sinwan] Blocked dangerous URL in ${key}:`, attrValue);
    return "";
  }

  return ` ${key}="${escapeHtml(attrValue)}"`;
}

function stringifyClass(value: object): string {
  if (Array.isArray(value)) {
    // replace filter with for loop to avoid creating an intermediate array
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item) {
        parts.push(String(item));
      }
    }
    return parts.join(" ");
  }

  // replace Object.entries/filter/map with for loop to avoid creating intermediate arrays
  const parts: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const enabled = obj[key];
      if (Boolean(enabled)) {
        parts.push(key);
      }
    }
  }
  return parts.join(" ");
}

function stringifyStyle(value: object): string {
  // replace Object.entries/filter/map with for loop to avoid creating intermediate arrays
  const parts: string[] = [];
  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val != null && val !== false) {
        parts.push(`${toKebabCase(key)}:${String(val)}`);
      }
    }
  }
  return parts.join(";");
}

function toKebabCase(value: string): string {
  return value.includes("-")
    ? value
    : value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
