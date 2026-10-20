import type { MountedReactiveBlock } from "../../../renderer/types.ts";

/** Active ErrorBoundary blocks — used by the renderer to decide rethrow vs catch. */
export const errorBoundaryStack: MountedReactiveBlock[] = [];

export function hasActiveErrorBoundary(): boolean {
  return errorBoundaryStack.length > 0;
}
