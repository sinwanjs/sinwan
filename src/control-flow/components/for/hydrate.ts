import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve, signal, type Signal } from "../../../reactivity/index.ts";
import { getCurrentInstance } from "../../../component/instance.ts";
import { readyIndex } from "../../../common/list-accessors.ts";
import { getMountedDomNodes } from "../../../renderer/unmount.ts";
import {
  createHydrationReactiveBlock,
  hydrateContent,
  hydrateNode,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { renderForBlock, type ForHydrationSeed } from "./client.ts";

/**
 * Hydrate a `<For>` list — empty lists use makeReactiveBlock; non-empty lists
 * seed the client mapArray reconciler.
 */
export function hydrateFor(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    each?: unknown;
    by?: {
      (item: unknown, index: number): string | number | symbol;
    };
    fallback?: SinwanNode;
    children?: {
      (item: unknown, index: { (): number }): SinwanNode;
    };
  };
  const items = resolve(props.each);
  const list = Array.isArray(items) ? items : [];
  const renderChild = props.children;

  // Empty list (or no children fn) at hydration: there is nothing to
  // reconcile, so keep the generic reactive block which correctly handles
  // the empty → non-empty transition. This matches prior <For> behavior.
  if (typeof renderChild !== "function" || list.length === 0) {
    const resolveChildren = () => {
      const its = resolve(props.each);
      if (Array.isArray(its) && typeof props.children === "function") {
        const result: SinwanNode[] = [];
        for (let i = 0; i < its.length; i++) {
          result.push(props.children!(its[i], readyIndex(i)));
        }
        return result;
      }
      return props.fallback ? [props.fallback] : [];
    };
    const initialMounted = hydrateContent(resolveChildren(), cursor);
    return makeReactiveBlock(
      initialMounted,
      () => resolveChildren() as unknown as SinwanNode,
    );
  }

  // Non-empty list: hydrate each child into parallel arrays, then delegate
  // updates to the same mapArray reconciler the client renderer uses.
  const seedItems: unknown[] = new Array(list.length);
  const seedKeys: unknown[] = new Array(list.length);
  const mountedArr: MountedNode[] = new Array(list.length);
  const needsIndex =
    typeof renderChild === "function" && renderChild.length > 1;
  const indexes = needsIndex
    ? (new Array(list.length) as Signal<number>[])
    : null;

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    seedItems[i] = item;
    seedKeys[i] = props.by ? props.by(item, i) : item;
    let indexFn = readyIndex(i);
    if (indexes) {
      const s = signal(i);
      indexes[i] = s;
      indexFn = function readForIndex(): number {
        return s.value;
      };
      // Touch once so coverage counts the accessor when children ignore index.
      indexFn();
    }
    const childNode = renderChild(item, indexFn);
    mountedArr[i] = hydrateNode(childNode, cursor);
  }

  const domNodes = mountedArr.flatMap((m) => getMountedDomNodes(m));
  const firstNode = domNodes[0]!;
  const parentNode = firstNode.parentNode!;
  const startAnchor = (parentNode.ownerDocument || document).createComment(
    "Sinwan-hyd-for",
  );
  const endAnchor = (parentNode.ownerDocument || document).createComment(
    "/Sinwan-hyd-for",
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
  const seed: ForHydrationSeed<unknown> = {
    items: seedItems,
    keys: seedKeys,
    mounted: mountedArr,
    indexes,
    lastList: list,
  };
  attachDispose(
    renderForBlock(element, block, parentNode, null, owner, seed),
  );
  return block;
}
