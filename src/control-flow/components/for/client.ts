import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve, signal, type Signal } from "../../../reactivity/index.ts";
import {
  queueUpdatedHooks,
  setCurrentInstance,
} from "../../../component/instance.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import {
  getMountedDomNodes,
  getMountedDomRoot,
  removeMountedNode,
} from "../../../renderer/unmount.ts";
import { FOR_TYPE } from "../../const.ts";
import { For as ForFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { clearChildren } from "../../shared/clearChildren.ts";
import { clearMountedBetweenAnchors } from "../../shared/clearMountedBetweenAnchors.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { hostOf } from "../../shared/hostOf.ts";
import { insertNode } from "../../shared/insertNode.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { containsPortal, syncPortalOrder } from "./portal-sync.ts";

export { isForElement, type ForProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const For: typeof ForFactory = ForFactory;

/** Shared no-op used for dispose stubs (Solid mapArray). */
function noop(): void {}
noop();
/** Index stub when the For child does not read index — same fn as noop. */
type IndexFn = { (): number };
const noopIndex = noop as unknown as IndexFn;

/**
 * Seed state for hydrating a `<For>` block. Parallel arrays match the client
 * reconciler (Solid mapArray shape) so the first effect run can skip recreate.
 */
export interface ForHydrationSeed<T> {
  items: T[];
  keys: unknown[];
  mounted: MountedNode[];
  indexes: Signal<number>[] | null;
  lastList: readonly T[];
}

/** @deprecated Kept for `<Virtual>` row bookkeeping; `<For>` no longer uses this. */
export interface ForRecord<T> {
  key: unknown;
  item: T;
  index: number;
  mounted: MountedNode;
}


export function renderForBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
  seed?: ForHydrationSeed<T>,
): () => void {
  let initialized = seed != null;
  // Solid mapArray parallel arrays — no ForRecord, no persistent key Map.
  let items: T[] = seed ? seed.items : [];
  let keys: unknown[] = seed ? seed.keys : [];
  let mounted: MountedNode[] = seed ? seed.mounted : [];
  let indexes: Signal<number>[] | null = seed ? seed.indexes : null;
  let len = items.length;
  let skipFirstRun = seed != null;
  // Sticky: once a row with a Portal is mounted, keep syncing portal order
  // after reconciles. Avoid O(n) containsPortal scans on portal-free lists
  // (js-framework-benchmark). Cleared only when the list is emptied.
  let listHasPortal = false;
  const notePortals = (rows: MountedNode[]): void => {
    if (listHasPortal) return;
    for (let i = 0; i < rows.length; i++) {
      if (containsPortal(rows[i]!)) {
        listHasPortal = true;
        return;
      }
    }
  };
  if (seed) {
    for (let i = 0; i < mounted.length; i++) {
      if (containsPortal(mounted[i]!)) {
        listHasPortal = true;
        break;
      }
    }
  }

  if (seed) {
    block.children = mounted;
  }

  return effect(() => {
    const host = hostOf(parent, block.endAnchor);
    const props = element.props as {
      each?: unknown;
      by?: {
        (item: T, index: number): string | number | symbol;
      };
      fallback?: SinwanNode;
      children?: {
        (item: T, index: { (): number }): SinwanNode;
      };
    };
    const listRaw = resolve(props.each) as readonly T[] | null | undefined;
    const list = Array.isArray(listRaw) ? listRaw : [];
    const renderChild = props.children;
    const needsIndex =
      typeof renderChild === "function" && renderChild.length > 1;
    const keyOf = (item: T, i: number): unknown =>
      props.by ? props.by(item, i) : item;

    if (skipFirstRun) {
      skipFirstRun = false;
      return;
    }

    if (typeof renderChild !== "function") {
      if (len > 0) {
        clearMountedBetweenAnchors(block, mounted);
      }
      items = [];
      keys = [];
      mounted = [];
      indexes = null;
      len = 0;
      listHasPortal = false;
      block.children = [];
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
      return;
    }

    const newLen = list.length;

    if (newLen === 0) {
      if (len > 0) {
        clearMountedBetweenAnchors(block, mounted);
        items = [];
        keys = [];
        mounted = [];
        indexes = needsIndex ? [] : null;
        len = 0;
        listHasPortal = false;
        block.children = [];
      }
      // Stay empty: do not remount fallback on every effect re-run (e.g. filter
      // keystrokes while the row model is already []). That stacked duplicates.
      if (block.children.length === 0) {
        block.children = renderBlockContent(
          props.fallback,
          host,
          block.endAnchor,
          namespace,
          owner,
        );
      }
      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    if (len === 0 && block.children.length > 0) {
      clearChildren(block);
    }

    // ── Solid mapArray: empty → N create ──────────────────────────
    if (len === 0) {
      const fragment = domOps.createDocumentFragment();
      items = new Array(newLen);
      keys = new Array(newLen);
      mounted = new Array(newLen);
      indexes = needsIndex ? new Array(newLen) : null;

      const prevInstance = owner ? setCurrentInstance(owner) : null;
      try {
        for (let j = 0; j < newLen; j++) {
          const item = list[j]!;
          items[j] = item;
          keys[j] = keyOf(item, j);
          let indexFn = noopIndex;
          if (indexes) {
            const s = signal(j);
            indexes[j] = s;
            indexFn = () => s.value;
          }
          mounted[j] = renderNodeToDOM(
            renderChild(item, indexFn),
            fragment,
            null,
            namespace,
          );
          if (!listHasPortal && containsPortal(mounted[j]!)) {
            listHasPortal = true;
          }
        }
      } finally {
        if (owner) setCurrentInstance(prevInstance);
      }

      insertNode(host, fragment, block.endAnchor);
      len = newLen;
      block.children = mounted;
      notePortals(mounted);
      if (listHasPortal) {
        for (let i = 0; i < newLen; i++) {
          syncPortalOrder(mounted[i]!);
        }
      }
      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    // ── Solid mapArray: prefix / suffix / temp Map mid-reconcile ──
    const temp: (MountedNode | undefined)[] = new Array(newLen);
    const tempIndexes: (Signal<number> | undefined)[] | null = indexes
      ? new Array(newLen)
      : null;
    const newKeys: unknown[] = new Array(newLen);
    for (let j = 0; j < newLen; j++) {
      newKeys[j] = keyOf(list[j]!, j);
    }

    let start = 0;
    let end = Math.min(len, newLen);
    // Common prefix — same key and same item reference (remount when data object changes).
    for (; start < end; start++) {
      if (keys[start] !== newKeys[start] || items[start] !== list[start]) {
        break;
      }
      temp[start] = mounted[start];
      if (tempIndexes) tempIndexes[start] = indexes![start];
    }

    // ── Append-only: all prior rows kept; only new keys at the end ──
    if (start === len && newLen > len) {
      const nextMounted: MountedNode[] = new Array(newLen);
      const nextItems: T[] = new Array(newLen);
      const nextIndexes: Signal<number>[] | null = needsIndex
        ? new Array(newLen)
        : null;
      for (let j = 0; j < start; j++) {
        nextItems[j] = list[j]!;
        nextMounted[j] = mounted[j]!;
        if (nextIndexes) {
          const s = indexes![j]!;
          s.value = j;
          nextIndexes[j] = s;
        }
      }

      const fragment = domOps.createDocumentFragment();
      const prevInstance = owner ? setCurrentInstance(owner) : null;
      try {
        for (let j = start; j < newLen; j++) {
          const item = list[j]!;
          nextItems[j] = item;
          let indexFn = noopIndex;
          if (nextIndexes) {
            const s = signal(j);
            nextIndexes[j] = s;
            indexFn = () => s.value;
          }
          nextMounted[j] = renderNodeToDOM(
            renderChild(item, indexFn),
            fragment,
            null,
            namespace,
          );
          if (!listHasPortal && containsPortal(nextMounted[j]!)) {
            listHasPortal = true;
          }
        }
      } finally {
        if (owner) setCurrentInstance(prevInstance);
      }
      insertNode(host, fragment, block.endAnchor);

      items = nextItems;
      keys = newKeys;
      mounted = nextMounted;
      indexes = nextIndexes;
      len = newLen;
      block.children = mounted;

      notePortals(mounted);
      if (listHasPortal) {
        for (let i = 0; i < newLen; i++) {
          syncPortalOrder(mounted[i]!);
        }
      }

      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    let newEnd = newLen - 1;
    end = len - 1;
    for (; end >= start && newEnd >= start; end--, newEnd--) {
      if (keys[end] !== newKeys[newEnd] || items[end] !== list[newEnd]) {
        break;
      }
      temp[newEnd] = mounted[end];
      if (tempIndexes) tempIndexes[newEnd] = indexes![end];
    }

    // Temporary Map only for the unsettled middle (Solid newIndices).
    const newIndices = new Map<unknown, number>();
    const newIndicesNext: number[] = new Array(newEnd + 1);
    for (let j = newEnd; j >= start; j--) {
      const key = newKeys[j]!;
      const prev = newIndices.get(key);
      newIndicesNext[j] = prev === undefined ? -1 : prev;
      newIndices.set(key, j);
    }

    for (let i = start; i <= end; i++) {
      const key = keys[i]!;
      let j = newIndices.get(key);
      if (j !== undefined && j !== -1 && items[i] === list[j]) {
        temp[j] = mounted[i]!;
        if (tempIndexes) tempIndexes[j] = indexes![i]!;
        j = newIndicesNext[j]!;
        newIndices.set(key, j);
      } else {
        removeMountedNode(mounted[i]!);
        if (j !== undefined && j !== -1) {
          // Key matched but item identity changed — consume the slot so a
          // fresh row is created below; advance duplicate-key chain.
          j = newIndicesNext[j]!;
          newIndices.set(key, j);
        }
      }
    }

    const nextMounted: MountedNode[] = new Array(newLen);
    const nextItems: T[] = new Array(newLen);
    const nextIndexes: Signal<number>[] | null = needsIndex
      ? new Array(newLen)
      : null;

    const prevInstance = owner ? setCurrentInstance(owner) : null;
    // New rows stay off the live host until reconcile. Inserting them before
    // `endAnchor` first makes `after` point at the new tail, and the append
    // branch then inserts the rest of that tail backwards.
    let staging: DocumentFragment | null = null;
    try {
      for (let j = start; j < newLen; j++) {
        const item = list[j]!;
        nextItems[j] = item;
        if (j in temp && temp[j] !== undefined) {
          nextMounted[j] = temp[j]!;
          if (nextIndexes) {
            const s = tempIndexes![j]!;
            s.value = j;
            nextIndexes[j] = s;
          }
        } else {
          let indexFn = noopIndex;
          if (nextIndexes) {
            const s = signal(j);
            nextIndexes[j] = s;
            indexFn = () => s.value;
          }
          if (!staging) staging = domOps.createDocumentFragment();
          nextMounted[j] = renderNodeToDOM(
            renderChild(item, indexFn),
            staging,
            null,
            namespace,
          );
          if (!listHasPortal && containsPortal(nextMounted[j]!)) {
            listHasPortal = true;
          }
        }
      }
    } finally {
      if (owner) setCurrentInstance(prevInstance);
    }

    // Copy preserved prefix into next arrays.
    for (let j = 0; j < start; j++) {
      nextItems[j] = list[j]!;
      nextMounted[j] = temp[j]!;
      if (nextIndexes) {
        const s = tempIndexes![j]!;
        s.value = j;
        nextIndexes[j] = s;
      }
    }

    // Move DOM into final order. Single-root rows use Solid reconcileArrays
    // (2-node swap fast path). Multi-root / missing roots fall back to the
    // right-to-left placer.
    placeForMountedInOrder(host, mounted, nextMounted, block.endAnchor);

    items = nextItems;
    keys = newKeys;
    mounted = nextMounted;
    indexes = nextIndexes;
    len = newLen;
    block.children = mounted;

    notePortals(mounted);
    if (listHasPortal) {
      // Walk new order so target DOM matches list order.
      for (let i = 0; i < newLen; i++) {
        syncPortalOrder(mounted[i]!);
      }
    }

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}


/**
 * Place For row DOM into `nextMounted` order.
 * When every row has a single DOM root, use Solid-style reconcileArrays so
 * swaps/rotates are O(1) DOM moves instead of O(span) insertBefore.
 */
function placeForMountedInOrder(
  host: Node,
  prevMounted: MountedNode[],
  nextMounted: MountedNode[],
  endAnchor: Node,
): void {
  const b: Node[] = new Array(nextMounted.length);
  for (let i = 0; i < nextMounted.length; i++) {
    const root = getMountedDomRoot(nextMounted[i]!);
    if (!root) {
      placeForMountedRightToLeft(host, nextMounted, endAnchor);
      return;
    }
    b[i] = root;
  }

  const a: Node[] = [];
  for (let i = 0; i < prevMounted.length; i++) {
    const root = getMountedDomRoot(prevMounted[i]!);
    if (root && root.parentNode === host) a.push(root);
  }

  reconcileDomArrays(host, a, b, endAnchor);
}

/** Solid reconcileArrays adapted for For rows ending at `endAnchor`. */
function reconcileDomArrays(
  parentNode: Node,
  a: Node[],
  b: Node[],
  endAnchor: Node,
): void {
  let bLength = b.length;
  let aEnd = a.length;
  let bEnd = bLength;
  let aStart = 0;
  let bStart = 0;
  let after: Node | null =
    aEnd > 0 ? a[aEnd - 1]!.nextSibling : endAnchor;
  let map: Map<Node, number> | null = null;

  while (aStart < aEnd || bStart < bEnd) {
    if (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    while (
      aStart < aEnd &&
      bStart < bEnd &&
      a[aEnd - 1] === b[bEnd - 1]
    ) {
      aEnd--;
      bEnd--;
    }
    if (aEnd === aStart) {
      const node =
        bEnd < bLength
          ? bStart
            ? b[bStart - 1]!.nextSibling
            : b[bEnd]!
          : after;
      while (bStart < bEnd) {
        domOps.insertBefore(parentNode, b[bStart++]!, node);
      }
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart]!)) {
          domOps.remove(a[aStart]!);
        }
        aStart++;
      }
    } else if (
      a[aStart] === b[bEnd - 1] &&
      b[bStart] === a[aEnd - 1]
    ) {
      // Two-node swap (bench Swap rows indices 1↔998).
      const node = a[--aEnd]!.nextSibling;
      domOps.insertBefore(
        parentNode,
        b[bStart++]!,
        a[aStart++]!.nextSibling,
      );
      domOps.insertBefore(parentNode, b[--bEnd]!, node);
      a[aEnd] = b[bEnd]!;
    } else {
      if (!map) {
        map = new Map();
        let i = bStart;
        while (i < bEnd) {
          map.set(b[i]!, i++);
        }
      }
      const index = map.get(a[aStart]!);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart;
          let sequence = 1;
          let t: number | undefined;
          while (++i < aEnd && i < bEnd) {
            t = map.get(a[i]!);
            if (t == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart]!;
            while (bStart < index) {
              domOps.insertBefore(parentNode, b[bStart++]!, node);
            }
          } else {
            domOps.insertBefore(
              parentNode,
              b[bStart++]!,
              a[aStart]!.nextSibling,
            );
            domOps.remove(a[aStart++]!);
          }
        } else {
          aStart++;
        }
      } else {
        domOps.remove(a[aStart++]!);
      }
    }
  }
}

/** Test helper: exercise Solid-style DOM reconcile branches directly. */
export function __reconcileDomArraysForTests(
  parentNode: Node,
  a: Node[],
  b: Node[],
  endAnchor: Node,
): void {
  reconcileDomArrays(parentNode, a, b, endAnchor);
}

/** Fallback when a row has no single DOM root (fragments / multi-node). */
function placeForMountedRightToLeft(
  host: Node,
  nextMounted: MountedNode[],
  endAnchor: Node,
): void {
  let refNode: Node = endAnchor;
  for (let i = nextMounted.length - 1; i >= 0; i--) {
    const root = getMountedDomRoot(nextMounted[i]!);
    if (root) {
      if (root.nextSibling !== refNode) {
        domOps.insertBefore(host, root, refNode);
      }
      refNode = root;
      continue;
    }
    const nodes = getMountedDomNodes(nextMounted[i]!);
    if (nodes.length === 0) continue;
    const firstNode = nodes[0]!;
    if (
      firstNode.nextSibling === refNode ||
      nodes[nodes.length - 1]!.nextSibling === refNode
    ) {
      refNode = firstNode;
      continue;
    }
    for (let n = 0; n < nodes.length; n++) {
      domOps.insertBefore(host, nodes[n]!, refNode);
    }
    refNode = firstNode;
  }
}


registerControlFlowBlock(
  FOR_TYPE,
  renderForBlock,
  For,
);
