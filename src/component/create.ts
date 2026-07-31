/**
 * SinwanJS View Module — Component Factories
 *
 * cc factory for defining typed components with full TypeScript inference.
 */

import type {
  SinwanComponent,
  SinwanNode,
  PropsWithAutoChildren,
} from "../types.ts";

/**
 * Create a typed Sinwan component.
 *
 * Mirrors React.FC<P> exactly - single props object with children injected.
 * Children are typed as `SinwanNode` so they can be embedded directly in JSX.
 *
 * For named slots, include `children?: SinwanSlots` in your props type:
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
 *
 * @example Named slots
 * interface LayoutProps {
 *   children?: SinwanSlots;
 * }
 * const Layout = cc<LayoutProps>(({ children }) => (
 *   <div>{children.header}{children.footer}</div>
 * ));
 */
export function cc<P extends object = {}, R extends SinwanNode = SinwanNode>(
  fn: (props: PropsWithAutoChildren<P>) => R,
): SinwanComponent<P> {
  const component: SinwanComponent<P> = (props) => fn(props);
  component._SinwanComponent = true;
  component._displayName = fn.name || "AnonymousComponent";
  return component;
}
