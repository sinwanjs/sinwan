/**
 * SinwanJS Reactivity — observable
 *
 * Converts a getter function into an Observable-compatible object
 * (with `subscribe()` and `[Symbol.observable]`).
 *
 * Useful for interop with RxJS and other Observable libraries.
 *
 * @example
 * import { from } from "rxjs";
 *
 * const count = signal(0);
 * const value$ = from(observable(() => count.value));
 *
 * value$.subscribe((next) => console.log(next));
 * // logs 0 immediately, then logs again on every change
 */

import { effect } from "./effect.ts";

export interface Observer<T> {
  next?(value: T): void;
  error?(err: any): void;
  complete?(): void;
}

export interface Subscription {
  unsubscribe(): void;
}

/** Cross-environment reference to the Observable symbol. */
const SYMBOL_OBSERVABLE: symbol =
  (typeof Symbol === "function" && (Symbol as any).observable) ||
  Symbol.for("observable");

export interface Observable<T> {
  subscribe(observer: Observer<T> | ((value: T) => void)): Subscription;
  [SYMBOL_OBSERVABLE](): Observable<T>;
}

/**
 * Create an Observable-compatible object from a getter function.
 *
 * Each subscription creates an effect over the accessor and returns
 * an object with `unsubscribe()`.
 */
export function observable<T>(input: () => T): Observable<T> {
  const obj: Observable<T> = {
    subscribe(observer) {
      const handler: Observer<T> =
        typeof observer === "function" ? { next: observer } : observer;

      const dispose = effect(() => {
        const value = input();
        if (handler.next) {
          handler.next(value);
        }
      });

      return {
        unsubscribe() {
          dispose();
        },
      };
    },

    [SYMBOL_OBSERVABLE]() {
      return obj;
    },
  };

  return obj;
}
