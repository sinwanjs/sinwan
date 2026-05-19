/**
 * SinwanJS Event Bus — Public API
 *
 * Type-safe event communication with lifecycle integration and SSR safety.
 */

// Core event bus
export {
  SinwanEventBus,
  globalEventBus,
  type Listener,
} from "./bus.ts";

// Component hooks
export {
  useEvent,
  useEventNamespace,
  useEventOnce,
} from "./use-event.ts";

// SSR context
export {
  createSSRContext,
  getSSRContext,
  setSSRContext,
  withSSRContext,
  getCurrentEventBus,
  type SSRContext,
} from "./ssr-context.ts";
