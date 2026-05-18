import { getCurrentInstance } from "../../component/instance.ts";

const USE_ID_COUNTER = Symbol.for("sinwan.react.useIdCounter");

function generateId(prefix: string, uid: number, counter: number): string {
  return `${prefix}:s${uid.toString(36)}-${counter}:`;
}

/**
 * React-compatible `useId` — `[CLIENT]`.
 *
 * Generates a unique, stable ID string for each `useId()` call within a
 * component instance. Multiple calls in the same component return distinct
 * IDs. IDs are deterministic on both client and server so hydration
 * matches.
 *
 * @example
 * ```tsx
 * import { useId } from "sinwan/react-client";
 *
 * const Field = () => {
 *   const id = useId();
 *   return <><label htmlFor={id}>Name</label><input id={id} /></>;
 * };
 * ```
 */
export function useId(): string {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error(
      "[sinwan/react] useId called outside of a component setup function.",
    );
  }

  const counter = ((instance as any)[USE_ID_COUNTER] as number) ?? 0;
  (instance as any)[USE_ID_COUNTER] = counter + 1;

  return generateId(instance.identifierPrefix, instance.uid, counter);
}
