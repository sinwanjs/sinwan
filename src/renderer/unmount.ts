/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Unmount helpers
 *
 * Shared cleanup and DOM removal utilities used by mount(), reactive blocks,
 * and future renderer entrypoints.
 */

import type { MountedNode } from "./types.ts";
import { domOps } from "./dom-ops.ts";
import { fireUnmountedHooks } from "../component/instance.ts";

/**
 * Return the actual DOM nodes owned by a mounted tree, in document order.
 */
export function getMountedDomNodes(node: MountedNode): Node[] {
  switch (node.type) {
    case "text":
    case "reactive-text":
      return [node.node];

    case "element":
      return [node.node];

    case "fragment":
      return [
        node.anchor,
        ...node.children.flatMap((child) => getMountedDomNodes(child)),
      ];

    case "reactive-block":
      return [
        node.startAnchor,
        ...node.children.flatMap((child) => getMountedDomNodes(child)),
        node.endAnchor,
      ];

    case "component":
      return node.children.flatMap((child) => getMountedDomNodes(child));

    case "portal":
      return [node.anchor];
  }
}

/**
 * Recursively unmount a node tree — disposes effects, removes events and refs.
 */
export function unmountNode(node: MountedNode): void {
  switch (node.type) {
    case "text":
      break;

    case "reactive-text":
      node.dispose();
      break;

    case "element":
      for (const dispose of node.attrDisposers) {
        dispose();
      }
      for (const cleanup of node.eventCleanups) {
        cleanup();
      }
      node.refCleanup?.();
      for (const child of node.children) {
        unmountNode(child);
      }
      break;

    case "fragment":
      for (const child of node.children) {
        unmountNode(child);
      }
      break;

    case "reactive-block":
      node.dispose();
      for (const child of node.children) {
        unmountNode(child);
      }
      break;

    case "component":
      if (node.instance) {
        fireUnmountedHooks(node.instance);
      } else {
        for (const dispose of node.disposers) {
          dispose();
        }
      }
      for (const child of node.children) {
        unmountNode(child);
      }
      break;

    case "portal":
      node.dispose();
      for (const child of node.children) {
        removeMountedNode(child);
      }
      node.children = [];
      break;
  }
}

/**
 * Unmount a mounted tree and remove every DOM node it owns.
 */
export function removeMountedNode(node: MountedNode): void {
  const domNodes = getMountedDomNodes(node);
  unmountNode(node);
  for (const domNode of domNodes) {
    if (domNode.parentNode) {
      domOps.remove(domNode);
    }
  }
}
