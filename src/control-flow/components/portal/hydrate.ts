import type { SinwanElement } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import type { HydrationCursor } from "../../../hydration/walk.ts";
import { renderPortal } from "./client.ts";

/**
 * Hydrate a `<Portal>` — SSR emits nothing, so client-mount into the target
 * via the same path as fresh client render (placeholder stays in-tree).
 */
export function hydratePortal(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  return renderPortal(element, cursor.parent, cursor.current, null);
}
