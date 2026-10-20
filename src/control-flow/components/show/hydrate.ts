import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve } from "../../../reactivity/index.ts";
import {
  hydrateContent,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { resolveShowChildren } from "./client.ts";

/**
 * Hydrate a `<Show>` boundary and keep it reactive on `when` changes.
 */
export function hydrateShow(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
  };
  const when = resolve(props.when);
  const content = when
    ? resolveShowChildren(element, when)
    : props.fallback;
  const initialMounted = hydrateContent(content, cursor);

  return makeReactiveBlock(
    initialMounted,
    () => {
      const newWhen = resolve(props.when);
      return newWhen
        ? resolveShowChildren(element, newWhen)
        : props.fallback;
    },
    () => resolve(props.when),
  );
}
