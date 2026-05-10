/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Reactive control-flow blocks
 *
 * `<Show>` and `<For>` render between stable comment anchors. Updates remove,
 * move, or insert only the block-owned DOM nodes.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type { MountedNode, MountedPortal, MountedReactiveBlock } from "./types.ts";
import { domOps } from "./dom-ops.ts";
import { effect, resolve, signal, type Signal } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  fireMountedHooks,
  queueUpdatedHooks,
  withInstance,
  type ComponentInstance,
} from "../component/instance.ts";
import {
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
  resolveKeyChildren,
  resolveShowChildren,
  resolveSwitchContent,
} from "../component/control-flow.ts";
import {
  getMountedDomNodes,
  removeMountedNode,
} from "./unmount.ts";
import { renderNodeToDOM } from "./render-children.ts";

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
    disposeEffect = renderDynamicBlock(element, block, parent, namespace, owner);
  }

  return block;
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
      const content = when ? resolveShowChildren(element, when) : (element.props as any).fallback;
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

function renderForBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  let initialized = false;
  let records: ForRecord<T>[] = [];

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

    const oldByKey = new Map<unknown, ForRecord<T>>();
    for (const record of records) {
      oldByKey.set(record.key, record);
    }

    const nextRecords: ForRecord<T>[] = [];

    list.forEach((item, index) => {
      const key = props.key ? props.key(item, index) : item;
      const old = oldByKey.get(key);

      if (old && old.item === item) {
        old.index = index;
        moveBeforeEnd(parent, old.mounted, block.endAnchor);
        nextRecords.push(old);
        oldByKey.delete(key);
        return;
      }

      if (old) {
        removeMountedNode(old.mounted);
        oldByKey.delete(key);
      }

      const record: ForRecord<T> = {
        key,
        item,
        index,
        mounted: { type: "text", node: domOps.createTextNode("") },
      };

      record.mounted = withOptionalInstance(owner, () =>
        renderNodeToDOM(
          renderChild(item, () => record.index),
          parent,
          block.endAnchor,
          namespace,
        ),
      );
      nextRecords.push(record);
    });

    for (const record of oldByKey.values()) {
      removeMountedNode(record.mounted);
    }

    records = nextRecords;
    block.children = nextRecords.map((record) => record.mounted);

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

    const content = withOptionalInstance(owner, () => resolveSwitchContent(element));
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

    block.children = records.map((record) => record.mounted);

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

function createDynamicElement(element: SinwanElement, tag: unknown): SinwanElement | null {
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
      return content.map((child) =>
        renderNodeToDOM(child, parent, anchor, namespace),
      );
    }

    return [renderNodeToDOM(content, parent, anchor, namespace)];
  });
}

function clearChildren(block: MountedReactiveBlock): void {
  for (const child of block.children) {
    removeMountedNode(child);
  }
  block.children = [];
}

function clearPortalChildren(portal: MountedPortal): void {
  for (const child of portal.children) {
    removeMountedNode(child);
  }
  portal.children = [];
}

function moveBeforeEnd(parent: Node, mounted: MountedNode, endAnchor: Node): void {
  for (const node of getMountedDomNodes(mounted)) {
    domOps.insertBefore(parent, node, endAnchor);
  }
  syncPortalOrder(mounted);
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
  } else if ("children" in mounted && Array.isArray((mounted as any).children)) {
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

function insertNode(parent: Node, child: Node, anchor: Node | null): void {
  if (anchor) {
    domOps.insertBefore(parent, child, anchor);
  } else {
    domOps.appendChild(parent, child);
  }
}
