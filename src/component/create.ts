/**
 * SinwanJS View Module — Component Factories
 *
 * cc factory for defining typed components with full TypeScript inference.
 */

import type { SinwanComponent, SinwanNode, SinwanSlots } from "../types.ts";

/**
 * Create a typed Sinwan component.
 *
 * Mirrors React.FC<P> exactly - single props object with children injected.
 * Children can be a single SinwanNode or a SinwanSlots object for named slots.
 *
 * @example
 * interface CardProps {
 *   title: string;
 * }
 * const Card = cc<CardProps>(({ title, children }) => (
 *   <div class="card">
 *     <h2>{title}</h2>
 *     <div class="content">{children}</div>
 *   </div>
 * ));
 */
export function cc<P extends object = {}, R = SinwanNode>(
  fn: (props: P & { children?: SinwanNode | SinwanSlots }) => R,
): SinwanComponent<P> {
  const component: SinwanComponent<P> = (props) => fn(props) as any;
  component._SinwanComponent = true;
  component._displayName = fn.name || "AnonymousComponent";
  return component;
}
