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

function collectDomNodes(node: MountedNode, out: Node[]): void {
  switch (node.type) {
    case "text":
    case "reactive-text":
      out.push(node.node);
      break;

    case "element":
      out.push(node.node);
      break;

    case "fragment":
      if (node.anchor) out.push(node.anchor);
      for (const child of node.children) collectDomNodes(child, out);
      break;

    case "reactive-block":
      out.push(node.startAnchor);
      for (const child of node.children) collectDomNodes(child, out);
      out.push(node.endAnchor);
      break;

    case "component":
      for (const child of node.children) collectDomNodes(child, out);
      break;

    case "async":
      out.push(node.startAnchor);
      if (node.children.length > 0) {
        for (const child of node.children) collectDomNodes(child, out);
      } else {
        out.push(node.placeholder);
      }
      out.push(node.endAnchor);
      break;

    case "portal":
      out.push(node.anchor);
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
