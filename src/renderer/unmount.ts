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
  const out: Node[] = [];
  collectDomNodes(node, out);
  return out;
}

/**
 * Single movable DOM root for common list rows (element / text / single-child
 * template fragment). Returns null for multi-root, portal, or reactive-block
 * trees so callers fall back to `getMountedDomNodes`.
 */
export function getMountedDomRoot(node: MountedNode): Node | null {
  switch (node.type) {
    case "text":
    case "reactive-text":
      return node.node;
    case "element":
      return node.node;
    case "fragment": {
      // Single element child (template row or simple fragment), no fragment anchor.
      if (
        !node.anchor &&
        node.children.length === 1 &&
        node.children[0]!.type === "element"
      ) {
        return node.children[0]!.node;
      }
      return null;
    }
    case "component":
      if (node.children.length === 1) {
        return getMountedDomRoot(node.children[0]!);
      }
      return null;
    default:
      return null;
  }
}

function collectDomNodes(node: MountedNode, out: Node[]): void {
  switch (node.type) {
    case "text":
    case "reactive-text":
      if (node.node) out.push(node.node);
      break;

    case "element":
      if (node.node) out.push(node.node);
      break;

    case "fragment":
      if (node.anchor) out.push(node.anchor);
      for (const child of node.children) collectDomNodes(child, out);
      break;

    case "reactive-block":
      if (node.startAnchor) out.push(node.startAnchor);
      for (const child of node.children) collectDomNodes(child, out);
      if (node.endAnchor) out.push(node.endAnchor);
      break;

    case "component":
      for (const child of node.children) collectDomNodes(child, out);
      break;

    case "async":
      if (node.startAnchor) out.push(node.startAnchor);
      if (node.children.length > 0) {
        for (const child of node.children) collectDomNodes(child, out);
      } else if (node.placeholder) {
        out.push(node.placeholder);
      }
      if (node.endAnchor) out.push(node.endAnchor);
      break;

    case "portal":
      if (node.anchor) out.push(node.anchor);
      break;
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
      if (node.attrDisposers) {
        for (const dispose of node.attrDisposers) {
          dispose();
        }
      }
      if (node.eventCleanups) {
        for (const cleanup of node.eventCleanups) {
          cleanup();
        }
      }
      node.refCleanup?.();
      for (const child of node.children) {
        unmountNode(child);
      }
      break;

    case "fragment":
      if (node.disposers) {
        for (const dispose of node.disposers) {
          dispose();
        }
      }
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

    case "async":
      node.disposed = true;
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
      if (node.targetAnchor && node.targetAnchor.parentNode) {
        domOps.remove(node.targetAnchor);
      }
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
