import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve } from "../../../reactivity/index.ts";
import { queueUpdatedHooks } from "../../../component/instance.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import {
  getMountedDomNodes,
  removeMountedNode,
  unmountNode,
} from "../../../renderer/unmount.ts";
import { KEY_TYPE } from "../../const.ts";
import { Key as KeyFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { fireMountedForSubtree } from "../../shared/fireMountedForSubtree.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { softHideMountedTree } from "../../shared/softHideMountedTree.ts";
import { softShowMountedTree } from "../../shared/softShowMountedTree.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";
import { resolveKeyChildren } from "./resolve.ts";

export { isKeyElement, type KeyProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Key: typeof KeyFactory = KeyFactory;
export { resolveKeyChildren } from "./resolve.ts";

interface KeyCacheEntry {
  key: unknown;
  mounted: MountedNode[];
  fragment: DocumentFragment;
}

/**
 * Client render path for `<Key>` (remount by default; keep-alive when
 * `cache={true}`).
 */
export function renderKeyBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let currentKey: unknown;
  let currentEntry: KeyCacheEntry | null = null;
  // Map only when cache={true} (keep-alive). Default remount path allocates none.
  let cache: Map<unknown, KeyCacheEntry> | null = null;
  const useCache = (element.props as { cache?: boolean }).cache === true;

  const disposeEffect = effect(() => {
    const key = resolve((element.props as { when?: unknown }).when);
    if (initialized && Object.is(currentKey, key)) {
      return;
    }

    // When cache=false, fully unmount old content (React-style key behavior)
    if (!useCache && currentEntry) {
      for (const child of currentEntry.mounted) {
        removeMountedNode(child);
      }
      currentEntry = null;
    }

    // Soft-hide and detach current entry (keep-alive path)
    if (useCache && currentEntry) {
      for (const child of currentEntry.mounted) {
        softHideMountedTree(child);
      }
      for (const child of currentEntry.mounted) {
        for (const node of getMountedDomNodes(child)) {
          currentEntry.fragment.appendChild(node);
        }
      }
    }

    currentKey = key;
    initialized = true;

    if (!useCache) {
      const content = withOptionalInstance(owner, () =>
        resolveKeyChildren(element, key),
      );
      const mountedChildren = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
      currentEntry = {
        key,
        mounted: mountedChildren,
        fragment: domOps.createDocumentFragment(),
      };
      block.children = mountedChildren;

      for (const child of mountedChildren) {
        fireMountedForSubtree(child);
      }
      if (owner) {
        queueUpdatedHooks(owner);
      }
      return;
    }

    if (!cache) {
      cache = new Map();
    }

    let entry = cache.get(key);
    if (!entry) {
      const content = withOptionalInstance(owner, () =>
        resolveKeyChildren(element, key),
      );
      const mountedChildren = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
      entry = {
        key,
        mounted: mountedChildren,
        fragment: domOps.createDocumentFragment(),
      };
      cache.set(key, entry);

      for (const child of entry.mounted) {
        fireMountedForSubtree(child);
      }
    } else {
      for (const child of entry.mounted) {
        for (const node of getMountedDomNodes(child)) {
          hostOf(parent, block.endAnchor).insertBefore(node, block.endAnchor);
        }
      }
      for (const child of entry.mounted) {
        softShowMountedTree(child);
      }
    }

    currentEntry = entry;
    block.children = entry.mounted;

    if (owner) {
      queueUpdatedHooks(owner);
    }
  });

  return () => {
    disposeEffect();
    if (cache) {
      for (const entry of cache.values()) {
        for (const child of entry.mounted) {
          unmountNode(child);
        }
      }
      cache.clear();
    } else if (currentEntry) {
      for (const child of currentEntry.mounted) {
        unmountNode(child);
      }
    }
    currentEntry = null;
  };
}

registerControlFlowBlock(
  KEY_TYPE,
  renderKeyBlock,
  Key,
);
