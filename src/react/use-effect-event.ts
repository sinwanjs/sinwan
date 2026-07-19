import { useSlot } from "./_internal/bridge.ts";

/**
 * React-compatible `useEffectEvent` — `[CLIENT]`.
 *
 * Returns a callback whose body always invokes the latest closure. Useful
 * to read fresh state inside an effect without listing it as a dependency.
 *
 * **Intentionally non-stable identity.** The returned function reference
 * changes on every render. This acts as a runtime assertion: if you
 * incorrectly include it in a dependency array, the effect will re-run on
 * every render, making the bug obvious.
 *
 * SSR: safe.
 * Reactivity: native — the body pointer is updated synchronously on every
 * render, but the function identity is intentionally unstable.
 *
 * @example
 * ```tsx
 * import { useEffectEvent, useEffect, useState } from "sinwan/react-client";
 *
 * const Logger = ({ url }: { url: string }) => {
 *   const [count, setCount] = useState(0);
 *   const onLoad = useEffectEvent(() => console.log(url, count));
 *   useEffect(() => { onLoad(); }, []);
 *   return null;
 * };
 * ```
 */

export function useEffectEvent<A extends any[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const slot = useSlot<{ latest: (...args: A) => R }>(() => ({ latest: fn }));
  slot.latest = fn;
  return ((...args: A) => slot.latest(...args)) as (...args: A) => R;
}
