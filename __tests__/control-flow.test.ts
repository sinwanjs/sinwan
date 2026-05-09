/**
 * SinwanJS Control Flow — Unit Tests
 *
 * Covers the public <Show> and <For> helpers added for 1.0.0.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal, computed, nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { createComponent } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Match,
  Portal,
  Show,
  Switch,
  Visible,
} from "../src/component/control-flow.ts";
import type { SinwanElement } from "../src/types.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  container = doc.createElement("div");
  doc.body.appendChild(container);
});

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

function byTag(parent: Node, tag: string): HTMLElement[] {
  return Array.from(
    (parent as HTMLElement).getElementsByTagName(tag),
  ) as unknown as HTMLElement[];
}

describe("Show", () => {
  it("swaps truthy and fallback branches reactively", async () => {
    const visible = signal(false);

    const App = createComponent(() =>
      el(
        "section",
        {},
        el(Show, {
          when: visible,
          fallback: el("p", { id: "fallback" }, "hidden"),
          children: el("strong", { id: "truthy" }, "visible"),
        }),
      ),
    );

    mount(App, container);
    expect(container.textContent).toBe("hidden");
    expect(byTag(container, "strong").length).toBe(0);

    visible.value = true;
    await nextTick();
    expect(container.textContent).toBe("visible");
    expect(byTag(container, "p").length).toBe(0);

    visible.value = false;
    await nextTick();
    expect(container.textContent).toBe("hidden");
  });

  it("passes the non-null value to function children", async () => {
    const name = signal<string | null>("Ada");

    const App = createComponent(() =>
      el(Show, {
        when: name,
        fallback: "empty",
        children: (value: string) => el("span", {}, value.toUpperCase()),
      }),
    );

    mount(App, container);
    expect(container.textContent).toBe("ADA");

    name.value = null;
    await nextTick();
    expect(container.textContent).toBe("empty");

    name.value = "Linus";
    await nextTick();
    expect(container.textContent).toBe("LINUS");
  });

  it("unmounts the old branch and mounts newly inserted component subtrees", async () => {
    const visible = signal(false);
    const log: string[] = [];

    const Child = createComponent(() => {
      onMounted(() => log.push("mounted"));
      onUnmounted(() => log.push("unmounted"));
      return el("span", {}, "child");
    });

    const App = createComponent(() =>
      el(Show, {
        when: visible,
        fallback: "empty",
        children: { tag: Child, props: {}, children: [] },
      }),
    );

    mount(App, container);
    expect(log).toEqual([]);
    expect(container.textContent).toBe("empty");

    visible.value = true;
    await nextTick();
    expect(container.textContent).toBe("child");
    expect(log).toEqual(["mounted"]);

    visible.value = false;
    await nextTick();
    expect(container.textContent).toBe("empty");
    expect(log).toEqual(["mounted", "unmounted"]);
  });
});

describe("For", () => {
  it("renders fallback for empty lists", async () => {
    const items = signal<string[]>([]);

    const App = createComponent(() =>
      el(
        "ul",
        {},
        el(For, {
          each: items,
          fallback: el("li", { id: "empty" }, "empty"),
          children: (item: string) => el("li", {}, item),
        }),
      ),
    );

    mount(App, container);
    expect(container.textContent).toBe("empty");

    items.value = ["A"];
    await nextTick();
    expect(container.textContent).toBe("A");

    items.value = [];
    await nextTick();
    expect(container.textContent).toBe("empty");
  });

  it("renders, reorders, inserts, removes, and updates keyed rows", async () => {
    type Item = { id: string; label: string };
    const a = { id: "a", label: "A" };
    const b = { id: "b", label: "B" };
    const c = { id: "c", label: "C" };
    const items = signal<Item[]>([a, b]);
    const clicked: string[] = [];
    const lifecycle: string[] = [];

    const Row = createComponent<{
      item: Item;
      index: () => number;
    }>(({ item, index }) => {
      onMounted(() => lifecycle.push(`mounted:${item.id}`));
      onUnmounted(() => lifecycle.push(`unmounted:${item.id}`));
      return el(
        "li",
        {
          "data-id": item.id,
          onClick: () => clicked.push(`${item.id}:${index()}`),
        },
        item.label,
      );
    });

    const App = createComponent(() =>
      el(
        "ul",
        {},
        el(For, {
          each: items,
          key: (item: Item) => item.id,
          children: (item: Item, index: () => number) => ({
            tag: Row,
            props: { item, index },
            children: [],
          }),
        }),
      ),
    );

    mount(App, container);
    let rows = byTag(container, "li");
    const firstA = rows[0]!;
    expect(rows.map((row) => row.textContent)).toEqual(["A", "B"]);
    expect(lifecycle).toEqual(["mounted:a", "mounted:b"]);

    items.value = [b, a, c];
    await nextTick();
    rows = byTag(container, "li");
    expect(rows.map((row) => row.getAttribute("data-id"))).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(rows[1]).toBe(firstA);
    rows[1]!.click();
    expect(clicked).toEqual(["a:1"]);
    expect(lifecycle).toEqual(["mounted:a", "mounted:b", "mounted:c"]);

    items.value = [b, { id: "a", label: "A2" }];
    await nextTick();
    rows = byTag(container, "li");
    expect(rows.map((row) => row.textContent)).toEqual(["B", "A2"]);
    expect(rows[1]).not.toBe(firstA);
    expect(lifecycle).toEqual([
      "mounted:a",
      "mounted:b",
      "mounted:c",
      "unmounted:a",
      "unmounted:c",
      "mounted:a",
    ]);
  });

  it("works with Show fallback when list toggles empty/non-empty", async () => {
    type Item = { id: string; label: string };
    const items = signal<Item[]>([]);
    const isEmpty = computed(() => items.value.length === 0);

    const App = createComponent(() =>
      el(
        "ul",
        {},
        el(Show, {
          when: isEmpty,
          fallback: el(For, {
            each: items,
            key: (item: Item) => item.id,
            children: (item: Item) => el("li", { "data-id": item.id }, item.label),
          }),
          children: el("li", { id: "empty" }, "No todos yet!"),
        }),
      ),
    );

    mount(App, container);
    expect(container.textContent).toBe("No todos yet!");
    expect(byTag(container, "li").length).toBe(1);

    items.value = [{ id: "a", label: "A" }];
    await nextTick();
    expect(container.textContent).toBe("A");
    expect(byTag(container, "li").map((row) => row.getAttribute("data-id"))).toEqual([
      "a",
    ]);

    items.value = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    await nextTick();
    expect(byTag(container, "li").map((row) => row.textContent)).toEqual([
      "A",
      "B",
    ]);

    items.value = [];
    await nextTick();
    expect(container.textContent).toBe("No todos yet!");
    expect(byTag(container, "li").length).toBe(1);
  });
});

describe("Switch/Match", () => {
  it("renders the first truthy match and then fallback", async () => {
    const status = signal<"idle" | "loading" | "done">("idle");

    const App = createComponent(() =>
      el(Switch, {
        fallback: el("p", {}, "fallback"),
        children: [
          el(Match, {
            when: computed(() => status.value === "loading"),
            children: el("p", {}, "loading"),
          }),
          el(Match, {
            when: computed(() => status.value === "done"),
            children: (value: boolean) => el("p", {}, value ? "done" : "nope"),
          }),
        ],
      }),
    );

    mount(App, container);
    expect(container.textContent).toBe("fallback");

    status.value = "loading";
    await nextTick();
    expect(container.textContent).toBe("loading");

    status.value = "done";
    await nextTick();
    expect(container.textContent).toBe("done");
  });
});

describe("Index", () => {
  it("keeps rows mounted by index while item accessors update", async () => {
    const items = signal([{ label: "A" }, { label: "B" }]);
    const lifecycle: string[] = [];

    const Row = createComponent<{
      item: () => { label: string };
      index: number;
    }>(({ item, index }) => {
      const label = computed(() => item().label);
      onMounted(() => lifecycle.push(`mounted:${index}`));
      onUnmounted(() => lifecycle.push(`unmounted:${index}`));
      return el("li", { "data-index": index }, label as any);
    });

    const App = createComponent(() =>
      el(
        "ul",
        {},
        el(Index, {
          each: items,
          fallback: el("li", {}, "empty"),
          children: (item: () => { label: string }, index: number) => ({
            tag: Row,
            props: { item, index },
            children: [],
          }),
        }),
      ),
    );

    mount(App, container);
    let rows = byTag(container, "li");
    const firstRow = rows[0]!;
    expect(rows.map((row) => row.textContent)).toEqual(["A", "B"]);
    expect(lifecycle).toEqual(["mounted:0", "mounted:1"]);

    items.value = [{ label: "A2" }, { label: "B2" }];
    await nextTick();
    rows = byTag(container, "li");
    expect(rows[0]).toBe(firstRow);
    expect(rows.map((row) => row.textContent)).toEqual(["A2", "B2"]);
    expect(lifecycle).toEqual(["mounted:0", "mounted:1"]);

    items.value = [];
    await nextTick();
    expect(container.textContent).toBe("empty");
    expect(lifecycle).toEqual([
      "mounted:0",
      "mounted:1",
      "unmounted:0",
      "unmounted:1",
    ]);
  });
});

describe("Key", () => {
  it("remounts its subtree when the key changes", async () => {
    const id = signal("a");
    const lifecycle: string[] = [];

    const Child = createComponent<{ id: string }>(({ id }) => {
      onMounted(() => lifecycle.push(`mounted:${id}`));
      onUnmounted(() => lifecycle.push(`unmounted:${id}`));
      return el("span", {}, id);
    });

    const App = createComponent(() =>
      el(Key, {
        when: id,
        children: (value: string) => ({ tag: Child, props: { id: value }, children: [] }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toBe("a");
    expect(lifecycle).toEqual(["mounted:a"]);

    id.value = "b";
    await nextTick();
    expect(container.textContent).toBe("b");
    expect(lifecycle).toEqual(["mounted:a", "unmounted:a", "mounted:b"]);
  });
});

describe("Dynamic", () => {
  it("remounts when the dynamic tag changes", async () => {
    const tag = signal<"button" | "a">("button");

    const App = createComponent(() =>
      el(Dynamic, {
        component: tag,
        href: "/next",
        children: "Go",
      }),
    );

    mount(App, container);
    expect(byTag(container, "button").length).toBe(1);
    expect(container.textContent).toBe("Go");

    tag.value = "a";
    await nextTick();
    expect(byTag(container, "button").length).toBe(0);
    expect(byTag(container, "a")[0]!.getAttribute("href")).toBe("/next");
  });
});

describe("Visible", () => {
  it("toggles display without unmounting children", async () => {
    const visible = signal(false);
    const lifecycle: string[] = [];

    const Child = createComponent(() => {
      onMounted(() => lifecycle.push("mounted"));
      onUnmounted(() => lifecycle.push("unmounted"));
      return el("span", {}, "child");
    });

    const App = createComponent(() =>
      el(
        Visible,
        { when: visible, as: "div", class: "panel" },
        { tag: Child, props: {}, children: [] },
      ),
    );

    mount(App, container);
    const panel = byTag(container, "div")[0]!;
    expect(panel.style.display).toBe("none");
    expect(lifecycle).toEqual(["mounted"]);

    visible.value = true;
    await nextTick();
    expect(panel.style.display).toBe("");
    expect(lifecycle).toEqual(["mounted"]);
  });
});

describe("Portal", () => {
  it("renders into a target and cleans up on unmount", () => {
    const target = doc.createElement("div");
    doc.body.appendChild(target);

    const App = createComponent(() =>
      el("section", {}, el(Portal, { mount: target, children: el("span", {}, "ported") })),
    );

    const app = mount(App, container);
    expect(container.textContent).toBe("");
    expect(target.textContent).toBe("ported");

    app.unmount();
    expect(target.textContent).toBe("");
  });
});
