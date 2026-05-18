/**
 * SinwanJS Store — createStore
 *
 * Creates a read-only reactive store proxy and a setter function
 * that supports top-level updates and path syntax.
 */

import { batch } from "../reactivity/batch.ts";
import {
  $RAW,
  wrap,
  wrapValue,
  syncStoreFromRaw,
  reconcileIntoRaw,
  isWrappable,
  type StoreNode,
} from "./_internal.ts";

// ─── Types ─────────────────────────────────────────────────

type Primitive = string | number | boolean | bigint | symbol | undefined | null;

/** Deep readonly utility that makes the store read-only at the type level. */
export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends Map<infer K, infer V>
      ? ReadonlyMap<K, DeepReadonly<V>>
      : T extends Set<infer U>
        ? ReadonlySet<DeepReadonly<U>>
        : T extends Function
          ? T
          : { readonly [K in keyof T]: DeepReadonly<T[K]> };

/** The reactive store type — read-only at the type level. */
export type Store<T> = DeepReadonly<T>;

/** Helper: value or updater function for a given property type. */
type ValueOrUpdater<V> = V | ((prev: V) => V);

/**
 * Strongly-typed setter for a reactive store.
 * Supports top-level updates and path-based updates up to 4 levels deep.
 */
export interface SetStoreFunction<T> {
  // Top-level: partial object merge or function updater
  (setter: Partial<T> | ((prev: T) => T | Partial<T>)): void;

  // 1-level path
  <K1 extends keyof T>(key1: K1, value: ValueOrUpdater<T[K1]>): void;

  // 2-level path
  <K1 extends keyof T, K2 extends keyof T[K1]>(
    key1: K1,
    key2: K2,
    value: ValueOrUpdater<T[K1][K2]>,
  ): void;

  // 3-level path
  <K1 extends keyof T, K2 extends keyof T[K1], K3 extends keyof T[K1][K2]>(
    key1: K1,
    key2: K2,
    key3: K3,
    value: ValueOrUpdater<T[K1][K2][K3]>,
  ): void;

  // 4-level path
  <
    K1 extends keyof T,
    K2 extends keyof T[K1],
    K3 extends keyof T[K1][K2],
    K4 extends keyof T[K1][K2][K3],
  >(
    key1: K1,
    key2: K2,
    key3: K3,
    key4: K4,
    value: ValueOrUpdater<T[K1][K2][K3][K4]>,
  ): void;

  // Fallback for deeper paths or dynamic keys
  (...path: [...PropertyKey[], unknown]): void;
}

// ─── Implementation ──────────────────────────────────────

/**
 * Create a reactive store and its setter.
 *
 * The store proxy is read-only — writes must go through `setStore`.
 * Property reads track at the property level (fine-grained).
 */
export function createStore<T extends object = {}>(
  store?: T | Store<T>,
  _options?: { name?: string },
): [Store<T>, SetStoreFunction<T>] {
  const raw: T = store != null ? ((store as any)[$RAW] ?? store) : ({} as T);
  const proxy = wrap(raw, false) as Store<T>;

  function setStore(...args: unknown[]): void {
    if (args.length === 1) {
      const arg = args[0];

      if (typeof arg === "function") {
        const result = (arg as (prev: T) => T | Partial<T>)(raw);
        batch(() => {
          if (isWrappable(result) && !Array.isArray(result)) {
            // Shallow merge for objects
            for (const key of Reflect.ownKeys(result)) {
              Reflect.set(raw as any, key, Reflect.get(result as any, key));
            }
          } else {
            // Replace entirely (primitive or array)
            if (Array.isArray(raw)) {
              (raw as any).length = 0;
              for (const item of result as any[]) {
                (raw as any).push(item);
              }
            } else {
              for (const key of Reflect.ownKeys(raw)) {
                delete (raw as any)[key];
              }
              for (const key of Reflect.ownKeys(result as object)) {
                (raw as any)[key] = Reflect.get(result as any, key);
              }
            }
          }
          syncStoreFromRaw(raw);
        });
      } else if (isWrappable(arg)) {
        batch(() => {
          reconcileIntoRaw(raw, arg, "id", false);
          syncStoreFromRaw(raw);
        });
      } else {
        throw new Error(
          "setStore argument must be an object or a function modifier.",
        );
      }
    } else {
      // Path-based
      const path = args.slice(0, -1);
      const value = args[args.length - 1];
      setPath(raw, path as PropertyKey[], value);
      syncStoreFromRaw(raw);
    }
  }

  return [proxy, setStore as SetStoreFunction<T>];
}

// ─── Path navigation ───────────────────────────────────────

function setPath(target: object, path: PropertyKey[], value: unknown): void {
  let current: any = target;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    let next = current[key];
    if (!isWrappable(next)) {
      // Create intermediate object if missing
      current[key] = {};
      next = current[key];
    }
    current = next;
  }

  const lastKey = path[path.length - 1];

  if (typeof value === "function") {
    const prev = current[lastKey];
    const result = (value as (prev: unknown) => unknown)(prev);
    current[lastKey] = result;
  } else {
    current[lastKey] = value;
  }
}
