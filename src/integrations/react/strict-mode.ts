import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement } from "../../types.ts";
import { REACT_STRICT_MODE_TYPE } from "./_internal/symbols.ts";

export interface StrictModeProps {
  children?: ReactNode;
}

/**
 * React-compatible `<StrictMode>` — `[CLIENT]`.
 *
 * Sinwan has no concept of intentional double-invocation; this is a passive
 * passthrough that exists for source-compatibility with React code.
 *
 * SSR: safe.
 * Reactivity: pass-through.
 *
 * @example
 * ```tsx
 * import { StrictMode } from "sinwan/react-client";
 *
 * <StrictMode><App /></StrictMode>
 * ```
 */
export function StrictMode(props: StrictModeProps): SinwanElement {
  return { tag: "", props: {}, children: [props.children as any] };
}
(StrictMode as unknown as { $$typeof: symbol }).$$typeof =
  REACT_STRICT_MODE_TYPE;
(StrictMode as unknown as { _SinwanComponent?: true })._SinwanComponent = true;
