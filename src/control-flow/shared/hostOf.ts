/** Live DOM parent for an anchored insert (handles DocumentFragment attach). */
export function hostOf(parent: Node, anchor: Node | null): Node {
  return anchor?.parentNode ?? parent;
}
