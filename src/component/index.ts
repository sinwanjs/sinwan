/**
 * SinwanJS Component Runtime — Public API
 */

// Instance management
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
} from "./instance.ts";

export type { ComponentInstance } from "./instance.ts";

// Lifecycle hooks
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

// Component factories
export { cc } from "./create.ts";

// Control flow
export {
  Show,
  For,
  Switch,
  Match,
  Index,
  Key,
  Dynamic,
  Visible,
  Portal,
  ErrorBoundary,
  Virtual,
} from "./control-flow.ts";
export type {
  ShowProps,
  ForProps,
  SwitchProps,
  MatchProps,
  IndexProps,
  KeyProps,
  DynamicProps,
  DynamicTag,
  VisibleProps,
  PortalProps,
  ErrorBoundaryProps,
  VirtualProps,
} from "./control-flow.ts";

// Dependency injection
export { provide, inject } from "./provide-inject.ts";
export type { InjectionKey } from "./provide-inject.ts";

// Islands (partial hydration)
export {
  island,
  isIslandElement,
  ISLAND_TAG,
  ISLAND_ATTR,
  ISLAND_PROPS_ATTR,
} from "./island.ts";
export type { IslandOptions, IslandMeta } from "./island.ts";
