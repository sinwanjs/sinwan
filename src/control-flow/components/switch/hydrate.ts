import type { SinwanElement } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import {
  hydrateContent,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { resolveSwitchContent } from "./client.ts";

/**
 * Hydrate a `<Switch>` boundary and keep it reactive on Match / gate changes.
 */
export function hydrateSwitch(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const content = resolveSwitchContent(element);
  const initialMounted = hydrateContent(content, cursor);
  return makeReactiveBlock(initialMounted, () => resolveSwitchContent(element));
}
