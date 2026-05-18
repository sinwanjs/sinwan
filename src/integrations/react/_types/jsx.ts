/**
 * Minimal JSX namespace authored from scratch.
 *
 * Sinwan already declares a global JSX namespace in `src/jsx/jsx-runtime.ts`
 * with rich intrinsic-element types. This module re-exports the same surface
 * under React-style names so consumers writing `JSX.Element` /
 * `JSX.IntrinsicElements` from the React-compatible API still type-check.
 */

import type { SinwanNode } from "../../../types.ts";
import type { SinwanIntrinsicElements } from "../../../jsx/jsx-types.ts";

export type Element = SinwanNode;
export type ElementClass = unknown;
export type ElementType = string | ((props: any) => Element | null);

export interface IntrinsicAttributes {}
export interface IntrinsicClassAttributes<T> {
  ref?: import("./core.ts").Ref<T>;
}
export interface ElementChildrenAttribute {
  children: {};
}
export interface IntrinsicElements extends SinwanIntrinsicElements {}

export interface LibraryManagedAttributes<C, P> {}
