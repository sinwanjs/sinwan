import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { signal } from "../../../reactivity/index.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
} from "../../../renderer/suspense-boundary.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import { SUSPENSE_TYPE } from "../../const.ts";
import { Suspense as SuspenseFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { resolveFallbackDelay } from "../../shared/resolveFallbackDelay.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";

export { isSuspenseElement, type SuspenseProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Suspense: typeof SuspenseFactory = SuspenseFactory;

function noop(): void {}
noop();

/**
 * Client render path for `<Suspense>`. With `fallbackDelay`, a suspension
 * renders nothing until the delay has passed, then the fallback; children
 * that resolve first replace the empty slot directly.
 */
export function renderSuspenseBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  const retrySignal = signal(0);
  let hasContent = false;
  let contentNodes: MountedNode[] = [];
  let fallbackNode: MountedNode | null = null;
  let initialized = false;
  let disposed = false;
  const asyncComponentResults = new Map<Function, unknown>();
  const props = element.props as { fallback?: SinwanNode; fallbackDelay?: unknown };
  const delay = resolveFallbackDelay(props.fallbackDelay);
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const renderFallback = () => {
    fallbackNode = withOptionalInstance(owner, () =>
      renderNodeToDOM(props.fallback, parent, block.endAnchor, namespace),
    );
  };
  const cancelFallbackTimer = () => {
    clearTimeout(fallbackTimer);
    fallbackTimer = undefined;
  };

  const disposeEffect = effect(() => {
    void retrySignal.value; // establish dependency for re-runs

    // On the very first effect run, render fallback as placeholder
    // (not with a delay: an immediate render would flash it).
    if (!initialized) {
      if (delay === 0) renderFallback();
      block.children = fallbackNode ? [fallbackNode] : [];
      initialized = true;
    }

    // Remove old content before attempting a fresh render.
    for (const node of contentNodes) {
      removeMountedNode(node);
    }
    contentNodes = [];

    // Attempt to render children under this Suspense boundary.
    const boundary = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved: noop,
      asyncComponentResults,
    };

    // Set up promise tracking so we can retry when they resolve.
    let retryScheduled = false;
    boundary.onResolved = () => {
      if (disposed || retryScheduled) return;
      retryScheduled = true;
      queueMicrotask(() => {
        retryScheduled = false;
        if (!disposed) {
          retrySignal.value = retrySignal.value + 1;
        }
      });
    };

    pushSuspenseBoundary(boundary);

    const children = (element.props as { children?: SinwanNode }).children;
    const childArray =
      children != null ? (Array.isArray(children) ? children : [children]) : [];

    const nodes: MountedNode[] = [];

    try {
      for (const child of childArray) {
        if (child != null) {
          nodes.push(
            withOptionalInstance(owner, () =>
              renderNodeToDOM(
                child as SinwanNode,
                parent,
                block.endAnchor,
                namespace,
              ),
            ),
          );
        }
      }

      popSuspenseBoundary();
      cancelFallbackTimer();

      // Success! Remove fallback, show content.
      if (fallbackNode) {
        removeMountedNode(fallbackNode);
        fallbackNode = null;
      }

      block.children = nodes;
      contentNodes = nodes;
      hasContent = true;

      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
    } catch (err) {
      popSuspenseBoundary();

      // Remove any partially rendered children.
      for (const node of nodes) {
        removeMountedNode(node);
      }

      if (
        err &&
        typeof err === "object" &&
        typeof (err as { then?: unknown }).then === "function"
      ) {
        // A promise was thrown — show fallback.
        const promise = err as PromiseLike<unknown>;
        boundary.promises.add(promise);

        if (!fallbackNode) {
          if (delay === 0) {
            renderFallback();
          } else {
            // Started once per suspension: retries while waiting keep the timer.
            fallbackTimer ??= setTimeout(() => {
              fallbackTimer = undefined;
              if (disposed || hasContent || fallbackNode) return;
              renderFallback();
              block.children = fallbackNode ? [fallbackNode] : [];
              fireMountedAndQueueUpdated(owner);
            }, delay);
          }
          block.children = fallbackNode ? [fallbackNode] : [];
        }

        hasContent = false;
      } else {
        throw err;
      }
    }

    // Subscribe to any promises caught during rendering so we retry
    // when they actually resolve, then clear the set so we don't
    // re-subscribe to already-resolved promises on the next run.
    for (const promise of boundary.promises) {
      promise.then(() => boundary.onResolved());
    }
    boundary.promises.clear();
  });

  return () => {
    disposed = true;
    cancelFallbackTimer();
    disposeEffect();
  };
}

registerControlFlowBlock(
  SUSPENSE_TYPE,
  renderSuspenseBlock,
  Suspense,
);
