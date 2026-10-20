import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ErrorBoundaryProps } from "../../identity.ts";

/**
 * SSR/stream helper: render ErrorBoundary children, catching errors into fallback.
 * `reset` is the SSR no-op (or test) reset passed to functional fallbacks.
 */
export async function renderErrorBoundaryNode<T>(
  element: SinwanElement,
  reset: () => void,
  render: (node: SinwanNode) => T | Promise<T>,
): Promise<T> {
  const props = element.props as ErrorBoundaryProps;
  try {
    return await render(props.children as SinwanNode);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const fallback = props.fallback;
    const fallbackContent =
      typeof fallback === "function" ? fallback(error, reset) : fallback;
    return await render(fallbackContent as SinwanNode);
  }
}
