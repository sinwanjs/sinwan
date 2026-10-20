import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { signal } from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
} from "../../../renderer/suspense-boundary.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import {
  createHydrationReactiveBlock,
  hydrateNode,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";

/**
 * Hydrate a `<Suspense>` boundary from SSR children (or fallback on throw).
 */
export function hydrateSuspense(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    fallback: SinwanNode;
    children?: SinwanNode;
  };
  const retrySignal = signal(0);
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
  let disposed = false;
  let fallbackNode: MountedNode | null = null;
  let contentNodes: MountedNode[] = [];
  const asyncComponentResults = new Map<Function, unknown>();

  const dispose = effect(() => {
    void retrySignal.value;

    if (initialized) {
      for (const node of contentNodes) {
        removeMountedNode(node);
      }
      contentNodes = [];

      let retryScheduled = false;
      const boundary = {
        promises: new Set<PromiseLike<unknown>>(),
        onResolved() {
          if (disposed || retryScheduled) return;
          retryScheduled = true;
          queueMicrotask(() => {
            retryScheduled = false;
            if (!disposed) {
              retrySignal.value = retrySignal.value + 1;
            }
          });
        },
        asyncComponentResults,
      };

      pushSuspenseBoundary(boundary);

      const children = props.children;
      const childArray =
        children != null
          ? Array.isArray(children)
            ? children
            : [children]
          : [];
      const nodes: MountedNode[] = [];

      try {
        for (const child of childArray) {
          if (child != null) {
            nodes.push(renderNodeToDOM(child, parent, endAnchor, null));
          }
        }
        popSuspenseBoundary();
        if (fallbackNode) {
          removeMountedNode(fallbackNode);
          fallbackNode = null;
        }
        block.children = nodes;
        contentNodes = nodes;
      } catch (err) {
        popSuspenseBoundary();
        for (const node of nodes) {
          removeMountedNode(node);
        }
        if (
          err &&
          typeof err === "object" &&
          typeof (err as { then?: unknown }).then === "function"
        ) {
          boundary.promises.add(err as PromiseLike<unknown>);
          if (!fallbackNode) {
            fallbackNode = renderNodeToDOM(
              props.fallback,
              parent,
              endAnchor,
              null,
            );
          }
          block.children = fallbackNode ? [fallbackNode] : [];
        } else {
          throw err;
        }
      }

      for (const promise of boundary.promises) {
        promise.then(() => boundary.onResolved());
      }
      boundary.promises.clear();

      fireMountedAndQueueUpdated(owner);
      return;
    }

    const children = props.children;
    const childArray =
      children != null ? (Array.isArray(children) ? children : [children]) : [];
    const nodes: MountedNode[] = [];

    let retryScheduled = false;
    const boundary = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved() {
        if (disposed || retryScheduled) return;
        retryScheduled = true;
        queueMicrotask(() => {
          retryScheduled = false;
          if (!disposed) {
            retrySignal.value = retrySignal.value + 1;
          }
        });
      },
      asyncComponentResults,
    };

    pushSuspenseBoundary(boundary);

    try {
      for (const child of childArray) {
        if (child != null) {
          nodes.push(hydrateNode(child, cursor));
        }
      }
      popSuspenseBoundary();
      parent.insertBefore(endAnchor, cursor.current);
      block.children = nodes;
      contentNodes = nodes;
      initialized = true;
    } catch (err) {
      popSuspenseBoundary();
      if (
        err &&
        typeof err === "object" &&
        typeof (err as { then?: unknown }).then === "function"
      ) {
        boundary.promises.add(err as PromiseLike<unknown>);
        fallbackNode = hydrateNode(props.fallback, cursor);
        parent.insertBefore(endAnchor, cursor.current);
        block.children = fallbackNode ? [fallbackNode] : [];
        contentNodes = block.children;
        initialized = true;
      } else {
        throw err;
      }
    }

    for (const promise of boundary.promises) {
      promise.then(() => boundary.onResolved());
    }
    boundary.promises.clear();
  });

  attachDispose(() => {
    disposed = true;
    dispose();
  });
  return block;
}
