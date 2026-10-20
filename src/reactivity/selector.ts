/**
 * createSelector — Solid-compatible keyed predicate.
 *
 * Returns `(key) => boolean` that is true only for the currently selected
 * key. Subscribers for a key re-run only when that key's selected state
 * flips (typically 2 effects on select-one), not when any selection changes.
 */

import {
  type Dep,
  effect,
  getActiveEffect,
  track,
  trigger,
} from "./effect.ts";

export function createSelector<T>(
  source: () => T,
  equals: (key: T, selected: T) => boolean = Object.is,
): (key: T) => boolean {
  const deps = new Map<T, Dep>();
  let current!: T;
  let initialized = false;

  effect(() => {
    const next = source();
    if (initialized) {
      const prev = current;
      if (!Object.is(prev, next)) {
        for (const [key, dep] of deps) {
          if (equals(key, prev) !== equals(key, next)) {
            trigger(dep);
          }
        }
      }
    }
    current = next;
    initialized = true;
  });

  return (key: T): boolean => {
    const selected = equals(key, current);
    if (!getActiveEffect()) return selected;
    let dep = deps.get(key);
    if (!dep) {
      dep = {
        subscribers: [],
        onEmpty: () => {
          deps.delete(key);
        },
      };
      deps.set(key, dep);
    }
    track(dep);
    return selected;
  };
}
