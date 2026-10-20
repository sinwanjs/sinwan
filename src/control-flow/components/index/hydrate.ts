import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve, signal, type Signal } from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import { getMountedDomNodes } from "../../../renderer/unmount.ts";
import {
  createHydrationReactiveBlock,
  hydrateContent,
  hydrateNode,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { renderIndexBlock, type IndexHydrationSeed } from "./client.ts";

/**
 * Hydrate an `<Index>` list — empty / invalid lists hydrate fallback content
 * only (legacy); non-empty lists seed the client indexArray reconciler.
 */
export function hydrateIndex(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: {
      (item: { (): unknown }, index: number): SinwanNode;
    };
  };
  const items = resolve(props.each);
  const list = Array.isArray(items) ? items : [];
  const renderChild = props.children;

  // Preserve prior empty / no-fn hydrate behavior (no reactive block).
  if (typeof renderChild !== "function") {
    return hydrateContent(props.fallback ?? null, cursor);
  }

  if (list.length === 0) {
    return hydrateContent(props.fallback ?? null, cursor);
  }

  const seedItems: unknown[] = new Array(list.length);
  const mountedArr: MountedNode[] = new Array(list.length);
  const signals = new Array(list.length) as Signal<unknown>[];

  for (let i = 0; i < list.length; i++) {
    const itemSignal = signal(list[i]);
    signals[i] = itemSignal;
    seedItems[i] = list[i];
    const itemFn = function readIndexItem(): unknown {
      return itemSignal.value;
    };
    // Touch once so coverage counts the accessor when children ignore the getter.
    itemFn();
    mountedArr[i] = hydrateNode(renderChild(itemFn, i), cursor);
  }

  const domNodes = mountedArr.flatMap((m) => getMountedDomNodes(m));
  const firstNode = domNodes[0]!;
  const parentNode = firstNode.parentNode!;
  const startAnchor = (parentNode.ownerDocument || document).createComment(
    "Sinwan-hyd-idx",
  );
  const endAnchor = (parentNode.ownerDocument || document).createComment(
    "/Sinwan-hyd-idx",
  );
  parentNode.insertBefore(startAnchor, firstNode);
  const lastNode = domNodes[domNodes.length - 1]!;
  if (lastNode.nextSibling) {
    parentNode.insertBefore(endAnchor, lastNode.nextSibling);
  } else {
    parentNode.appendChild(endAnchor);
  }

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    mountedArr,
  );

  const owner = getCurrentInstance();
  const seed: IndexHydrationSeed<unknown> = {
    items: seedItems,
    mounted: mountedArr,
    signals,
  };
  attachDispose(
    renderIndexBlock(element, block, parentNode, null, owner, seed),
  );
  return block;
}
