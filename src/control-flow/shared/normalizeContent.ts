import type { SinwanNode } from "../../types.ts";

/**
 * Normalize a children prop into a flat array of nodes.
 * `null` / `undefined` / `boolean` become `[]`.
 */
export function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}
