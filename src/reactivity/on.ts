/**
 * SinwanJS Reactivity — on
 *
 * Makes dependencies explicit in a computation. Designed to be passed
 * into `effect()` or used as a computed body.
 *
 * When deps change, `fn` is called with the new and previous values.
 * The body of `fn` runs inside `untrack()` so only the declared deps
 * trigger re-execution.
 *
 * @example
 * const count = signal(0);
 * effect(on(() => count.value, (v) => console.log(v)));
 *
 * // Array deps
 * effect(on([() => a.value, () => b.value], ([a, b]) => console.log(a, b)));
 *
 * // Deferred — skips initial run, only runs on change
 * effect(on(() => count.value, (v) => console.log(v), { defer: true }));
 */

import { untrack } from "./effect.ts";

function depsAreEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Dereference an accessor type to its value type.
 */
type Deref<T> = T extends () => infer R
  ? R
  : T extends (() => infer R)[]
    ? R[]
    : never;

export function on<T extends (() => any) | Array<() => any>, U>(
  deps: T,
  fn: (input: Deref<T>, prevInput: Deref<T>, prevValue?: U) => U,
  options?: { defer?: boolean },
): (prevValue?: U) => U | undefined {
  const isArray = Array.isArray(deps);
  const depArray: Array<() => any> = isArray ? deps : [deps];

  let prevInputs: any[] = [];
  let initial = true;

  return (prevValue?: U): U | undefined => {
    const inputs = depArray.map((dep) => dep());

    if (initial) {
      initial = false;
      prevInputs = inputs;
      if (options?.defer) {
        return undefined;
      }
    } else if (depsAreEqual(inputs, prevInputs)) {
      return prevValue;
    }

    const prev = prevInputs;
    prevInputs = inputs;

    const currentInput = isArray ? inputs : inputs[0];
    const previousInput = isArray ? prev : prev[0];

    return untrack(() => fn(currentInput, previousInput, prevValue));
  };
}
