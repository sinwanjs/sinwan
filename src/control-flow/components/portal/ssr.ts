import type { SinwanElement } from "../../../types.ts";

/**
 * SSR entry for `<Portal>` — portals are client-only; emit nothing.
 */
export function renderPortalElement(_element: SinwanElement): string {
  return "";
}
