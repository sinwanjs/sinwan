import type { SinwanElement } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { effect } from "../../../reactivity/effect.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../../../component/instance.ts";
import {
  getMountedDomNodes,
  removeMountedNode,
  unmountNode,
} from "../../../renderer/unmount.ts";
import {
  createHydrationReactiveBlock,
  hydrateContent,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { fireMountedForSubtree } from "../../shared/fireMountedForSubtree.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { softHideMountedTree } from "../../shared/softHideMountedTree.ts";
import { softShowMountedTree } from "../../shared/softShowMountedTree.ts";
import { resolveKeyChildren } from "./client.ts";

interface HydratedKeyCacheEntry {
  key: unknown;
  mounted: MountedNode[];
  fragment: DocumentFragment;
}

/**
 * Hydrate a `<Key>` boundary — remount by default; keep-alive when
 * `cache={true}`. Marks the initial key as shown so the first effect only
 * subscribes (see key-omitted-cache-remount).
 */
export function hydrateKey(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const key = resolve((element.props as { when?: unknown }).when);
  const owner = getCurrentInstance();

  const startAnchor = document.createComment("sinwan-b");
  const endAnchor = document.createComment("/sinwan-b");
  const parent = cursor.parent;
  const currentDOMNode = cursor.current;

  parent.insertBefore(startAnchor, currentDOMNode);

  const { block, attachDispose } = createHydrationReactiveBlock(
    startAnchor,
    endAnchor,
    [],
  );

  let initialized = false;
  let currentKey: unknown;
  let currentEntry: HydratedKeyCacheEntry | null = null;
  const cache = new Map<unknown, HydratedKeyCacheEntry>();
  const useCache = (element.props as { cache?: boolean }).cache === true;

  // Hydrate initial content for the current key
  const initialMounted = hydrateContent(
    resolveKeyChildren(element, key),
    cursor,
  );
  parent.insertBefore(endAnchor, cursor.current);
  block.children = [initialMounted];

  const entry: HydratedKeyCacheEntry = {
    key,
    mounted: [initialMounted],
    fragment: document.createDocumentFragment(),
  };
  cache.set(key, entry);
  currentEntry = entry;
  currentKey = key;
  initialized = true;

  const disposeEffect = effect(() => {
    const newKey = resolve((element.props as { when?: unknown }).when);
    if (initialized && Object.is(currentKey, newKey)) {
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

    currentKey = newKey;
    initialized = true;

    if (!useCache) {
      // React-style: always render fresh, never cache
      const content = resolveKeyChildren(element, newKey);
      const mounted = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        null,
        owner,
      );
      const nextEntry: HydratedKeyCacheEntry = {
        key: newKey,
        mounted,
        fragment: document.createDocumentFragment(),
      };
      currentEntry = nextEntry;
      block.children = nextEntry.mounted;

      for (const child of nextEntry.mounted) {
        fireMountedForSubtree(child);
      }
      if (owner) {
        queueUpdatedHooks(owner);
      }
      return;
    }

    // Look up or create cache entry for this key
    let nextEntry = cache.get(newKey);
    if (!nextEntry) {
      const content = resolveKeyChildren(element, newKey);
      const mounted = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        null,
        owner,
      );
      nextEntry = {
        key: newKey,
        mounted,
        fragment: document.createDocumentFragment(),
      };
      cache.set(newKey, nextEntry);

      // Fire mounted hooks for newly created components
      for (const child of nextEntry.mounted) {
        fireMountedForSubtree(child);
      }
    } else {
      // Reattach DOM nodes from the cached fragment
      for (const child of nextEntry.mounted) {
        for (const node of getMountedDomNodes(child)) {
          parent.insertBefore(node, block.endAnchor);
        }
      }
      // Soft-show to restore state and fire mounted hooks
      for (const child of nextEntry.mounted) {
        softShowMountedTree(child);
      }
    }

    currentEntry = nextEntry;
    block.children = nextEntry.mounted;

    if (owner) {
      queueUpdatedHooks(owner);
    }
  });

  attachDispose(() => {
    disposeEffect();
    for (const cached of cache.values()) {
      for (const child of cached.mounted) {
        unmountNode(child);
      }
    }
    cache.clear();
    currentEntry = null;
  });
  return block;
}
