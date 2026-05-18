/**
 * SinwanJS — HTML Escaping
 *
 * Security utilities for sanitizing interpolated values.
 * Runtime-agnostic: prefers `Bun.escapeHTML` when running on Bun (native
 * speed), and falls back to a portable implementation everywhere else
 * (Node, Deno, Cloudflare Workers, browsers).
 */

import { HtmlEscapedString, raw } from "../jsx/jsx-runtime";

export { HtmlEscapedString, raw };

// ─── Native fast-path detection ─────────────────────────────
// `Bun` is only defined inside the Bun runtime. We probe it via globalThis
// so module evaluation never throws on other runtimes.
const _bun = (globalThis as any).Bun as
  | { escapeHTML?: (s: string) => string }
  | undefined;

const _nativeEscape: ((s: string) => string) | undefined =
  typeof _bun?.escapeHTML === "function"
    ? _bun.escapeHTML.bind(_bun)
    : undefined;

// ─── Portable fallback ──────────────────────────────────────
// Covers the five characters that matter inside HTML text and attributes.
const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function portableEscape(str: string): string {
  // Avoid a regex pass when nothing to escape (very common case).
  HTML_ESCAPE_RE.lastIndex = 0;
  if (!HTML_ESCAPE_RE.test(str)) return str;
  return str.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c]!);
}

/**
 * Escape HTML entities in any value.
 * Returns "" for null/undefined/boolean and pass-through for numbers.
 * Pre-escaped strings (`HtmlEscapedString`) are returned untouched.
 */
export function escapeHtml(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "number") return String(value);
  if (value instanceof HtmlEscapedString) return value.value;
  const s = String(value);
  return _nativeEscape ? _nativeEscape(s) : portableEscape(s);
}

/**
 * Mark a string as safe HTML (pre-escaped).
 * USE WITH CAUTION - only for trusted content!
 */
export function safeHtml(html: string): HtmlEscapedString {
  return raw(html);
}

/**
 * Check if a value is already escaped HTML.
 */
export function isSafeHtml(value: unknown): value is HtmlEscapedString {
  return value instanceof HtmlEscapedString;
}
