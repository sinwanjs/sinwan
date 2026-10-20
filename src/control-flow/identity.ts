/**
 * Control-flow element factories and tag predicates.
 *
 * No DOM renderer imports. `sinwan/server` uses these so SSR does not load
 * `renderForBlock` and the other client renderers. Client modules re-export
 * the same functions, so `tag === Show` matches across server and client.
 */

import type {
  Reactive,
  SinwanComponent,
  SinwanElement,
  SinwanNode,
} from "../types.ts";
import {
  ACTIVITY_TYPE,
  DYNAMIC_TYPE,
  ERROR_BOUNDARY_TYPE,
  FOR_TYPE,
  INDEX_TYPE,
  KEY_TYPE,
  MATCH_TYPE,
  PORTAL_TYPE,
  SHOW_TYPE,
  SUSPENSE_TYPE,
  SWITCH_TYPE,
  VIEW_TRANSITION_TYPE,
  VIRTUAL_TYPE,
} from "./const.ts";

/** SinwanElement stores a dynamic prop bag; factory props are specific interfaces. */
function elementProps(props: object): Record<string, unknown> {
  return props as Record<string, unknown>;
}

export interface ShowProps<T> {
  when: Reactive<T | false | null | undefined>;
  fallback?: SinwanNode;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

export function Show<T>(props: ShowProps<T>): SinwanElement {
  return {
    tag: SHOW_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isShowElement(element: SinwanElement): boolean {
  return element.tag === SHOW_TYPE;
}

export interface ForProps<T> {
  each: Reactive<readonly T[]>;
  by?: (item: T, index: number) => string | number | symbol;
  fallback?: SinwanNode;
  children?: (item: T, index: () => number) => SinwanNode;
}

export function For<T>(props: ForProps<T>): SinwanElement {
  return {
    tag: FOR_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isForElement(element: SinwanElement): boolean {
  return element.tag === FOR_TYPE;
}

export interface IndexProps<T> {
  each: Reactive<readonly T[]>;
  fallback?: SinwanNode;
  children?: (item: () => T, index: number) => SinwanNode;
}

export function Index<T>(props: IndexProps<T>): SinwanElement {
  return {
    tag: INDEX_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isIndexElement(element: SinwanElement): boolean {
  return element.tag === INDEX_TYPE;
}

export interface MatchProps<T> {
  when: Reactive<T | false | null | undefined>;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

export function Match<T>(props: MatchProps<T>): SinwanElement {
  return {
    tag: MATCH_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isMatchElement(element: SinwanElement): boolean {
  return element.tag === MATCH_TYPE;
}

export interface SwitchProps<T = unknown> {
  when?: Reactive<T | false | null | undefined>;
  fallback?: SinwanNode;
  children?: SinwanNode | SinwanNode[];
}

export function Switch<T>(props: SwitchProps<T>): SinwanElement {
  return {
    tag: SWITCH_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isSwitchElement(element: SinwanElement): boolean {
  return element.tag === SWITCH_TYPE;
}

export interface KeyProps<T> {
  when: Reactive<T | null | undefined>;
  cache?: boolean;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

export function Key<T>(props: KeyProps<T>): SinwanElement {
  return {
    tag: KEY_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isKeyElement(element: SinwanElement): boolean {
  return element.tag === KEY_TYPE;
}

export type DynamicTag<P extends object = Record<string, unknown>> =
  | string
  | SinwanComponent<P>;

export type DynamicProps<P extends object = Record<string, unknown>> = P & {
  component: Reactive<DynamicTag<P> | null | undefined>;
  children?: SinwanNode;
};

export function Dynamic<P extends object = Record<string, unknown>>(
  props: DynamicProps<P>,
): SinwanElement {
  return {
    tag: DYNAMIC_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isDynamicElement(element: SinwanElement): boolean {
  return element.tag === DYNAMIC_TYPE;
}

export interface PortalProps {
  mount?: Reactive<Node | string | (() => Node | null) | null | undefined>;
  children?: SinwanNode;
}

export function Portal(props: PortalProps): SinwanElement {
  return {
    tag: PORTAL_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isPortalElement(element: SinwanElement): boolean {
  return element.tag === PORTAL_TYPE;
}

export interface ErrorBoundaryProps {
  fallback?: SinwanNode | ((error: Error, reset: () => void) => SinwanNode);
  children?: SinwanNode;
}

export function ErrorBoundary(props: ErrorBoundaryProps): SinwanElement {
  return {
    tag: ERROR_BOUNDARY_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isErrorBoundaryElement(element: SinwanElement): boolean {
  return element.tag === ERROR_BOUNDARY_TYPE;
}

export interface SuspenseProps {
  fallback: SinwanNode;
  children?: SinwanNode;
}

export function Suspense(props: SuspenseProps): SinwanElement {
  return {
    tag: SUSPENSE_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isSuspenseElement(element: SinwanElement): boolean {
  return element.tag === SUSPENSE_TYPE;
}

export type ActivityMode = "visible" | "hidden";

export interface ActivityProps {
  mode?: Reactive<ActivityMode> | ActivityMode;
  as?: string;
  children?: SinwanNode;
}

export function Activity(props: ActivityProps): SinwanElement {
  return {
    tag: ACTIVITY_TYPE,
    props: {
      mode: props.mode ?? "visible",
      as: props.as,
      children: props.children,
    },
    children: [],
  };
}

export function isActivityElement(element: SinwanElement): boolean {
  return element.tag === ACTIVITY_TYPE;
}

export interface ViewTransitionProps {
  name?: string;
  as?: string;
  children?: SinwanNode;
}

export function ViewTransition(props: ViewTransitionProps): SinwanElement {
  return {
    tag: VIEW_TRANSITION_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isViewTransitionElement(element: SinwanElement): boolean {
  return element.tag === VIEW_TRANSITION_TYPE;
}

export interface VirtualProps<T> {
  each: Reactive<readonly T[]>;
  by?: (item: T, index: number) => string | number | symbol;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  minRendered?: number;
  fallback?: SinwanNode;
  children?: (item: T, index: () => number) => SinwanNode;
}

export function Virtual<T>(props: VirtualProps<T>): SinwanElement {
  return {
    tag: VIRTUAL_TYPE,
    props: elementProps(props),
    children: [],
  };
}

export function isVirtualElement(element: SinwanElement): boolean {
  return element.tag === VIRTUAL_TYPE;
}
