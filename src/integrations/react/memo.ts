import type {
  ComponentType,
  MemoExoticComponent,
  React_ComponentProps,
} from "./_types/core.ts";
import { REACT_MEMO_TYPE } from "./_internal/symbols.ts";
import { getCurrentInstance } from "../../component/instance.ts";

const MEMO_CACHE_KEY = Symbol.for("sinwan.react.memo_cache");

interface MemoCache<P, R> {
  lastProps: P | undefined;
  lastResult: R;
}

/**
 * React-compatible `memo` — `[SHARED]`.
 *
 * SSR: safe.
 * Reactivity: bridge — wraps the inner component so its element output is
 * cached against the previous props. Sinwan signals already minimise
 * re-renders; `memo` is mainly a compatibility shim for code authored
 * against React's `React.memo`.
 *
 * @example
 * ```tsx
 * import { memo } from "sinwan/react-client";
 *
 * const Heavy = memo(({ value }: { value: number }) => <div>{value}</div>);
 * ```
 */
export function memo<C extends ComponentType<any>>(
  Component: C,
  propsAreEqual?: (
    prev: React_ComponentProps<C>,
    next: React_ComponentProps<C>,
  ) => boolean,
): MemoExoticComponent<C> {
  const eq = propsAreEqual ?? shallowEqual;
  const wrapped = Component as unknown as (p: any) => unknown;

  // Fallback cache for calls made outside a component instance (e.g. tests)
  let fallbackCache: MemoCache<any, any> | undefined;

  const Memoized = ((props: React_ComponentProps<C>) => {
    const instance = getCurrentInstance();

    if (instance) {
      const cache = ((instance as any)[MEMO_CACHE_KEY] ??= {}) as MemoCache<
        any,
        any
      >;
      if (cache.lastProps !== undefined && eq(cache.lastProps, props)) {
        return cache.lastResult;
      }
      cache.lastProps = props;
      cache.lastResult = wrapped(props);
      return cache.lastResult;
    }

    // No instance — use fallback closure cache
    if (
      fallbackCache &&
      fallbackCache.lastProps !== undefined &&
      eq(fallbackCache.lastProps, props)
    ) {
      return fallbackCache.lastResult;
    }
    const result = wrapped(props);
    fallbackCache = { lastProps: props, lastResult: result };
    return result;
  }) as unknown as MemoExoticComponent<C>;

  (Memoized as any).$$typeof = REACT_MEMO_TYPE;
  (Memoized as any).type = Component;
  (Memoized as any).displayName =
    (Component as any).displayName || (Component as any).name || "Memo";

  return Memoized;
}

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  ) {
    return false;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}
