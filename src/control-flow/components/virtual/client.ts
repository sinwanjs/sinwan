import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { ComponentInstance } from "../../../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve, signal } from "../../../reactivity/index.ts";
import { queueUpdatedHooks } from "../../../component/instance.ts";
import { readyIndex } from "../../../common/list-accessors.ts";
import { domOps } from "../../../renderer/dom-ops.ts";
import { renderNodeToDOM } from "../../../renderer/render-children.ts";
import {
  getMountedDomNodes,
  removeMountedNode,
} from "../../../renderer/unmount.ts";
import { VIRTUAL_TYPE } from "../../const.ts";
import { Virtual as VirtualFactory } from "../../identity.ts";
import { registerControlFlowBlock } from "../../registry.ts";
import { fireMountedAndQueueUpdated } from "../../shared/fireMountedAndQueueUpdated.ts";
import { insertNode } from "../../shared/insertNode.ts";
import { renderBlockContent } from "../../shared/renderBlockContent.ts";
import { withOptionalInstance } from "../../shared/withOptionalInstance.ts";
import { type ForRecord } from "../for/client.ts";
import { computeVirtualWindow } from "./window.ts";

export { isVirtualElement, type VirtualProps } from "../../identity.ts";

/** Same function as the identity factory; importing it keeps this registration. */
export const Virtual: typeof VirtualFactory = VirtualFactory;

/**
 * Client render path for `<Virtual>`.
 */
export function renderVirtualBlock<T>(
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
): () => void {
  const props = element.props as {
    each?: unknown;
    by?: {
      (item: T, index: number): string | number | symbol;
    };
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
    minRendered?: number;
    fallback?: SinwanNode;
    children?: {
      (item: T, index: { (): number }): SinwanNode;
    };
  };

  const itemHeight = resolve(props.itemHeight) as number;
  const containerHeight = resolve(props.containerHeight) as number;
  const overscan = (resolve(props.overscan) as number | undefined) ?? 3;
  const minRendered = (resolve(props.minRendered) as number | undefined) ?? 0;

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
    const items = resolve(props.each) as readonly T[] | null | undefined;
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

    const { startIndex, endIndex } = computeVirtualWindow({
      listLength: list.length,
      itemHeight,
      containerHeight,
      overscan,
      minRendered,
      scrollTop,
    });

    const visibleCount = Math.max(0, endIndex - startIndex);

    const nextRecords: ForRecord<T>[] = new Array(visibleCount);
    const reusedKeys = new Set<unknown>();

    for (let i = 0; i < visibleCount; i++) {
      const listIndex = startIndex + i;
      const item = list[listIndex]!;
      const key = props.by ? props.by(item, listIndex) : item;

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
          const el = node as HTMLElement & { style?: CSSStyleDeclaration };
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
          renderChild(item, readyIndex(record.index)),
          content,
          null,
          namespace,
        ),
      );

      const nodes = getMountedDomNodes(record.mounted);
      for (const node of nodes) {
        const el = node as HTMLElement & { style?: CSSStyleDeclaration };
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

    // Reorder DOM nodes to match nextRecords order
    const fragment = domOps.createDocumentFragment();
    for (let i = 0; i < nextRecords.length; i++) {
      const nodes = getMountedDomNodes(nextRecords[i]!.mounted);
      for (let j = 0; j < nodes.length; j++) {
        fragment.appendChild(nodes[j]!);
      }
    }
    domOps.appendChild(content, fragment);

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

registerControlFlowBlock(
  VIRTUAL_TYPE,
  renderVirtualBlock,
  Virtual,
);
