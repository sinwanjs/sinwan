import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { signal, type CleanupFn } from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import {
  createHydrationReactiveBlock,
  hydrateContent,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { errorBoundaryStack } from "./stack.ts";

type ErrorFallback = {
  (error: Error, reset: CleanupFn): SinwanNode;
};

/**
 * Hydrate an `<ErrorBoundary>` from existing SSR DOM.
 */
export function hydrateErrorBoundary(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    fallback?: SinwanNode | ErrorFallback;
    children?: SinwanNode;
  };
  const resetSignal = signal(0);
  let error: Error | null = null;
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("sinwan-b");
  const endAnchor = document.createComment("/sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    [],
  );

  let initialized = false;

  function resetBoundary(): void {
    error = null;
    resetSignal.value = resetSignal.value + 1;
  }

  const dispose = effect(() => {
    void resetSignal.value;

    if (initialized) {
      clearChildren(block);
      errorBoundaryStack.push(block);
      try {
        block.children = renderBlockContent(
          props.children,
          parent,
          endAnchor,
          null,
          owner,
        );
        error = null;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
        const fallback = props.fallback;
        const fallbackContent: SinwanNode =
          typeof fallback === "function"
            ? (fallback as ErrorFallback)(error, resetBoundary)
            : fallback;
        block.children = renderBlockContent(
          fallbackContent,
          parent,
          endAnchor,
          null,
          owner,
        );
      } finally {
        errorBoundaryStack.pop();
      }
      fireMountedAndQueueUpdated(owner);
      return;
    }

    errorBoundaryStack.push(block);
    try {
      const child = hydrateContent(props.children, cursor);
      block.children = [child];
      initialized = true;
      parent.insertBefore(endAnchor, cursor.current);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      parent.insertBefore(endAnchor, cursor.current);
      clearChildren(block);
      const fallback = props.fallback;
      const fallbackContent: SinwanNode =
        typeof fallback === "function"
          ? (fallback as ErrorFallback)(error, resetBoundary)
          : fallback;
      block.children = renderBlockContent(
        fallbackContent,
        parent,
        endAnchor,
        null,
        owner,
      );
      initialized = true;
    } finally {
      errorBoundaryStack.pop();
    }
  });

  attachDispose(dispose);
  return block;
}
