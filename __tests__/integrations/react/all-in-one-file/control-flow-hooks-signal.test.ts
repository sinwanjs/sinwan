/**
 * Comprehensive integration test:
 * Key, Switch, For, Match + useEffect, useState, Signal in one test.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { signal, nextTick } from "../../../../src/reactivity/index.ts";
import {
  Key,
  Switch,
  Match,
  For,
  Show,
} from "../../../../src/component/control-flow.ts";
import {
  useState,
  useEffect,
} from "../../../../src/integrations/react/_client.ts";
import type { SinwanElement } from "../../../../src/types.ts";

let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

function el(
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children: children as any };
}

describe("Key + Switch + For + Match + useState + useEffect + signal", () => {
  it("all work together in a single reactive tree", async () => {
    const viewKey = signal<"list" | "detail">("list");
    const items = signal([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Carol" },
    ]);
    const selectedId = signal<number | null>(null);
    const effectLog: string[] = [];

    const ListItem = cc<{ item: { id: number; name: string } }>(({ item }) => {
      const [localCount, setLocalCount] = useState(0);

      useEffect(() => {
        effectLog.push(`mounted-item-${item.id}`);
        return () => {
          effectLog.push(`unmounted-item-${item.id}`);
        };
      }, []);

      return el(
        "li",
        {
          "data-id": item.id,
          onClick: () => {
            selectedId.value = item.id;
            setLocalCount((c: number) => c + 1);
          },
        },
        `${item.name} (clicks: `,
        () => String(localCount()),
        ")",
      );
    });

    const DetailView = cc<{ id: number }>(({ id }) => {
      const [detailCount, setDetailCount] = useState(0);
      const s = signal(100);

      useEffect(() => {
        effectLog.push(`detail-effect-${id}`);
      }, []);

      return el(
        "div",
        { id: "detail" },
        `Detail for ${id} — detailCount: ${detailCount()} — signal: ${s.value}`,
        el(
          "button",
          {
            id: "inc-detail",
            onClick: () => setDetailCount((c: number) => c + 1),
          },
          "inc",
        ),
      );
    });

    const App = cc(() =>
      el(
        "div",
        {},
        el(Key, {
          when: viewKey,
          children: (view: string) =>
            el(Switch, {
              fallback: el("p", {}, "Unknown view"),
              children: [
                el(Match, {
                  when: view === "list",
                  children: el(
                    "div",
                    { id: "list-view" },
                    el("h2", {}, "User List"),
                    el(For, {
                      each: items,
                      key: (item: { id: number }) => item.id,
                      fallback: el("p", {}, "No users"),
                      children: (item: { id: number; name: string }) =>
                        el(ListItem, { item }),
                    }),
                    el(Show, {
                      when: () => selectedId.value !== null,
                      children: () =>
                        el(
                          "p",
                          { id: "selected" },
                          `Selected: ${selectedId.value}`,
                        ),
                    }),
                  ),
                }),
                el(Match, {
                  when: view === "detail" && selectedId.value !== null,
                  children:
                    selectedId.value !== null
                      ? el(DetailView, { id: selectedId.value })
                      : null,
                }),
              ],
            }),
        }),
      ),
    );

    mount(App, container);
    await new Promise((r) => queueMicrotask(() => r(null)));

    // Initial list view
    expect(container.textContent).toContain("User List");
    expect(container.textContent).toContain("Alice (clicks: 0)");
    expect(container.textContent).toContain("Bob (clicks: 0)");
    expect(container.textContent).toContain("Carol (clicks: 0)");
    expect(effectLog).toEqual([
      "mounted-item-1",
      "mounted-item-2",
      "mounted-item-3",
    ]);

    // Click an item — increments local state + sets selectedId
    const aliceLi = container.querySelector(
      '[data-id="1"]',
    ) as unknown as HTMLElement;
    expect(aliceLi).toBeTruthy();
    aliceLi.click();
    await nextTick();
    expect(container.textContent).toContain("Alice (clicks: 1)");
    expect(container.textContent).toContain("Selected: 1");

    // Switch to detail view
    viewKey.value = "detail";
    await nextTick();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(container.textContent).toContain("Detail for 1");
    expect(effectLog).toContain("detail-effect-1");
    // list items soft-hidden: their useEffect cleanups fire
    expect(effectLog).toContain("unmounted-item-1");

    // Switch back to list — Key caches the "list" subtree, preserving state
    viewKey.value = "list";
    await nextTick();
    await new Promise((r) => queueMicrotask(() => r(null)));
    // Alice's count is preserved because Key keeps the subtree alive
    expect(container.textContent).toContain("Alice (clicks: 1)");
    expect(container.textContent).toContain("Bob (clicks: 0)");
    // effects re-fire on soft-show
    expect(effectLog.filter((e) => e === "mounted-item-1").length).toBe(2);

    // Empty the list
    items.value = [];
    await nextTick();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(container.textContent).toContain("No users");

    // Refill list
    items.value = [{ id: 4, name: "Dave" }];
    await nextTick();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(container.textContent).toContain("Dave (clicks: 0)");
  });
});
