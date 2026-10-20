import type { SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import { readyIndex } from "../../../common/list-accessors.ts";
import { computeVirtualWindow } from "./window.ts";

type VirtualChildren = {
  (item: unknown, index: { (): number }): SinwanNode;
};

type VirtualPropsShape = {
  each?: unknown;
  by?: {
    (item: unknown, index: number): string | number | symbol;
  };
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  minRendered?: number;
  fallback?: SinwanNode;
  children?: VirtualChildren;
};

export type VirtualRenderPlan =
  | {
      kind: "empty";
      fallback?: SinwanNode;
    }
  | {
      kind: "window";
      list: readonly unknown[];
      itemHeight: number;
      containerHeight: number;
      totalHeight: number;
      startIndex: number;
      endIndex: number;
      renderChild?: VirtualChildren;
    };

/**
 * Resolve the initial (scrollTop=0) `<Virtual>` render plan for SSR / stream.
 */
export function resolveVirtualPlan(element: SinwanElement): VirtualRenderPlan {
  const props = element.props as VirtualPropsShape;
  const items = resolve(props.each);
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    return { kind: "empty", fallback: props.fallback };
  }

  const itemHeight = resolve(props.itemHeight) as number;
  const containerHeight = resolve(props.containerHeight) as number;
  const overscan = (resolve(props.overscan) as number | undefined) ?? 3;
  const minRendered = (resolve(props.minRendered) as number | undefined) ?? 0;

  const { startIndex, endIndex } = computeVirtualWindow({
    listLength: list.length,
    itemHeight,
    containerHeight,
    overscan,
    minRendered,
    scrollTop: 0,
  });

  return {
    kind: "window",
    list,
    itemHeight,
    containerHeight,
    totalHeight: list.length * itemHeight,
    startIndex,
    endIndex,
    renderChild: props.children,
  };
}

function containerOpen(containerHeight: number, totalHeight: number): string {
  return `<div style="overflow:auto;height:${containerHeight}px"><div style="position:relative;height:${totalHeight}px">`;
}

function itemOpen(top: number): string {
  return `<div style="position:absolute;top:${top}px;left:0;right:0">`;
}

const CONTAINER_CLOSE = "</div></div>";

/**
 * Render `<Virtual>` to an HTML string.
 * `sequential` avoids racing mutable hydration context indices.
 */
export async function renderVirtualHtml(
  element: SinwanElement,
  renderNode: (node: SinwanNode) => Promise<string>,
  options?: { sequential?: boolean },
): Promise<string> {
  const plan = resolveVirtualPlan(element);
  if (plan.kind === "empty") {
    return plan.fallback ? await renderNode(plan.fallback) : "";
  }

  const { list, itemHeight, containerHeight, totalHeight, startIndex, endIndex } =
    plan;
  const renderChild = plan.renderChild;

  let itemsHtml = "";
  if (typeof renderChild === "function") {
    if (options?.sequential) {
      for (let i = startIndex; i < endIndex; i++) {
        const top = i * itemHeight;
        const html = await renderNode(renderChild(list[i], readyIndex(i)));
        itemsHtml += `${itemOpen(top)}${html}</div>`;
      }
    } else {
      const promises: Promise<string>[] = [];
      for (let i = startIndex; i < endIndex; i++) {
        const top = i * itemHeight;
        promises.push(
          renderNode(renderChild(list[i], readyIndex(i))).then(
            (html) => `${itemOpen(top)}${html}</div>`,
          ),
        );
      }
      const results = await Promise.all(promises);
      for (let i = 0; i < results.length; i++) {
        itemsHtml += results[i];
      }
    }
  }

  return `${containerOpen(containerHeight, totalHeight)}${itemsHtml}${CONTAINER_CLOSE}`;
}

/**
 * Stream `<Virtual>` HTML chunks through `write`, rendering each child via `streamNode`.
 */
export async function streamVirtualHtml(
  element: SinwanElement,
  write: (html: string) => void,
  streamNode: (node: SinwanNode) => Promise<void>,
): Promise<void> {
  const plan = resolveVirtualPlan(element);
  if (plan.kind === "empty") {
    if (plan.fallback) {
      await streamNode(plan.fallback);
    }
    return;
  }

  const { list, itemHeight, containerHeight, totalHeight, startIndex, endIndex } =
    plan;
  const renderChild = plan.renderChild;

  write(containerOpen(containerHeight, totalHeight));

  if (typeof renderChild === "function") {
    for (let i = startIndex; i < endIndex; i++) {
      const top = i * itemHeight;
      write(itemOpen(top));
      await streamNode(renderChild(list[i], readyIndex(i)));
      write("</div>");
    }
  }

  write(CONTAINER_CLOSE);
}
