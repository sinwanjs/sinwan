/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Reactive control-flow blocks
 *
 * `<Show>` and `<For>` render between stable comment anchors. Updates remove,
 * move, or insert only the block-owned DOM nodes.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type {
  MountedNode,
  MountedElement,
  MountedPortal,
  MountedReactiveBlock,
} from "./types.ts";
import { domOps } from "./dom-ops.ts";
import { effect, resolve, signal, type Signal } from "../reactivity/index.ts";
import { renderElementToDOM } from "./render-element.ts";
import {
  getCurrentInstance,
  setCurrentInstance,
  fireMountedHooks,
  queueUpdatedHooks,
  withInstance,
  softHideInstance,
  softShowInstance,
  type ComponentInstance,
} from "../component/instance.ts";
import {
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isPortalElement,
  isShowElement,
  isSuspenseElement,
  isSwitchElement,
  isActivityElement,
  isViewTransitionElement,
  isErrorBoundaryElement,
  isVirtualElement,
  resolveKeyChildren,
  resolveShowChildren,
  resolveSwitchContent,
} from "../component/control-flow.ts";
import {
  getMountedDomNodes,
  removeMountedNode,
  unmountNode,
} from "./unmount.ts";
import { renderNodeToDOM } from "./render-children.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
} from "./suspense-boundary.ts";

interface ForRecord<T> {
  key: unknown;
  item: T;
  index: number;
  mounted: MountedNode;
}

interface IndexRecord<T> {
  item: Signal<T>;
  mounted: MountedNode;
}

/**
 * Render a built-in reactive helper element.
 */
