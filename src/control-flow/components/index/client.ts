import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve, signal, type Signal } from "../../../reactivity/index.ts";
import { queueUpdatedHooks } from "../../../component/instance.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import { INDEX_TYPE } from "../../const.ts";
import { Index as IndexFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { clearMountedBetweenAnchors } from "../../shared/clearMountedBetweenAnchors.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { insertNode } from "../../shared/insertNode.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";

export { isIndexElement, type IndexProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Index: typeof IndexFactory = IndexFactory;

/**
 * Seed state for hydrating an `<Index>` block. Parallel arrays match the
 * client indexArray reconciler so the first effect run can skip recreate.
 */
export interface IndexHydrationSeed<T> {
  items: T[];
  mounted: MountedNode[];
  signals: Signal<T>[];
}

/**
 * Client render path for `<Index>` (Solid indexArray shape).
 */
export function renderIndexBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
  seed?: IndexHydrationSeed<T>,
): () => void {
  let initialized = seed != null;
  let items: T[] = seed ? seed.items : [];
  let mounted: MountedNode[] = seed ? seed.mounted : [];
  let signals: Signal<T>[] = seed ? seed.signals : [];
  let len = items.length;
  let skipFirstRun = seed != null;

  if (seed) {
    block.children = mounted;
  }

  return effect(() => {
    const host = hostOf(parent, block.endAnchor);
    const props = element.props as {
      each?: unknown;
      fallback?: SinwanNode;
      children?: {
        (item: { (): T }, index: number): SinwanNode;
      };
    };
    const listRaw = resolve(props.each) as readonly T[] | null | undefined;
    const list = Array.isArray(listRaw) ? listRaw : [];
    const renderChild = props.children;
    const newLen = list.length;

    if (skipFirstRun) {
      skipFirstRun = false;
      return;
    }

    if (typeof renderChild !== "function") {
      if (len > 0) {
        clearMountedBetweenAnchors(block, mounted);
      }
      items = [];
      mounted = [];
      signals = [];
      len = 0;
      block.children = [];
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
      return;
    }

    if (newLen === 0) {
      if (len > 0) {
        clearMountedBetweenAnchors(block, mounted);
        items = [];
        mounted = [];
        signals = [];
        len = 0;
        block.children = [];
      }
      // Stay empty: do not remount fallback on every effect re-run.
      if (block.children.length === 0) {
        block.children = renderBlockContent(
          props.fallback,
          host,
          block.endAnchor,
          namespace,
          owner,
        );
      }
      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    if (len === 0 && block.children.length > 0) {
      clearChildren(block);
    }

    let i = 0;
    for (; i < newLen; i++) {
      if (i < len) {
        if (items[i] !== list[i]) {
          signals[i]!.value = list[i]!;
          items[i] = list[i]!;
        }
      } else {
        break;
      }
    }
    // Grow: batch new rows into a fragment (same as For append-only).
    if (i < newLen) {
      const fragment = domOps.createDocumentFragment();
      for (; i < newLen; i++) {
        const itemSignal = signal(list[i]!);
        signals[i] = itemSignal;
        items[i] = list[i]!;
        mounted[i] = withOptionalInstance(owner, () =>
          renderNodeToDOM(
            renderChild(() => itemSignal.value, i),
            fragment,
            null,
            namespace,
          ),
        );
      }
      insertNode(host, fragment, block.endAnchor);
    }
    for (; i < len; i++) {
      removeMountedNode(mounted[i]!);
    }

    len = newLen;
    items.length = newLen;
    mounted.length = newLen;
    signals.length = newLen;
    block.children = mounted;

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

registerControlFlowBlock(
  INDEX_TYPE,
  renderIndexBlock,
  Index,
);
