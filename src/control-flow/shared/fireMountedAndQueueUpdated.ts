import {
  fireMountedHooks,
  queueUpdatedHooks,
  type ComponentInstance,
} from "../../component/instance.ts";

/** Fire mounted hooks for `owner`, then queue updated hooks. */
export function fireMountedAndQueueUpdated(
  owner: ComponentInstance | null,
): void {
  if (owner) {
    fireMountedHooks(owner);
  }
  queueUpdatedHooks(owner);
}