export function renderControlFlowToDOM(
  element: SinwanElement,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedNode {
  if (isPortalElement(element)) {
    return renderPortal(element, parent, anchor, namespace);
  }

  const startAnchor = domOps.createComment("Sinwan-b");
  const endAnchor = domOps.createComment("/Sinwan-b");
  insertNode(parent, startAnchor, anchor);
  insertNode(parent, endAnchor, anchor);

  const owner = getCurrentInstance();
  let disposeEffect = () => {};

  const block: MountedReactiveBlock = {
    type: "reactive-block",
    dispose: () => disposeEffect(),
    children: [],
    startAnchor,
    endAnchor,
  };

  if (isShowElement(element)) {
    disposeEffect = renderShowBlock(element, block, parent, namespace, owner);
  } else if (isForElement(element)) {
    disposeEffect = renderForBlock(element, block, parent, namespace, owner);
  } else if (isSwitchElement(element)) {
    disposeEffect = renderSwitchBlock(element, block, parent, namespace, owner);
  } else if (isIndexElement(element)) {
    disposeEffect = renderIndexBlock(element, block, parent, namespace, owner);
  } else if (isKeyElement(element)) {
    disposeEffect = renderKeyBlock(element, block, parent, namespace, owner);
  } else if (isDynamicElement(element)) {
    disposeEffect = renderDynamicBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  } else if (isSuspenseElement(element)) {
    disposeEffect = renderSuspenseBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  } else if (isActivityElement(element)) {
    disposeEffect = renderActivityBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  } else if (isViewTransitionElement(element)) {
    disposeEffect = renderViewTransitionBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  } else if (isErrorBoundaryElement(element)) {
    disposeEffect = renderErrorBoundaryBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  } else if (isVirtualElement(element)) {
    disposeEffect = renderVirtualBlock(
      element,
      block,
      parent,
      namespace,
      owner,
    );
  }

  return block;
}

const errorBoundaryStack: MountedReactiveBlock[] = [];

export function hasActiveErrorBoundary(): boolean {
  return errorBoundaryStack.length > 0;
}

function renderShowBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;

  return effect(() => {
    clearChildren(block);
    const when = readReactive((element.props as any).when);
    block.children = withOptionalInstance(owner, () => {
      const content = when
        ? resolveShowChildren(element, when)
        : (element.props as any).fallback;
      return renderBlockContent(
        content,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
    });

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderErrorBoundaryBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  const props = element.props as {
    fallback?: SinwanNode | ((error: Error, reset: () => void) => SinwanNode);
    children?: SinwanNode;
  };

  const resetSignal = signal(0);
  let error: Error | null = null;
  let initialized = false;

  const disposeEffect = effect(() => {
    void resetSignal.value; // track for re-renders

    clearChildren(block);

    errorBoundaryStack.push(block);
    try {
      const content = props.children;
      block.children = renderBlockContent(
        content,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
      error = null;
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));

      const fallback = props.fallback;
      const fallbackContent: SinwanNode =
        typeof fallback === "function"
          ? (fallback as (error: Error, reset: () => void) => SinwanNode)(
              error,
              () => {
                error = null;
                resetSignal.value = resetSignal.value + 1;
              },
            )
          : fallback;

      block.children = renderBlockContent(
        fallbackContent,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
    } finally {
      errorBoundaryStack.pop();
    }

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });

  return () => {
    error = null;
    disposeEffect();
  };
}

function renderVirtualBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  const props = element.props as {
    each?: unknown;
    key?: (item: T, index: number) => string | number | symbol;
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
    fallback?: SinwanNode;
    children?: (item: T, index: () => number) => SinwanNode;
  };

  const itemHeight = props.itemHeight;
  const containerHeight = props.containerHeight;
  const overscan = props.overscan ?? 3;

  const container = domOps.createElement("div") as HTMLElement;
  container.style.overflow = "auto";
  container.style.height = `${containerHeight}px`;

  const content = domOps.createElement("div") as HTMLElement;
  content.style.position = "relative";
  domOps.appendChild(container, content);

  insertNode(parent, container, block.endAnchor);

  const scrollSignal = signal(0);
  const scrollHandler = () => {
    scrollSignal.value = (container as HTMLElement).scrollTop;
  };
  domOps.addEventListener(container, "scroll", scrollHandler);

  let initialized = false;
  let records: ForRecord<T>[] = [];

  const disposeEffect = effect(() => {
    const items = readReactive(props.each) as readonly T[] | null | undefined;
    const list = Array.isArray(items) ? items : [];
    const renderChild = props.children;

    if (typeof renderChild !== "function") {
      for (const record of records) {
        removeMountedNode(record.mounted);
      }
      records = [];
      block.children = [];
      if (initialized) queueUpdatedHooks(owner);
      initialized = true;
      return;
    }

    if (list.length === 0) {
      for (const record of records) {
        removeMountedNode(record.mounted);
      }
      records = [];
      while (content.firstChild) {
        domOps.remove(content.firstChild);
      }
      if (props.fallback != null) {
        block.children = renderBlockContent(
          props.fallback,
          content,
          null,
          namespace,
          owner,
        );
      } else {
        block.children = [];
      }
      if (initialized) fireMountedAndQueueUpdated(owner);
      initialized = true;
      return;
    }

    const scrollTop = scrollSignal.value;
    const totalHeight = list.length * itemHeight;
    content.style.height = `${totalHeight}px`;

    let startIndex = Math.floor(scrollTop / itemHeight);
    let endIndex = Math.ceil((scrollTop + containerHeight) / itemHeight);
    startIndex = Math.max(0, startIndex - overscan);
    endIndex = Math.min(list.length, endIndex + overscan);
    const visibleCount = Math.max(0, endIndex - startIndex);

    const nextRecords: ForRecord<T>[] = new Array(visibleCount);
    const reusedKeys = new Set<unknown>();

    for (let i = 0; i < visibleCount; i++) {
      const listIndex = startIndex + i;
      const item = list[listIndex]!;
      const key = props.key ? props.key(item, listIndex) : item;

      let reused: ForRecord<T> | undefined;
      for (const record of records) {
        if (
          record.key === key &&
          record.item === item &&
          !reusedKeys.has(key)
        ) {
          reused = record;
          break;
        }
      }

      if (reused) {
        reused.index = listIndex;
        const nodes = getMountedDomNodes(reused.mounted);
        for (const node of nodes) {
          const el = node as any;
          if (el.style && typeof el.style === "object") {
            el.style.top = `${listIndex * itemHeight}px`;
          }
        }
        nextRecords[i] = reused;
        reusedKeys.add(key);
        continue;
      }

      const record: ForRecord<T> = {
        key,
        item,
        index: listIndex,
        mounted: undefined as unknown as MountedNode,
      };

      record.mounted = withOptionalInstance(owner, () =>
        renderNodeToDOM(
          renderChild(item, () => record.index),
          content,
          null,
          namespace,
        ),
      );

      const nodes = getMountedDomNodes(record.mounted);
      for (const node of nodes) {
        const el = node as any;
        if (el.style && typeof el.style === "object") {
          el.style.position = "absolute";
          el.style.top = `${listIndex * itemHeight}px`;
          el.style.height = `${itemHeight}px`;
          el.style.left = "0";
          el.style.right = "0";
          el.style.boxSizing = "border-box";
        }
      }

      nextRecords[i] = record;
      reusedKeys.add(key);
    }

    for (const record of records) {
      if (!reusedKeys.has(record.key)) {
        removeMountedNode(record.mounted);
      }
    }

    records = nextRecords;
    const mountedChildren: MountedNode[] = new Array(nextRecords.length);
    for (let i = 0; i < nextRecords.length; i++) {
      mountedChildren[i] = nextRecords[i]!.mounted;
    }
    block.children = mountedChildren;

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });

  return () => {
    domOps.removeEventListener(container, "scroll", scrollHandler);
    disposeEffect();
  };
}

function renderForBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let records: ForRecord<T>[] = [];
  let lastList: readonly T[] | null = null; // optimisation: détecte si le tableau a changé
  let recordsByKey: Map<unknown, ForRecord<T>> | null = new Map(); // optimisation: lookup O(1) par clé
  let recordsByNumericKey: Array<ForRecord<T> | undefined> | null = null;

  return effect(() => {
    const props = element.props as {
      each?: unknown;
      key?: (item: T, index: number) => string | number | symbol;
      fallback?: SinwanNode;
      children?: (item: T, index: () => number) => SinwanNode;
    };
    const items = readReactive(props.each) as readonly T[] | null | undefined;
    const list = Array.isArray(items) ? items : [];
    const renderChild = props.children;

    if (typeof renderChild !== "function") {
      clearChildren(block);
      records = [];
      recordsByKey = new Map();
      recordsByNumericKey = null;
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
      return;
    }

    if (list.length === 0) {
      clearChildren(block);
      records = [];
      recordsByKey = new Map();
      recordsByNumericKey = null;
      block.children = renderBlockContent(
        props.fallback,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      lastList = list;
      return;
    }

    if (records.length === 0 && block.children.length > 0) {
      clearChildren(block);
    }

    if (records.length === 0) {
      const fragment = domOps.createDocumentFragment();
      const nextRecords: ForRecord<T>[] = new Array(list.length);
      const nextRecordsByKey = new Map<unknown, ForRecord<T>>();

      const prevInstance = owner ? setCurrentInstance(owner) : null;
      try {
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const key = props.key ? props.key(item, i) : item;
          const record: ForRecord<T> = {
            key,
            item,
            index: i,
            mounted: undefined as unknown as MountedNode,
          };

          record.mounted = renderNodeToDOM(
            renderChild(item, () => record.index),
            fragment,
            null,
            namespace,
          );

          nextRecords[i] = record;
          nextRecordsByKey.set(key, record);
        }
      } finally {
        if (owner) setCurrentInstance(prevInstance);
      }

      insertNode(parent, fragment, block.endAnchor);

      records = nextRecords;
      recordsByKey = nextRecordsByKey;
      recordsByNumericKey = null;
      lastList = list;

      const mountedChildren: MountedNode[] = new Array(nextRecords.length);
      for (let i = 0; i < nextRecords.length; i++) {
        mountedChildren[i] = nextRecords[i]!.mounted;
      }
      block.children = mountedChildren;

      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    // optimisation: détecte si c'est une mise à jour simple (peu d'éléments changés)
    // fonctionne même si la référence du tableau a changé (ex: array.slice())
    const isSameLength = lastList && lastList.length === list.length;
    let simpleUpdate = isSameLength;
    let changedIndex = -1;
    let changedIndices: number[] = [];

    // vérifie si peu d'éléments ont changé (optimisation pour update et swap)
    if (simpleUpdate) {
      let diffCount = 0;
      for (let i = 0; i < list.length; i++) {
        if (list[i] !== lastList![i]) {
          diffCount++;
          changedIndex = i;
          changedIndices.push(i);
          if (diffCount > 2) {
            simpleUpdate = false;
            break;
          }
        }
      }
    }

    // fast-path pour swap de deux éléments (O(1) au lieu de O(n))
    if (simpleUpdate && records.length > 0 && changedIndices.length === 2) {
      const i = changedIndices[0]!;
      const j = changedIndices[1]!;
      // vérifie que c'est un vrai swap (les deux items ont simplement échangé de place)
      if (lastList![i] === list[j] && lastList![j] === list[i]) {
        const recordI = records[i]!;
        const recordJ = records[j]!;
        // échange les items et index
        recordI.item = list[i]!;
        recordJ.item = list[j]!;
        const tmpIndex = recordI.index;
        recordI.index = recordJ.index;
        recordJ.index = tmpIndex;
        // échange dans records et block.children
        records[i] = recordJ;
        records[j] = recordI;
        block.children[i] = recordJ.mounted;
        block.children[j] = recordI.mounted;
        // réordonne uniquement les deux nœuds dans le DOM (uniquement pour arbres mono-nœud)
        const nodesI = getMountedDomNodes(recordI.mounted);
        const nodesJ = getMountedDomNodes(recordJ.mounted);
        if (nodesI.length === 1 && nodesJ.length === 1) {
          const nodeI = nodesI[0]!;
          const nodeJ = nodesJ[0]!;
          const nextI = nodeI.nextSibling;
          const nextJ = nodeJ.nextSibling;
          const parentNode = nodeI.parentNode!;
          // détermine si I est avant J
          let iBeforeJ = false;
          let n: Node | null = nodeI;
          while (n) {
            if (n === nodeJ) {
              iBeforeJ = true;
              break;
            }
            n = n.nextSibling;
          }
          if (iBeforeJ) {
            parentNode.insertBefore(nodeJ, nodeI);
            parentNode.insertBefore(nodeI, nextJ);
          } else {
            parentNode.insertBefore(nodeI, nodeJ);
            parentNode.insertBefore(nodeJ, nextI);
          }
        }

        if (
          containsPortal(recordI.mounted) ||
          containsPortal(recordJ.mounted)
        ) {
          syncPortalOrder(block);
        }
        lastList = list;
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
        return;
      }
    }

    // si c'est une mise à jour simple d'un seul élément, utilise le diffing rapide par clé
    if (simpleUpdate && records.length > 0 && changedIndices.length === 1) {
      const newItem = list[changedIndex];
      const key = props.key ? props.key(newItem, changedIndex) : newItem;
      const oldRecord =
        recordsByNumericKey &&
        isNonNegativeInt(key) &&
        key < recordsByNumericKey.length
          ? recordsByNumericKey[key]
          : recordsByKey?.get(key);

      if (oldRecord) {
        if (oldRecord.item !== newItem) {
          oldRecord.item = newItem;
          oldRecord.index = changedIndex;

          // optimisation critique style SolidJS: tente de mettre à jour en-place
          const newContent = renderChild(newItem, () => oldRecord.index);

          // si le nouveau contenu est primitif, met à jour tous les nœuds texte existants
          if (
            typeof newContent === "string" ||
            typeof newContent === "number"
          ) {
            updateTextNodeContent(oldRecord.mounted, String(newContent));
          } else if (
            typeof newContent === "object" &&
            newContent !== null &&
            "tag" in newContent
          ) {
            // si c'est un élément, tente de mettre à jour en-place si la structure correspond
            const element = newContent as SinwanElement;
            if (
              oldRecord.mounted.type === "element" &&
              oldRecord.mounted.node.tagName.toLowerCase() ===
                String(element.tag)
            ) {
              // structure identique - met à jour les nœuds texte récursivement
              updateTextNodeContent(oldRecord.mounted, "");
              // ré-render le contenu pour obtenir les nouvelles valeurs
              removeMountedNode(oldRecord.mounted);
              oldRecord.mounted = withOptionalInstance(owner, () =>
                renderNodeToDOM(newContent, parent, block.endAnchor, namespace),
              );
              block.children[changedIndex] = oldRecord.mounted;
            } else {
              // structure différente - re-render complet
              removeMountedNode(oldRecord.mounted);
              oldRecord.mounted = withOptionalInstance(owner, () =>
                renderNodeToDOM(newContent, parent, block.endAnchor, namespace),
              );
              block.children[changedIndex] = oldRecord.mounted;
            }
          } else {
            // re-render complet pour autres types
            removeMountedNode(oldRecord.mounted);
            oldRecord.mounted = withOptionalInstance(owner, () =>
              renderNodeToDOM(newContent, parent, block.endAnchor, namespace),
            );
            block.children[changedIndex] = oldRecord.mounted;
          }
        }
        lastList = list;
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
        return;
      }
    }

    const keys: unknown[] = new Array(list.length);
    let allNumericKeys = true;
    let maxNumericKey = -1;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const key = props.key ? props.key(item, i) : item;
      keys[i] = key;
      if (allNumericKeys) {
        if (!isNonNegativeInt(key)) {
          allNumericKeys = false;
        } else if (key > maxNumericKey) {
          maxNumericKey = key;
        }
      }
    }

    if (allNumericKeys) {
      for (const record of records) {
        const key = record.key;
        if (!isNonNegativeInt(key)) {
          allNumericKeys = false;
          break;
        }
        if (key > maxNumericKey) {
          maxNumericKey = key;
        }
      }
    }

    const useNumericKeys = allNumericKeys && maxNumericKey <= list.length * 4;

    let oldByKey: Map<unknown, ForRecord<T>> | null = null;
    let oldByNumeric: Array<ForRecord<T> | undefined> | null = null;

    if (useNumericKeys) {
      oldByNumeric = new Array(maxNumericKey + 1);
      for (const record of records) {
        oldByNumeric[record.key as number] = record;
      }
    } else {
      oldByKey = new Map<unknown, ForRecord<T>>();
      // optimisation: utilise recordsByKey existant au lieu de reconstruire
      for (const record of records) {
        oldByKey.set(record.key, record);
      }
    }

    const nextRecords: ForRecord<T>[] = new Array(list.length);
    const nextRecordsByKey = useNumericKeys
      ? null
      : new Map<unknown, ForRecord<T>>();
    const nextRecordsByNumeric = useNumericKeys
      ? new Array<ForRecord<T> | undefined>(maxNumericKey + 1)
      : null;
    let reusedCount = 0;

    // remplace forEach par boucle for pour éviter la création d'une fonction callback (critique pour grandes listes)
    for (let i = 0; i < list.length; i++) {
      const item = list[i]!;
      const key = keys[i]!;
      const old = useNumericKeys
        ? oldByNumeric![key as number]
        : oldByKey!.get(key);

      if (old && old.item === item) {
        old.index = i;
        nextRecords[i] = old;
        if (useNumericKeys) {
          nextRecordsByNumeric![key as number] = old;
          oldByNumeric![key as number] = undefined;
        } else {
          nextRecordsByKey!.set(key, old);
          oldByKey!.delete(key);
        }
        reusedCount++;
        continue;
      }

      if (old) {
        removeMountedNode(old.mounted);
        if (useNumericKeys) {
          oldByNumeric![key as number] = undefined;
        } else {
          oldByKey!.delete(key);
        }
      }

      const record: ForRecord<T> = {
        key,
        item,
        index: i,
        mounted: undefined as unknown as MountedNode,
      };

      record.mounted = withOptionalInstance(owner, () =>
        renderNodeToDOM(
          renderChild(item, () => record.index),
          parent,
          block.endAnchor,
          namespace,
        ),
      );
      nextRecords[i] = record;
      if (useNumericKeys) {
        nextRecordsByNumeric![key as number] = record;
      } else {
        nextRecordsByKey!.set(key, record);
      }
    }

    if (useNumericKeys) {
      for (let i = 0; i < oldByNumeric!.length; i++) {
        const record = oldByNumeric![i];
        if (record) {
          removeMountedNode(record.mounted);
        }
      }
    } else {
      for (const record of oldByKey!.values()) {
        removeMountedNode(record.mounted);
      }
    }

    // réordonne le DOM seulement si des anciens enregistrements ont été réutilisés
    // (sinon tous les nœuds sont nouveaux et déjà dans le bon ordre)
    if (reusedCount > 0) {
      const fragment = domOps.createDocumentFragment();
      for (let i = 0; i < nextRecords.length; i++) {
        const nodes = getMountedDomNodes(nextRecords[i]!.mounted);
        for (let j = 0; j < nodes.length; j++) {
          fragment.appendChild(nodes[j]!);
        }
      }
      insertNode(parent, fragment, block.endAnchor);

      let hasPortal = false;
      for (let i = 0; i < nextRecords.length; i++) {
        if (containsPortal(nextRecords[i]!.mounted)) {
          hasPortal = true;
          break;
        }
      }
      if (hasPortal) {
        syncPortalOrder(block);
      }
    }

    records = nextRecords;
    recordsByKey = nextRecordsByKey;
    recordsByNumericKey = nextRecordsByNumeric;
    lastList = list;
    // remplace map par boucle for pour éviter la création d'un tableau intermédiaire (critique pour diffing)
    const mountedChildren: MountedNode[] = new Array(nextRecords.length);
    for (let i = 0; i < nextRecords.length; i++) {
      mountedChildren[i] = nextRecords[i]!.mounted;
    }
    block.children = mountedChildren;

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderSwitchBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;

  return effect(() => {
    clearChildren(block);

    const content = withOptionalInstance(owner, () =>
      resolveSwitchContent(element),
    );
    block.children = renderBlockContent(
      content,
      parent,
      block.endAnchor,
      namespace,
      owner,
    );

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderIndexBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let records: IndexRecord<T>[] = [];

  return effect(() => {
    const props = element.props as {
      each?: unknown;
      fallback?: SinwanNode;
      children?: (item: () => T, index: number) => SinwanNode;
    };
    const items = readReactive(props.each) as readonly T[] | null | undefined;
    const list = Array.isArray(items) ? items : [];
    const renderChild = props.children;

    if (typeof renderChild !== "function") {
      clearChildren(block);
      records = [];
      if (initialized) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
      return;
    }

    if (list.length === 0) {
      clearChildren(block);
      records = [];
      block.children = renderBlockContent(
        props.fallback,
        parent,
        block.endAnchor,
        namespace,
        owner,
      );
      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
      initialized = true;
      return;
    }

    if (records.length === 0 && block.children.length > 0) {
      clearChildren(block);
    }

    for (let index = 0; index < list.length; index++) {
      const existing = records[index];
      if (existing) {
        existing.item.value = list[index]!;
        continue;
      }

      const itemSignal = signal(list[index]!);
      const record: IndexRecord<T> = {
        item: itemSignal,
        mounted: withOptionalInstance(owner, () =>
          renderNodeToDOM(
            renderChild(() => itemSignal.value, index),
            parent,
            block.endAnchor,
            namespace,
          ),
        ),
      };
      records.push(record);
    }

    while (records.length > list.length) {
      const removed = records.pop()!;
      removeMountedNode(removed.mounted);
    }

    // remplace map par boucle for pour éviter la création d'un tableau intermédiaire (critique pour diffing)
    const mountedChildren: MountedNode[] = [];
    for (let i = 0; i < records.length; i++) {
      mountedChildren.push(records[i].mounted);
    }
    block.children = mountedChildren;

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderKeyBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let hasKey = false;
  let currentKey: unknown;

  return effect(() => {
    const key = readReactive((element.props as any).when);
    if (hasKey && Object.is(currentKey, key)) {
      return;
    }

    currentKey = key;
    hasKey = true;
    clearChildren(block);

    const content = withOptionalInstance(owner, () =>
      resolveKeyChildren(element, key),
    );
    block.children = renderBlockContent(
      content,
      parent,
      block.endAnchor,
      namespace,
      owner,
    );

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderDynamicBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let hasTag = false;
  let currentTag: unknown;

  return effect(() => {
    const tag = readReactive((element.props as any).component);
    if (hasTag && Object.is(currentTag, tag)) {
      return;
    }

    currentTag = tag;
    hasTag = true;
    clearChildren(block);

    const content = tag ? createDynamicElement(element, tag) : null;
    block.children = renderBlockContent(
      content,
      parent,
      block.endAnchor,
      namespace,
      owner,
    );

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });
}

function renderPortal(
  element: SinwanElement,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedPortal {
  const placeholder = domOps.createComment("Sinwan-p");
  insertNode(parent, placeholder, anchor);

  const owner = getCurrentInstance();
  let disposeEffect = () => {};

  const targetAnchor = domOps.createComment("Sinwan-pa");
  let lastTarget: Node | null = null;

  const portal: MountedPortal = {
    type: "portal",
    anchor: placeholder,
    children: [],
    dispose: () => disposeEffect(),
    targetAnchor,
  };
  let initialized = false;

  disposeEffect = effect(() => {
    const target = resolvePortalTarget((element.props as any).mount);

    if (target !== lastTarget) {
      if (lastTarget) {
        domOps.remove(targetAnchor);
      }
      if (target) {
        domOps.appendChild(target, targetAnchor);
      }
      lastTarget = target;
      portal.target = target as Node;
    }

    clearPortalChildren(portal);

    if (target) {
      portal.children = renderBlockContent(
        (element.props as any).children ?? element.children,
        target,
        targetAnchor,
        namespace,
        owner,
      );
    }

    if (initialized) {
      fireMountedAndQueueUpdated(owner);
    }
    initialized = true;
  });

  return portal;
}

function createDynamicElement(
  element: SinwanElement,
  tag: unknown,
): SinwanElement | null {
  if (typeof tag !== "string" && typeof tag !== "function") {
    return null;
  }

  const { component, ...props } = element.props as Record<string, unknown>;
  const children = normalizeContent(props.children ?? element.children);

  return {
    tag: tag as SinwanElement["tag"],
    props,
    children,
  };
}

function renderBlockContent(
  content: SinwanNode,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
  owner: ComponentInstance | null,
): MountedNode[] {
  if (content == null || typeof content === "boolean") return [];

  return withOptionalInstance(owner, () => {
    if (Array.isArray(content)) {
      // remplace map par boucle for pour éviter la création d'un tableau intermédiaire (critique pour rendu de contenu)
      const children: MountedNode[] = [];
      for (let i = 0; i < content.length; i++) {
        children.push(renderNodeToDOM(content[i], parent, anchor, namespace));
      }
      return children;
    }

    return [renderNodeToDOM(content, parent, anchor, namespace)];
  });
}

function clearChildren(block: MountedReactiveBlock): void {
  // Fast path: remove all DOM nodes between anchors in one sweep,
  // avoiding the expensive getMountedDomNodes recursive traversal.
  if (block.startAnchor.parentNode) {
    let node = block.startAnchor.nextSibling;
    while (node && node !== block.endAnchor) {
      const next = node.nextSibling;
      domOps.remove(node);
      node = next;
    }
  }
  // Run logical cleanup (effects, events, refs)
  for (const child of block.children) {
    unmountNode(child);
  }
  block.children = [];
}

function clearPortalChildren(portal: MountedPortal): void {
  for (const child of portal.children) {
    removeMountedNode(child);
  }
  portal.children = [];
}

function moveBeforeEnd(
  parent: Node,
  mounted: MountedNode,
  endAnchor: Node,
): void {
  for (const node of getMountedDomNodes(mounted)) {
    domOps.insertBefore(parent, node, endAnchor);
  }
  syncPortalOrder(mounted);
}

function containsPortal(mounted: MountedNode): boolean {
  switch (mounted.type) {
    case "portal":
      return true;
    case "component":
      for (const child of mounted.children) {
        if (containsPortal(child)) return true;
      }
      return false;
    case "element":
      for (const child of mounted.children) {
        if (containsPortal(child)) return true;
      }
      return false;
    case "fragment":
      for (const child of mounted.children) {
        if (containsPortal(child)) return true;
      }
      return false;
    case "reactive-block":
      for (const child of mounted.children) {
        if (containsPortal(child)) return true;
      }
      return false;
    case "async":
      for (const child of mounted.children) {
        if (containsPortal(child)) return true;
      }
      return false;
    default:
      return false;
  }
}

function syncPortalOrder(mounted: MountedNode): void {
  if (mounted.type === "portal") {
    if (mounted.target && mounted.targetAnchor) {
      for (const child of mounted.children) {
        for (const node of getMountedDomNodes(child)) {
          domOps.appendChild(mounted.target, node);
        }
      }
      domOps.appendChild(mounted.target, mounted.targetAnchor);
    }
  } else if (
    "children" in mounted &&
    Array.isArray((mounted as any).children)
  ) {
    for (const child of (mounted as any).children) {
      syncPortalOrder(child);
    }
  }
}

function fireMountedAndQueueUpdated(owner: ComponentInstance | null): void {
  if (owner) {
    fireMountedHooks(owner);
  }
  queueUpdatedHooks(owner);
}

function withOptionalInstance<T>(
  owner: ComponentInstance | null,
  fn: () => T,
): T {
  return owner ? withInstance(owner, fn) : fn();
}

function readReactive(value: unknown): unknown {
  return resolve(value as any);
}

function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function resolvePortalTarget(value: unknown): Node | null {
  const target = readReactive(value);

  if (target == null) {
    return typeof document === "undefined" ? null : document.body;
  }

  if (typeof target === "string") {
    return document.querySelector(target);
  }

  if (typeof target === "function") {
    return target() as Node | null;
  }

  if (typeof target === "object" && "nodeType" in target) {
    return target as Node;
  }

  return null;
}

function renderSuspenseBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  const retrySignal = signal(0);
  let hasContent = false;
  let contentNodes: MountedNode[] = [];
  let fallbackNode: MountedNode | null = null;
  let initialized = false;
  let disposed = false;

  const disposeEffect = effect(() => {
    void retrySignal.value; // establish dependency for re-runs

    // On the very first effect run, render fallback as placeholder.
    if (!initialized) {
      const fallback = (element.props as any).fallback as SinwanNode;
      fallbackNode = withOptionalInstance(owner, () =>
        renderNodeToDOM(fallback, parent, block.endAnchor, namespace),
      );
      block.children = fallbackNode ? [fallbackNode] : [];
      initialized = true;
    }

    // Remove old content before attempting a fresh render.
    for (const node of contentNodes) {
      removeMountedNode(node);
    }
    contentNodes = [];

    // Attempt to render children under this Suspense boundary.
    const boundary = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved: () => {},
    };

    // Set up promise tracking so we can retry when they resolve.
    let retryScheduled = false;
    boundary.onResolved = () => {
      if (disposed || retryScheduled) return;
      retryScheduled = true;
      queueMicrotask(() => {
        retryScheduled = false;
        if (!disposed) {
          retrySignal.value = retrySignal.value + 1;
        }
      });
    };

    pushSuspenseBoundary(boundary);

    const children = (element.props as any).children as SinwanNode | undefined;
    const childArray =
      children != null ? (Array.isArray(children) ? children : [children]) : [];

    const nodes: MountedNode[] = [];

    try {
      for (const child of childArray) {
        if (child != null) {
          nodes.push(
            withOptionalInstance(owner, () =>
              renderNodeToDOM(
                child as SinwanNode,
                parent,
                block.endAnchor,
                namespace,
              ),
            ),
          );
        }
      }

      popSuspenseBoundary();

      // Success! Remove fallback, show content.
      if (fallbackNode) {
        removeMountedNode(fallbackNode);
        fallbackNode = null;
      }

      block.children = nodes;
      contentNodes = nodes;
      hasContent = true;

      if (initialized) {
        fireMountedAndQueueUpdated(owner);
      }
    } catch (err) {
      popSuspenseBoundary();

      // Remove any partially rendered children.
      for (const node of nodes) {
        removeMountedNode(node);
      }

      if (
        err &&
        typeof err === "object" &&
        typeof (err as any).then === "function"
      ) {
        // A promise was thrown — show fallback.
        const promise = err as PromiseLike<unknown>;
        boundary.promises.add(promise);

        if (!fallbackNode) {
          const fallback = (element.props as any).fallback as SinwanNode;
          fallbackNode = withOptionalInstance(owner, () =>
            renderNodeToDOM(fallback, parent, block.endAnchor, namespace),
          );
          block.children = fallbackNode ? [fallbackNode] : [];
        }

        hasContent = false;
      } else {
        throw err;
      }
    }

    // Subscribe to any promises caught during rendering so we retry
    // when they actually resolve, then clear the set so we don't
    // re-subscribe to already-resolved promises on the next run.
    for (const promise of boundary.promises) {
      promise.then(() => boundary.onResolved());
    }
    boundary.promises.clear();
  });

  return () => {
    disposed = true;
    disposeEffect();
  };
}

function renderActivityBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let wrapperMounted: MountedElement | null = null;
  let wasHidden = false;

  return effect(() => {
    const rawMode = (element.props as any).mode;
    const mode = readReactive(rawMode) ?? "visible";
    const hidden = mode === "hidden";

    if (!initialized) {
      const children = normalizeContent((element.props as any).children);
      const wrapperEl: SinwanElement = {
        tag: (element.props as any).as ?? "div",
        props: {
          "data-sinwan-activity": hidden ? "hidden" : "visible",
          hidden: hidden ? true : undefined,
          children: (element.props as any).children,
        },
        children,
      };

      wrapperMounted = renderElementToDOM(
        wrapperEl,
        parent,
        block.endAnchor,
        namespace,
      ) as MountedElement;

      block.children = [wrapperMounted];

      if (hidden) {
        softHideMountedTree(wrapperMounted);
      }

      initialized = true;
      wasHidden = hidden;
      return;
    }

    if (hidden !== wasHidden && wrapperMounted) {
      const wrapper = wrapperMounted.node as HTMLElement;
      wrapper.setAttribute(
        "data-sinwan-activity",
        hidden ? "hidden" : "visible",
      );
      if (hidden) {
        wrapper.setAttribute("hidden", "");
        wrapper.style.display = "none";
        softHideMountedTree(wrapperMounted);
      } else {
        wrapper.removeAttribute("hidden");
        wrapper.style.display = "";
        softShowMountedTree(wrapperMounted);
      }
      wasHidden = hidden;
    }
  });
}

function renderViewTransitionBlock(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  _owner: ComponentInstance | null,
): () => void {
  const props = element.props as {
    name?: string;
    children?: SinwanNode;
  };
  const name = props.name;
  const children = normalizeContent(props.children);

  if (!name) {
    for (const child of children) {
      block.children.push(
        renderNodeToDOM(child, parent, block.endAnchor, namespace),
      );
    }
    return () => {
      for (const child of block.children) {
        removeMountedNode(child);
      }
    };
  }

  const wrapperEl: SinwanElement = {
    tag: (element.props as any).as ?? "div",
    props: {
      style: { viewTransitionName: name },
      children: props.children,
    },
    children,
  };

  const mounted = renderElementToDOM(
    wrapperEl,
    parent,
    block.endAnchor,
    namespace,
  ) as MountedElement;
  block.children = [mounted];

  return () => removeMountedNode(mounted);
}

function softHideMountedTree(node: MountedNode): void {
  switch (node.type) {
    case "component":
      if (node.instance) softHideInstance(node.instance);
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "element":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "fragment":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "reactive-block":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "async":
      for (const child of node.children) softHideMountedTree(child);
      break;
    case "portal":
      for (const child of node.children) softHideMountedTree(child);
      break;
    default:
      break;
  }
}

function softShowMountedTree(node: MountedNode): void {
  switch (node.type) {
    case "component":
      if (node.instance) softShowInstance(node.instance);
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "element":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "fragment":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "reactive-block":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "async":
      for (const child of node.children) softShowMountedTree(child);
      break;
    case "portal":
      for (const child of node.children) softShowMountedTree(child);
      break;
    default:
      break;
  }
}

function insertNode(parent: Node, child: Node, anchor: Node | null): void {
  if (anchor) {
    domOps.insertBefore(parent, child, anchor);
  } else {
    domOps.appendChild(parent, child);
  }
}

// optimisation critique pour update 1/1k: met à jour le contenu texte sans re-render complet
// approche style SolidJS: met à jour récursivement les nœuds texte existants
function updateTextNodeContent(mounted: MountedNode, newContent: string): void {
  if (mounted.type === "text") {
    mounted.node.data = newContent;
    return;
  }
  if (mounted.type === "element") {
    // cherche récursivement tous les nœuds texte et met à jour
    for (const child of mounted.children) {
      if (child.type === "text") {
        child.node.data = newContent;
      } else if (child.type === "element") {
        updateTextNodeContent(child, newContent);
      }
    }
  }
}
