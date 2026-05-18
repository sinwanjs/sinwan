/**
 * Context-shaped types (React compatible).
 */

import type { REACT_CONTEXT_TYPE } from "../_internal/symbols.ts";
import type { ReactNode, FC } from "./core.ts";

export interface Provider<T> extends FC<{ value: T; children?: ReactNode }> {
  displayName?: string;
}

export interface Consumer<T> extends FC<{ children: (value: T) => ReactNode }> {
  displayName?: string;
}

export interface Context<T> {
  $$typeof: typeof REACT_CONTEXT_TYPE;
  Provider: Provider<T>;
  Consumer: Consumer<T>;
  /** React — `<MyContext value={x}>` shorthand. */
  (props: { value?: T; children?: ReactNode }): unknown;
  displayName?: string;
  _defaultValue: T;
  _key: symbol;
}

export type ContextType<C extends Context<unknown>> =
  C extends Context<infer T> ? T : never;
