/**
 * SinwanJS View Module — Core Types
 *
 * Type definitions for the Sinwan component system.
 * Mirrors React's FC model but compiles to optimized string builders.
 */

import type { HtmlEscapedString } from "./jsx/jsx-runtime";
import type { Signal, Computed } from "./reactivity/index.ts";

// Primitive node types that can be rendered
export type SinwanPrimitive = string | number | boolean | null | undefined;

declare global {
  var __DEV__: boolean | undefined;
}

/**
 * A value that may be plain `T` or a reactive container (`Signal<T>` /
 * `Computed<T>`). Used by JSX attribute types so reactive props type-check.
 */
export type Reactive<T> = T | Signal<T> | Computed<T> | (() => T);

// Element structure returned by JSX
export interface SinwanElement {
  tag: string | symbol | SinwanComponent<any>;
  props: Record<string, unknown>;
  children: SinwanNode[];
}

// Sync node type — accepts primitives, elements, pre-escaped HTML,
// reactive containers (signals/computeds), and arrays.
export type SinwanSyncNode =
  | SinwanPrimitive
  | SinwanElement
  | HtmlEscapedString
  | Signal<unknown>
  | Computed<unknown>
  | (() => unknown)
  | SinwanNode[];

// Recursive node type — accepts sync nodes and async nodes. Promises resolve to
// the sync layer to avoid recursive Awaited<>/then inference in async components.
export type SinwanNode = SinwanSyncNode | Promise<SinwanSyncNode>;

// Named slots for advanced composition
export type SinwanSlots = Record<string, SinwanNode>;

// Component function type - single props argument with children injected
export interface SinwanComponent<P extends object = {}> {
  (props: P & { children?: SinwanNode | SinwanSlots }): SinwanNode;
  _SinwanComponent?: true;
  _displayName?: string;
}

// Render result can be sync or async
export type RenderResult = SinwanNode;

// Props with children helper
export type PropsWithChildren<P = {}> = P & { children?: SinwanNode };

// Props with slots helper
export type PropsWithSlots<P = {}> = P & { children?: SinwanSlots };

// Component registry entry
export interface PageEntry<D extends object = {}> {
  name: string;
  page: SinwanComponent<D>;
}
