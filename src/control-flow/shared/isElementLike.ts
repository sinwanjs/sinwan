import type { SinwanElement } from "../../types.ts";

/** True when `value` looks like a Sinwan element (`{ tag, … }`). */
export function isElementLike(value: unknown): value is SinwanElement {
  return value != null && typeof value === "object" && "tag" in value;
}
