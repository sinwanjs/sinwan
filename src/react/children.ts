import type { ReactNode } from "./_types/core.ts";

/**
 * React-compatible `Children` utilities — `[SHARED]`.
 *
 * Provides helpers for inspecting and transforming the `children` prop.
 * Mirrors `React.Children` exactly: `map`, `forEach`, `count`, `only`, `toArray`.
 *
 * SSR: safe — pure data operations, no DOM access.
 * Reactivity: none — operates on the static children structure.
 *
 * @example
 * ```tsx
 * import { Children } from "sinwan/react";
 *
 * const Row = ({ children }) => (
 *   <div>
 *     {Children.map(children, (child, i) => (
 *       <span key={i}>{child}</span>
 *     ))}
 *   </div>
 * );
 * ```
 */
export interface Children {
  map<T>(
    children: ReactNode | ReactNode[],
    fn: (child: ReactNode, index: number) => T,
  ): T[] | null;
  forEach(
    children: ReactNode | ReactNode[],
    fn: (child: ReactNode, index: number) => void,
  ): void;
  count(children: ReactNode | ReactNode[]): number;
  only(children: ReactNode): ReactNode;
  toArray(children: ReactNode | ReactNode[]): ReactNode[];
}

/** Flatten nested arrays and filter out null/undefined/boolean nodes. */
function toArrayImpl(children: unknown): ReactNode[] {
  if (children == null || typeof children === "boolean") return [];
  if (Array.isArray(children)) {
    return children
      .flat(Infinity)
      .filter((c) => c != null && typeof c !== "boolean") as ReactNode[];
  }
  return [children as ReactNode];
}

export const Children: Children = {
  map<T>(
    children: ReactNode | ReactNode[],
    fn: (child: ReactNode, index: number) => T,
  ): T[] | null {
    const arr = toArrayImpl(children);
    if (arr.length === 0) return null;
    return arr.map(fn);
  },

  forEach(
    children: ReactNode | ReactNode[],
    fn: (child: ReactNode, index: number) => void,
  ): void {
    const arr = toArrayImpl(children);
    for (let i = 0; i < arr.length; i++) {
      fn(arr[i], i);
    }
  },

  count(children: ReactNode | ReactNode[]): number {
    return toArrayImpl(children).length;
  },

  only(children: ReactNode): ReactNode {
    const arr = toArrayImpl(children);
    if (arr.length !== 1) {
      throw new Error(
        "[sinwan/react] Children.only expected to receive a single child, " +
          `but received ${arr.length} children.`,
      );
    }
    return arr[0];
  },

  toArray(children: ReactNode | ReactNode[]): ReactNode[] {
    return toArrayImpl(children);
  },
};
