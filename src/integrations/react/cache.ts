interface CacheEntry {
  value: unknown;
  isError: boolean;
}

interface CacheNode {
  children: Map<unknown, CacheNode>;
  entry?: CacheEntry;
}

function getEntry(node: CacheNode, args: unknown[]): CacheEntry | undefined {
  let current: CacheNode = node;
  for (const arg of args) {
    const next = current.children.get(arg);
    if (!next) return undefined;
    current = next;
  }
  return current.entry;
}

function setEntry(node: CacheNode, args: unknown[], entry: CacheEntry): void {
  let current: CacheNode = node;
  for (const arg of args) {
    let next = current.children.get(arg);
    if (!next) {
      next = { children: new Map() };
      current.children.set(arg, next);
    }
    current = next;
  }
  current.entry = entry;
}

/**
 * React-compatible `cache(fn)` — `[SHARED]`.
 *
 * Returns a memoized version of `fn` with the same type signature.
 * Each call to `cache(fn)` creates a **new** memoized function that does
 * not share a cache with any other call.
 *
 * The cache is keyed by arguments using `Object.is` equality (implemented
 * via a trie of `Map`s).  Cached errors are re-thrown on subsequent hits.
 *
 * SSR: safe.  In Sinwan the cache persists for the lifetime of the current
 * JS realm (there is no per-request invalidation because Sinwan does not
 * enforce a Server-Component request boundary).  Define memoized
 * functions at module scope and import them across components to maximise
 * cache hits.
 *
 * @example
 * ```ts
 * import { cache } from "sinwan/react-server";
 *
 * const getUser = cache(async (id: string) => fetchUser(id));
 * ```
 */
export function cache<F extends (...args: any[]) => any>(fn: F): F {
  const root: CacheNode = { children: new Map() };

  return function (
    this: ThisParameterType<F>,
    ...args: Parameters<F>
  ): ReturnType<F> {
    const entry = getEntry(root, args);

    if (entry) {
      if (entry.isError) throw entry.value;
      return entry.value as ReturnType<F>;
    }

    try {
      const result = fn.apply(this, args);
      setEntry(root, args, { value: result, isError: false });
      return result;
    } catch (error) {
      setEntry(root, args, { value: error, isError: true });
      throw error;
    }
  } as unknown as F;
}
