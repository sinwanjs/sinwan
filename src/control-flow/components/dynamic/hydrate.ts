import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve } from "../../../reactivity/index.ts";
import {
  hydrateContent,
  hydrateElement,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { createDynamicElement } from "./client.ts";

/**
 * Hydrate a `<Dynamic>` boundary and keep it reactive on `component` changes.
 */
export function hydrateDynamic(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const tag = resolve((element.props as { component?: unknown }).component);
  const dynamic = createDynamicElement(element, tag);
  const initialMounted = dynamic
    ? hydrateElement(dynamic, cursor)
    : hydrateContent(null, cursor);

  return makeReactiveBlock(
    initialMounted,
    () => {
      const newTag = resolve(
        (element.props as { component?: unknown }).component,
      );
      return createDynamicElement(element, newTag) as SinwanNode | null;
    },
    () => resolve((element.props as { component?: unknown }).component),
  );
}
