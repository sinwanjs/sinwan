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
 * Dependency list that only accepts state getters (functions with STATE_GETTER_MARKER).
 * This prevents the common mistake of passing called values like `count()` instead of the getter `count`.
 */
export type GetterDependencyList = readonly Getter[];
export type Getter = () => any;

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
