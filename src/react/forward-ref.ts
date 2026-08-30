import type {
  ForwardRefExoticComponent,
  ForwardRefRenderFunction,
  Ref,
} from "./_types/core.ts";
import { REACT_FORWARD_REF_TYPE } from "./_internal/symbols.ts";

/**
 * React-compatible `forwardRef` — `[SHARED]`.
 *
 * Wraps a render function so it receives a `ref` as its second argument,
 * allowing parent components to access the underlying DOM element or
 * imperative handle of a child component.
 *
 * SSR: safe — the ref is passed through but never populated on the server.
 * Reactivity: the wrapped function runs inside the normal Sinwan component
 * lifecycle (instance, effects, hooks all work).
 *
 * The renderer detects the `REACT_FORWARD_REF_TYPE` symbol on the component
 * function, strips `ref` from props, and passes it as the second argument.
 *
 * @example
 * ```tsx
 * import { forwardRef, useRef } from "sinwan/react";
 *
 * const Input = forwardRef<HTMLInputElement, { label: string }>(
 *   ({ label }, ref) => (
 *     <input ref={ref} placeholder={label} />
 *   )
 * );
 *
 * // Parent:
 * const App = () => {
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   return <Input ref={inputRef} label="Name" />;
 * };
 * ```
 */
export function forwardRef<T, P = {}>(
  render: ForwardRefRenderFunction<P, T>,
): ForwardRefExoticComponent<P> {
  const ForwardRef = ((props: P & { ref?: Ref<T> }) => {
    const { ref, ...rest } = props as P & { ref?: Ref<T> };
    return render(rest as P, ref ?? null);
  }) as unknown as ForwardRefExoticComponent<P>;

  (ForwardRef as any).$$typeof = REACT_FORWARD_REF_TYPE;
  (ForwardRef as any).render = render;
  (ForwardRef as any).displayName =
    (render as any).displayName || (render as any).name || "ForwardRef";

  return ForwardRef;
}
