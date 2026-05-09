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
  queueUpdatedHooks,
  handleComponentError,
} from "./instance.ts";

export type { ComponentInstance } from "./instance.ts";

// Lifecycle hooks
export { onMounted, onUnmounted, onUpdated, onError } from "./lifecycle.ts";

// Component factories
export { createComponent, createPage, createLayout } from "./create.ts";

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
} from "./control-flow.ts";

// Dependency injection
export { provide, inject } from "./provide-inject.ts";
export type { InjectionKey } from "./provide-inject.ts";
