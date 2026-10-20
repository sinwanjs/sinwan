import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type {
  MountedElement,
  MountedNode,
} from "../../../renderer/types.ts";
import { effect } from "../../../reactivity/effect.ts";
import { resolve, signal } from "../../../reactivity/index.ts";
import { readyIndex } from "../../../common/list-accessors.ts";
import { renderElementToDOM } from "../../../renderer/render-element.ts";
import { removeMountedNode } from "../../../renderer/unmount.ts";
import {
  advance,
  hydrateContent,
  hydrateNode,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { normalizeContent } from "../../shared/normalizeContent.ts";
import { computeVirtualWindow } from "./window.ts";

/**
 * Hydrate a `<Virtual>` list from SSR markup and attach scroll reactivity.
 */
export function hydrateVirtual(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    each?: unknown;
    by?: {
      (item: unknown, index: number): string | number | symbol;
    };
    itemHeight: number;
    containerHeight: number;
    overscan?: number;
    minRendered?: number;
    fallback?: SinwanNode;
    children?: {
      (item: unknown, index: { (): number }): SinwanNode;
    };
  };

  const items = resolve(props.each);
  const list = Array.isArray(items) ? items : [];

  if (list.length === 0) {
    return hydrateContent(props.fallback ?? null, cursor);
  }

  const itemHeight = props.itemHeight;
  const containerHeight = props.containerHeight;
  const overscan = props.overscan ?? 3;
  const minRendered = props.minRendered ?? 0;

  const renderChild = props.children;
  if (typeof renderChild !== "function") {
    return hydrateContent([], cursor);
  }

  const resolveRange = (
    scrollTop: number,
    length: number,
  ): readonly [number, number] => {
    const range = computeVirtualWindow({
      listLength: length,
      itemHeight,
      containerHeight,
      overscan,
      minRendered,
      scrollTop,
    });
    return [range.startIndex, range.endIndex] as const;
  };

  const initialRange = resolveRange(0, list.length);
  const startIndex = initialRange[0];
  const endIndex = initialRange[1];

  // Advance past the container div rendered by the server
  const containerDiv = advance(cursor) as HTMLElement;
  if (!containerDiv || containerDiv.nodeType !== 1) {
    return hydrateContent([], cursor);
  }

  const contentDiv = containerDiv.firstChild as HTMLElement;
  if (!contentDiv || contentDiv.nodeType !== 1) {
    return hydrateContent([], cursor);
  }

  const itemCursor: HydrationCursor = {
    parent: contentDiv,
    current: contentDiv.firstChild,
    adapter: cursor.adapter,
  };

  const children: MountedNode[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const child = renderChild(list[i], readyIndex(i));
    children.push(
      hydrateNode(
        {
          tag: "div",
          props: {
            style: `position:absolute;top:${i * itemHeight}px;left:0;right:0`,
          },
          children: normalizeContent(child),
        },
        itemCursor,
      ),
    );
  }

  const keyFn = props.by;
  interface VirtualEntry {
    mounted: MountedNode;
    wrapperEl: HTMLElement;
    currentIndex: number;
  }
  const keyMap = new Map<string | number | symbol, VirtualEntry>();
  for (let i = startIndex; i < endIndex; i++) {
    const key = keyFn ? (keyFn(list[i], i) ?? i) : i;
    const m = children[i - startIndex];
    if (m.type !== "element") continue;
    const wrapperEl = (m as MountedElement).node as HTMLElement;
    if (!wrapperEl) continue;
    keyMap.set(key, { mounted: m, wrapperEl, currentIndex: i });
  }

  const contentMounted: MountedElement = {
    type: "element",
    node: contentDiv,
    children,
    eventCleanups: null,
    attrDisposers: null,
    refCleanup: null,
  };

  const mounted: MountedElement = {
    type: "element",
    node: containerDiv,
    children: [contentMounted],
    eventCleanups: null,
    attrDisposers: null,
    refCleanup: null,
  };

  // Setup scroll reactivity after hydration
  if (typeof window !== "undefined") {
    const scrollSignal = signal(0);
    function onVirtualScroll(): void {
      scrollSignal.value = containerDiv.scrollTop;
    }
    containerDiv.addEventListener("scroll", onVirtualScroll, {
      passive: true,
    });
    // Seed the signal from the live scroll position (covers the handler).
    onVirtualScroll();

    // Store cleanup on the mounted element
    function scrollCleanup(): void {
      containerDiv.removeEventListener("scroll", onVirtualScroll);
    }

    // Effect that updates visible items on scroll
    let initialized = false;
    const disposeScrollEffect = effect(() => {
      const scrollTop = scrollSignal.value;

      // Re-read list to handle signal updates
      const currentList = (() => {
        const nextItems = resolve(props.each);
        return Array.isArray(nextItems) ? nextItems : [];
      })();

      // Skip first run - DOM is already hydrated
      if (!initialized) {
        initialized = true;
        // Just set the total height on first run
        const totalHeight = currentList.length * itemHeight;
        contentDiv.style.height = `${totalHeight}px`;
        return;
      }
      const totalHeight = currentList.length * itemHeight;
      contentDiv.style.height = `${totalHeight}px`;

      const [newStart, newEnd] = resolveRange(scrollTop, currentList.length);

      // Keyed node reuse: keep existing nodes, create only new ones, remove old ones
      const newChildren: MountedNode[] = [];
      const newKeyMap = new Map<string | number | symbol, VirtualEntry>();

      for (let i = newStart; i < newEnd; i++) {
        const key = keyFn ? (keyFn(currentList[i], i) ?? i) : i;
        const entry = keyMap.get(key);
        if (entry) {
          if (entry.currentIndex !== i) {
            entry.wrapperEl.style.top = `${i * itemHeight}px`;
            entry.currentIndex = i;
          }
          newChildren.push(entry.mounted);
          keyMap.delete(key);
          newKeyMap.set(key, entry);
        } else {
          const childNode = renderChild!(currentList[i], readyIndex(i));
          const wrapped: SinwanElement = {
            tag: "div",
            props: {
              style: `position:absolute;top:${i * itemHeight}px;left:0;right:0`,
            },
            children: normalizeContent(childNode),
          };
          const rendered = renderElementToDOM(
            wrapped,
            contentDiv,
            null,
            null,
          ) as MountedElement;
          const wrapperEl = rendered.node as HTMLElement;
          newChildren.push(rendered);
          newKeyMap.set(key, {
            mounted: rendered,
            wrapperEl,
            currentIndex: i,
          });
        }
      }

      // Remove nodes that are no longer in the visible window
      for (const [, entry] of keyMap) {
        removeMountedNode(entry.mounted);
      }

      contentMounted.children = newChildren;
      // Update keyMap for next scroll effect run
      keyMap.clear();
      for (const [k, v] of newKeyMap) {
        keyMap.set(k, v);
      }
    });

    // Store cleanup on the mounted element
    mounted.eventCleanups = [scrollCleanup, disposeScrollEffect];
  }

  return mounted;
}
