import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement } from "../types.ts";
import {
  Suspense as createSuspenseElement,
  type SuspenseProps as CoreSuspenseProps,
} from "../control-flow/components/suspense/client.ts";
import { REACT_SUSPENSE_TYPE } from "./_internal/symbols.ts";

export interface SuspenseProps {
  fallback: ReactNode;
  children?: ReactNode;
}

/**
 * React-compatible `<Suspense>` — `[CLIENT]` (renders on SSR too).
 *
 * Renders `fallback` while the children's promise is pending, then swaps in
 * the resolved children. Built on Sinwan's existing async-node support
 * (the renderer treats `Promise<SinwanNode>` as a first-class node).
 *
 * SSR: safe — children markup is emitted; the streaming server flushes when
 * resolved. Reactivity: bridge — uses a signal to swap fallback ↔ resolved.
 *
 * @example
 * ```tsx
 * import { Suspense, lazy } from "sinwan/react";
 *
 * const Modal = lazy(() => import("./Modal.tsx"));
 *
 * <Suspense fallback={<div>Loading…</div>}>
 *   <Modal />
 * </Suspense>
 * ```
 */
export function Suspense(props: SuspenseProps): SinwanElement {
  return createSuspenseElement(props as CoreSuspenseProps);
}
(Suspense as unknown as { $$typeof: symbol }).$$typeof = REACT_SUSPENSE_TYPE;
(Suspense as unknown as { _SinwanComponent?: true })._SinwanComponent = true;
