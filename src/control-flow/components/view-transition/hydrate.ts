import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type {
  MountedElement,
  MountedNode,
} from "../../../renderer/types.ts";
import {
  advance,
  hydrateContent,
  type HydrationCursor,
} from "../../../hydration/walk.ts";

/**
 * Hydrate a `<ViewTransition>` boundary from SSR markup.
 * With a `name`, reuses the wrapper element; without, hydrates children in place.
 */
export function hydrateViewTransition(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    name?: string;
    children?: SinwanNode;
  };
  const name = props.name;

  if (!name) {
    return hydrateContent(props.children, cursor);
  }

  const wrapper = advance(cursor) as HTMLElement;
  if (!wrapper || wrapper.nodeType !== 1) {
    return hydrateContent(props.children, cursor);
  }

  const itemCursor: HydrationCursor = {
    parent: wrapper,
    current: wrapper.firstChild,
    adapter: cursor.adapter,
  };
  const child = hydrateContent(props.children, itemCursor);

  const mounted: MountedElement = {
    type: "element",
    node: wrapper,
    children: [child],
    eventCleanups: null,
    attrDisposers: null,
    refCleanup: null,
  };

  return mounted;
}
