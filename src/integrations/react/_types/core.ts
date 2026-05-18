/**
 * React compatible core types — authored from scratch.
 *
 * Sinwan does NOT depend on `react` (not at runtime, not for types).
 * These declarations mirror React's public type names so user code typed
 * against React patterns compiles unchanged when consuming sinwan/react-client.
 */

import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { REACT_ELEMENT_TYPE } from "../_internal/symbols.ts";

// ─── Keys / refs ───────────────────────────────────────────

export type Key = string | number | bigint;

export interface RefObject<T> {
  readonly current: T | null;
}
export interface MutableRefObject<T> {
  current: T;
}
export type RefCallback<T> = (instance: T | null) => void | (() => void);
export type Ref<T> = RefCallback<T> | RefObject<T> | null;
export type LegacyRef<T> = string | Ref<T>;

// ─── Children / nodes ──────────────────────────────────────

/**
 * React-compatible alias for any renderable node. Internally identical to
 * `SinwanNode` so JSX produced by either runtime interoperates.
 */
export type ReactNode = SinwanNode;

export type ReactChild = SinwanNode;
export type ReactFragment = Iterable<ReactNode>;
export type ReactText = string | number;

// ─── Elements ──────────────────────────────────────────────

export interface ReactElement<
  P = unknown,
  T extends string | JSXElementConstructor<unknown> =
    | string
    | JSXElementConstructor<unknown>,
> {
  readonly $$typeof: typeof REACT_ELEMENT_TYPE;
  type: T;
  props: P;
  key: Key | null;
}

export type JSXElementConstructor<P> =
  | ((
      props: P,
    ) =>
      | ReactElement<unknown, string | JSXElementConstructor<unknown>>
      | SinwanElement
      | null)
  | (new (props: P) => unknown);

// ─── Component types ───────────────────────────────────────

export interface FunctionComponent<P = {}> {
  (
    props: P & { children?: ReactNode },
    deprecatedLegacyContext?: never,
  ):
    | ReactElement<unknown, string | JSXElementConstructor<unknown>>
    | SinwanElement
    | null;
  displayName?: string;
}
export type FC<P = {}> = FunctionComponent<P>;

export type ComponentType<P = {}> = FunctionComponent<P>;

export interface ExoticComponent<P = {}> {
  (props: P): ReactElement | null;
  readonly $$typeof: symbol;
}

export interface NamedExoticComponent<P = {}> extends ExoticComponent<P> {
  displayName?: string;
}

export interface MemoExoticComponent<
  T extends ComponentType<any>,
> extends NamedExoticComponent<React_ComponentProps<T>> {
  readonly type: T;
}

export interface LazyExoticComponent<
  T extends ComponentType<any>,
> extends ExoticComponent<React_ComponentProps<T>> {
  readonly _result: T;
}

// ─── Props helpers ─────────────────────────────────────────

export type PropsWithChildren<P = unknown> = P & { children?: ReactNode };
export type PropsWithRef<P> = P;
export type PropsWithoutRef<P> = P extends { ref?: infer _R }
  ? Omit<P, "ref">
  : P;

export type React_ComponentProps<T> =
  T extends ComponentType<infer P> ? P : never;

// ─── Provider / Consumer / Context (re-declared in context.ts) ─
export interface ProviderProps<T> {
  value: T;
  children?: ReactNode;
}
export interface ConsumerProps<T> {
  children: (value: T) => ReactNode;
}

// ─── ErrorInfo ─────────────────────────────────────────────
export interface ErrorInfo {
  componentStack?: string | null;
  digest?: string | null;
}
