import { domOps } from "../../renderer/dom-ops.ts";
import { hostOf } from "./hostOf.ts";

/** Insert `child` before `anchor`, or append when `anchor` is null. */
export function insertNode(
  parent: Node,
  child: Node,
  anchor: Node | null,
): void {
  if (anchor) {
    domOps.insertBefore(hostOf(parent, anchor), child, anchor);
  } else {
    domOps.appendChild(parent, child);
  }
}
