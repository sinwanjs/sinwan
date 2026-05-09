import { escapeHtml } from "../escaper.ts";

const PROP_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  crossOrigin: "crossorigin",
};

export function renderServerAttribute(key: string, value: unknown): string {
  const attrName = PROP_ALIASES[key] ?? key;

  if (value == null || value === false) {
    return "";
  }

  if (value === true) {
    return ` ${attrName}`;
  }

  const attrValue =
    attrName === "class" && typeof value === "object"
      ? stringifyClass(value)
      : attrName === "style" && typeof value === "object"
        ? stringifyStyle(value)
        : String(value);

  return ` ${attrName}="${escapeHtml(attrValue)}"`;
}

function stringifyClass(value: object): string {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" ");
  }

  return Object.entries(value)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name)
    .join(" ");
}

function stringifyStyle(value: object): string {
  return Object.entries(value)
    .filter(([, val]) => val != null && val !== false)
    .map(([prop, val]) => `${toKebabCase(prop)}:${String(val)}`)
    .join(";");
}

function toKebabCase(value: string): string {
  return value.includes("-")
    ? value
    : value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
