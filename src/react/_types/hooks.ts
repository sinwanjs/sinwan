/**
 * Hook-shaped types (React compatible).
 */

import type { ReactNode } from "./core.ts";

// ─── State / reducer ───────────────────────────────────────

export type Dispatch<A> = (value: A) => void;
export type SetStateAction<S> = S | ((prev: S) => S);
export type StateUpdater<S> = Dispatch<SetStateAction<S>>;

export type Reducer<S, A> = (state: S, action: A) => S;
export type ReducerWithoutAction<S> = (state: S) => S;
export type ReducerState<R extends Reducer<any, any>> =
  R extends Reducer<infer S, any> ? S : never;
export type ReducerAction<R extends Reducer<any, any>> =
  R extends Reducer<any, infer A> ? A : never;

// ─── Effects ───────────────────────────────────────────────

export type EffectCallback = () => void | (() => void | undefined);

/**
 * Branding key for getters created by `createStateGetter` / `useState` /
 * `useReducer` / … Same identity as `Symbol.for("sinwan.state_getter")`.
 */
export const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

/**
 * Reactive state getter returned by React-compatible hooks.
 * Call it for the value (`count()`); pass the function itself in deps /
 * JSX so Sinwan can track it.
 */
export type StateGetter<T = unknown> = (() => T) & {
  [STATE_GETTER_MARKER]: true;
};

/**
 * React-style dependency list. Prefer branded {@link StateGetter}s from
 * hooks when tracking hook state; plain values (props, primitives) are
 * also allowed for React compatibility.
 */
export type GetterDependencyList = readonly unknown[];

// ─── use() — React 19 ──────────────────────────────────────

export type Usable<T> = PromiseLike<T> | { readonly _ctx: T };

// ─── Action state (useActionState / useFormStatus) ─────────

export interface FormStatusNotPending {
  pending: false;
  data: null;
  method: null;
  action: null;
}
export interface FormStatusPending {
  pending: true;
  data: FormData;
  method: string;
  action: string | ((formData: FormData) => void | Promise<void>);
}
export type FormStatus = FormStatusNotPending | FormStatusPending;

export type ActionStateAction<S, P> = (
  state: Awaited<S>,
  payload: P,
) => S | Promise<S>;

// ─── Transition ────────────────────────────────────────────

export type TransitionFunction = () => void | Promise<void>;
export type TransitionStartFunction = (callback: TransitionFunction) => void;

// ─── Optimistic ────────────────────────────────────────────

export type OptimisticReducer<S, A> = (current: S, action: A) => S;

// ─── DebugValue ────────────────────────────────────────────

export type DebugValueFormatter<T> = (value: T) => unknown;

// ─── useTitle ──────────────────────────────────────────────

export interface UseTitleOptions {
  restoreOnUnmount?: boolean;
}

// ─── Children helpers ──────────────────────────────────────

export interface ChildrenContainer {
  children?: ReactNode;
}
