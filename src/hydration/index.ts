/**
 * SinwanJS Hydration — Public API
 */

export { hydrate } from "./hydrate.ts";
export { hydrateIslands } from "./islands.ts";
export type {
  IslandRegistry,
  HydrateIslandsOptions,
  HydratedIsland,
} from "./islands.ts";

export {
  COMP_ID_ATTR,
  COMP_ID_PREFIX,
  TEXT_MARKER_OPEN,
  TEXT_MARKER_CLOSE,
  EVENT_ATTR,
  compId,
  textMarkerOpen,
  textMarkerCloseStr,
  eventAttrValue,
  parseTextOpenMarker,
  isTextCloseMarker,
  parseEventAttr,
  parseCompId,
} from "./markers.ts";

export type { HydrationCursor } from "./walk.ts";

/**
 * Read SSR data serialized in the `<script id="__SINWAN_DATA__" type="application/json">` tag.
 * Returns an empty object if the tag is missing or invalid.
 */
export function getSinwanData(): any {
  if (typeof document === "undefined") return {};
  const script = document.getElementById("__SINWAN_DATA__");
  if (!script) return {};
  try {
    return JSON.parse(script.textContent || "{}");
  } catch {
    return {};
  }
}
