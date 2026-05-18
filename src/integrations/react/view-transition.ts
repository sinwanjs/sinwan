import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement } from "../../types.ts";
import { VIEW_TRANSITION_TYPE } from "../../component/control-flow.ts";
import { isServer } from "./_internal/is-server.ts";
import { REACT_VIEW_TRANSITION_TYPE } from "./_internal/symbols.ts";

// ─── Types ─────────────────────────────────────────────────────────────────

/** Pseudo-element reference used in View Transition Events. */
export interface PseudoElement {
  animate(
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation;
}

/** Instance passed to View Transition Event callbacks. */
export interface ViewTransitionInstance {
  old: PseudoElement | null;
  new: PseudoElement | null;
  name: string;
  group: PseudoElement | null;
  imagePair: PseudoElement | null;
}

/** View Transition Event callback signature. */
export type ViewTransitionEventCallback = (
  instance: ViewTransitionInstance,
  types: string[],
) => (() => void) | void;

/** View Transition class value: `auto`, `none`, a class name, or a typed map. */
export type ViewTransitionClassValue =
  | "auto"
  | "none"
  | string
  | Record<string, string>;

export interface ViewTransitionProps {
  /** Explicit view-transition-name. Omit to let React generate a unique one. */
  name?: string;
  /** Class for enter animations. */
  enter?: ViewTransitionClassValue;
  /** Class for exit animations. */
  exit?: ViewTransitionClassValue;
  /** Class for update animations. */
  update?: ViewTransitionClassValue;
  /** Class for shared-element animations. */
  share?: ViewTransitionClassValue;
  /** Default class for all animation triggers. */
  default?: ViewTransitionClassValue;
  /** Called when an enter animation is triggered. */
  onEnter?: ViewTransitionEventCallback;
  /** Called when an exit animation is triggered. */
  onExit?: ViewTransitionEventCallback;
  /** Called when an update animation is triggered. */
  onUpdate?: ViewTransitionEventCallback;
  /** Called when a share animation is triggered. */
  onShare?: ViewTransitionEventCallback;
  children?: ReactNode;
}

// ─── Component ─────────────────────────────────────────────────────────────
/**
 * React-compatible `<ViewTransition>` — `[CLIENT]`.
 *
 * Wraps its children in a boundary that applies `view-transition-name` to
 * the nearest DOM node when a `name` prop is provided. Without a `name`, it
 * acts as a transparent passthrough.
 *
 * Supports View Transition Class props (`enter`, `exit`, `update`, `share`,
 * `default`) and View Transition Event callbacks (`onEnter`, `onExit`,
 * `onUpdate`, `onShare`).
 *
 * Sinwan's renderer creates a wrapper `<div>` with the inline style when a
 * `name` is present; on unsupported browsers or SSR the children still render
 * normally.
 *
 * The `unstable_startViewTransition` helper delegates to the browser's
 * `document.startViewTransition` when available, otherwise runs the callback
 * synchronously.
 *
 * SSR: safe — children are still emitted; `name` produces the wrapper div.
 * Reactivity: pass-through.
 *
 * @example
 * ```tsx
 * import { ViewTransition, startTransition } from "sinwan/react-client";
 *
 * <ViewTransition name="page">
 *   <Page key={route} />
 * </ViewTransition>
 *
 * startTransition(() => navigate("/about"));
 * ```
 */
export function ViewTransition(props: ViewTransitionProps): SinwanElement {
  return {
    tag: VIEW_TRANSITION_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}
(ViewTransition as unknown as { $$typeof: symbol }).$$typeof =
  REACT_VIEW_TRANSITION_TYPE;
(ViewTransition as unknown as { _SinwanComponent?: true })._SinwanComponent =
  true;

/** @deprecated Use `ViewTransition` instead. */
export const unstable_ViewTransition = ViewTransition;

// ─── startViewTransition helper ────────────────────────────────────────────

export function unstable_startViewTransition(
  callback: () => void | Promise<void>,
): { finished: Promise<void> } {
  if (isServer()) {
    return {
      finished: Promise.resolve(callback() as void | Promise<void>).then(
        () => undefined,
      ),
    };
  }
  const start = (
    document as unknown as {
      startViewTransition?: (cb: () => void | Promise<void>) => {
        finished: Promise<void>;
      };
    }
  ).startViewTransition;
  if (typeof start === "function") {
    const t = start.call(document, callback);
    return { finished: t.finished };
  }
  return {
    finished: Promise.resolve(callback() as void | Promise<void>).then(
      () => undefined,
    ),
  };
}
