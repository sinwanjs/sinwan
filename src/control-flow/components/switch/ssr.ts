import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolveSwitchContent } from "./resolve.ts";

/**
 * Resolve `<Switch>` content for SSR / stream.
 */
export function resolveSwitchRenderNode(element: SinwanElement): SinwanNode {
  return resolveSwitchContent(element);
}
