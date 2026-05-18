/**
 * CLIENT React adapters — DOM-side hooks and APIs.
 *
 * Re-exports SHARED adapters too so consumers can import everything from
 * `sinwan/react-client` in one go.
 */

// SHARED (re-exported for ergonomics)
export * from "./_shared.ts";

// CLIENT hooks (Phase 2)
export { useState } from "./use-state.ts";
export { useReducer } from "./use-reducer.ts";
export { useRef } from "./use-ref.ts";
export { useMemo } from "./use-memo.ts";
export { useCallback } from "./use-callback.ts";
export { useId } from "./use-id.ts";
export { useContext } from "./use-context.ts";
export { use } from "./use.ts";
export { useDebugValue } from "./use-debug-value.ts";
export { useEffect } from "./use-effect.ts";
export { useLayoutEffect } from "./use-layout-effect.ts";
export { useInsertionEffect } from "./use-insertion-effect.ts";
export { useEffectEvent } from "./use-effect-event.ts";
export { useTitle } from "./use-title.ts";
export { useSyncExternalStore } from "./use-sync-external-store.ts";
export { useDeferredValue } from "./use-deferred-value.ts";
export { useTransition } from "./use-transition.ts";
export { startTransition } from "./start-transition.ts";
export { useOptimistic } from "./use-optimistic.ts";
export { useActionState } from "./use-action-state.ts";
export { useImperativeHandle } from "./use-imperative-handle.ts";

// CLIENT components & DOM APIs (Phase 3)
export { Profiler } from "./profiler.ts";
export type { ProfilerProps, ProfilerOnRender } from "./profiler.ts";
export { StrictMode } from "./strict-mode.ts";
export type { StrictModeProps } from "./strict-mode.ts";
export { Suspense } from "./suspense.ts";
export type { SuspenseProps } from "./suspense.ts";
export { createPortal } from "./create-portal.ts";
export { flushSync } from "./flush-sync.ts";
export {
  preconnect,
  prefetchDNS,
  preload,
  preloadModule,
  preinit,
  preinitModule,
} from "./resource-hints.ts";
export type {
  PreloadOptions,
  PreloadModuleOptions,
  PreinitOptions,
  PreinitModuleOptions,
} from "./resource-hints.ts";
export { useFormStatus } from "./use-form-status.ts";
export {
  Form,
  Input,
  Button,
  Select,
  Textarea,
  Option,
  Progress,
  Link,
  Meta,
  Script,
  Style,
  Title,
  _resetLinkRegistry,
  _resetStyleRegistry,
} from "./elements.ts";
export type {
  FormActionProps,
  InputProps,
  ButtonProps,
  OptionProps,
  SelectProps,
  TextareaProps,
  ProgressProps,
  LinkProps,
  MetaProps,
  ScriptProps,
  StyleProps,
  TitleProps,
} from "./elements.ts";
export { createRoot } from "./create-root.ts";
export type { Root, CreateRootOptions } from "./create-root.ts";
export { hydrateRoot } from "./hydrate-root.ts";
export type { CreateRootOptions as HydrateRootOptions } from "./create-root.ts";

// Islands client runtime — `hydrateIslands(registry, root?)` finds every
// `<… data-sinwan-island="name">` and calls `hydrate()` against the matching
// component in the registry. Components authored with React-style JSX work
// without modification.
export { hydrateIslands } from "../../hydration/islands.ts";
export type {
  IslandRegistry,
  HydrateIslandsOptions,
  HydratedIsland,
} from "../../hydration/islands.ts";
export { act } from "./act.ts";

// Activity
export { Activity } from "./activity.ts";
export type { ActivityProps, ActivityMode } from "./activity.ts";

// ViewTransition
export {
  ViewTransition,
  unstable_ViewTransition,
  unstable_startViewTransition,
} from "./view-transition.ts";
export type {
  ViewTransitionProps,
  ViewTransitionInstance,
  ViewTransitionEventCallback,
  ViewTransitionClassValue,
  PseudoElement,
} from "./view-transition.ts";

// CLIENT type re-exports
export type {
  Dispatch,
  SetStateAction,
  StateUpdater,
  Reducer,
  ReducerWithoutAction,
  ReducerState,
  ReducerAction,
  EffectCallback,
  GetterDependencyList,
  Getter,
  TransitionFunction,
  TransitionStartFunction,
  OptimisticReducer,
  ActionStateAction,
  FormStatus,
  UseTitleOptions,
} from "./_types/hooks.ts";
