import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement, SinwanNode } from "../../types.ts";
import { Portal } from "../../component/control-flow.ts";

/**
 * React-compatible `createPortal(children, container, key?)` — `[CLIENT]`.
 *
 * Wraps Sinwan's existing `Portal` component. Returns a node that can be
 * embedded anywhere in the tree; the renderer mounts the children into
 * `container`.
 *
 * SSR: safe — Sinwan's Portal renders nothing on the server (deferred to
 * the client just like React).
 * Reactivity: pass-through to the existing implementation.
 *
 * @example
 * ```tsx
 * import { createPortal } from "sinwan/react-client";
 *
 * const Tooltip = ({ open }: { open: boolean }) =>
 *   open ? createPortal(<div class="tooltip">hi</div>, document.body) : null;
 * ```
 */
export function createPortal(
  children: ReactNode,
  container: Node,
  _key?: string | null,
): SinwanElement {
  return Portal({
    mount: container,
    children: children as SinwanNode,
  });
}
