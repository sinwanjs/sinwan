/**
 * SinwanJS Component Runtime — Public API
 *
 * Components, lifecycle, provide/inject, and islands. Control-flow primitives
 * (`Show`, `For`, …) are exported from `sinwan/control-flow`.
 */

export {
  getCurrentInstance,
  setCurrentInstance,
  withInstance,
  createComponentInstance,
  fireMountedHooks,
  fireUnmountedHooks,
  fireUpdatedHooks,
  fireHydratedHooks,
  queueUpdatedHooks,
  handleComponentError,
  softHideInstance,
  softShowInstance,
} from "./instance.ts";

export type { ComponentInstance } from "./instance.ts";

export {
  onMounted,
  onUnmounted,
  onUpdated,
  onDispose,
  onHydrated,
  onServer,
  onClient,
  onError,
} from "./lifecycle.ts";

export { cc } from "./create.ts";
export {
  createLiveProps,
  createLiveRest,
  getRawProps,
  getSpreadProps,
  isLiveProps,
} from "./live-props.ts";

export { provide, inject } from "./provide-inject.ts";
export type { InjectionKey } from "./provide-inject.ts";

export {
  island,
  isIslandElement,
  ISLAND_TAG,
  ISLAND_ATTR,
  ISLAND_PROPS_ATTR,
} from "./island.ts";
export type { IslandOptions, IslandMeta } from "./island.ts";

export * from "../common/escaper.ts";
export * from "../types.ts";
