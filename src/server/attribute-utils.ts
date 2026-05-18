import { escapeHtml } from "../common/escaper.ts";

const PROP_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  crossOrigin: "crossorigin",
};

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
  const attrName = PROP_ALIASES[key] ?? key;

  if (value == null || value === false) {
    return "";
  }

  if (value === true) {
    return ` ${attrName}`;
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
  if (
    typeof value === "object" &&
    attrName !== "class" &&
    attrName !== "style"
  ) {
    return "";
  }

  const attrValue =
    attrName === "class" && typeof value === "object"
      ? stringifyClass(value)
      : attrName === "style" && typeof value === "object"
        ? stringifyStyle(value)
        : String(value);

  // Block dangerous URLs in sensitive attributes (XSS prevention)
  if (
    URL_ATTRIBUTES.has(attrName) &&
    typeof attrValue === "string" &&
    hasDangerousProtocol(attrValue)
  ) {
    console.warn(`[Sinwan] Blocked dangerous URL in ${attrName}:`, attrValue);
    return "";
  }

  return ` ${attrName}="${escapeHtml(attrValue)}"`;
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
