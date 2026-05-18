/**
 * SHARED React adapters — runs on both client and server.
 *
 * Tree-shakeable named exports. No `react` / `react-dom` imports anywhere
 * in this module or its transitive deps.
 */

export { Fragment } from "./fragment.ts";
export { createContext } from "./create-context.ts";
export { memo } from "./memo.ts";
export { lazy } from "./lazy.ts";
export { use } from "./use.ts";
export { cache } from "./cache.ts";
export { cacheSignal } from "./cache-signal.ts";
export {
  addTransitionType,
  getActiveTransitionTypes,
} from "./add-transition-type.ts";
export { captureOwnerStack } from "./capture-owner-stack.ts";

// Type re-exports — public surface for SHARED APIs.
export type {
  ReactNode,
  ReactElement,
  Key,
  Ref,
  RefObject,
  MutableRefObject,
  RefCallback,
  ComponentType,
  FunctionComponent,
  FC,
  PropsWithChildren,
  MemoExoticComponent,
  LazyExoticComponent,
  ErrorInfo,
} from "./_types/core.ts";
export type {
  Context,
  Provider,
  Consumer,
  ContextType,
} from "./_types/context.ts";
export type { Usable } from "./_types/hooks.ts";
