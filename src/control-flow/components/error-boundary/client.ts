import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type { MountedReactiveBlock } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { signal, type CleanupFn } from "../../../reactivity/index.ts";
import { ERROR_BOUNDARY_TYPE } from "../../const.ts";
import { ErrorBoundary as ErrorBoundaryFactory } from "../../identity.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { errorBoundaryStack } from "./stack.ts";

export { errorBoundaryStack, hasActiveErrorBoundary } from "./stack.ts";
export {
  isErrorBoundaryElement,
  type ErrorBoundaryProps,
} from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const ErrorBoundary: typeof ErrorBoundaryFactory = ErrorBoundaryFactory;

function hostOf(parent: Node, anchor: Node | null): Node {
  return anchor?.parentNode ?? parent;
}

/**
 * Client render path for `<ErrorBoundary>`.
 */
export function renderErrorBoundaryBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  type ErrorFallback = {
    (error: Error, reset: CleanupFn): SinwanNode;
  };
  const props = element.props as {
    fallback?: SinwanNode | ErrorFallback;
    children?: SinwanNode;
  };

  const resetSignal = signal(0);
  let error: Error | null = null;
  let initialized = false;

  const disposeEffect = effect(() => {
    void resetSignal.value; // track for re-renders

    clearChildren(block);

    errorBoundaryStack.push(block);
    try {
      const content = props.children;
      block.children = renderBlockContent(
        content,
        hostOf(parent, block.endAnchor),
        block.endAnchor,
        namespace,
        owner,
      );
      error = null;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));

      const fallback = props.fallback;
      const fallbackContent: SinwanNode =
        typeof fallback === "function"
          ? (fallback as ErrorFallback)(error, function resetBoundary() {
              error = null;
              resetSignal.value = resetSignal.value + 1;
            })
          : fallback;

      block.children = renderBlockContent(
        fallbackContent,
        hostOf(parent, block.endAnchor),
        block.endAnchor,
        namespace,
        owner,
      );
    } finally {
      errorBoundaryStack.pop();
    }

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });

  return () => {
    error = null;
    disposeEffect();
  };
}

registerControlFlowBlock(
  ERROR_BOUNDARY_TYPE,
  renderErrorBoundaryBlock,
  ErrorBoundary,
);
