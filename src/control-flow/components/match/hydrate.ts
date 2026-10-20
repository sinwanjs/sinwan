import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve } from "../../../reactivity/index.ts";
import {
  hydrateContent,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { resolveMatchChildren } from "./client.ts";

/**
 * Hydrate a standalone `<Match>` (outside `<Switch>`) and keep it reactive
 * on `when` changes. Inside `<Switch>`, Match is resolved by Switch hydrate.
 */
export function hydrateMatch(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as { when?: unknown };
  const when = resolve(props.when);
  const content: SinwanNode = when
    ? resolveMatchChildren(element, when)
    : null;
  const initialMounted = hydrateContent(content, cursor);

  return makeReactiveBlock(
    initialMounted,
    () => {
      const next = resolve(props.when);
      return next ? resolveMatchChildren(element, next) : null;
    },
    () => resolve(props.when),
  );
}
