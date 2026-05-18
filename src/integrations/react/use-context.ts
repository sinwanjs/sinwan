import { readContext } from "./create-context.ts";
import type { Context } from "./_types/context.ts";

/**
 * React-compatible `useContext` — `[CLIENT]`.
 *
 * SSR: safe.
 * Reactivity: bridge — delegates to Sinwan's `inject()` via the context's
 * private key.
 *
 * @example
 * ```tsx
 * import { createContext, useContext } from "sinwan/react-client";
 *
 * const ThemeCtx = createContext("light");
 *
 * const Child = () => {
 *   const theme = useContext(ThemeCtx);
 *   return <div class={theme} />;
 * };
 * ```
 */
export function useContext<T>(context: Context<T>): T {
  return readContext(context);
}
