import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import { signal, computed, nextTick } from "../src/reactivity/index.ts";
import {
  Show,
  For,
  Index,
  Key,
  Switch,
  Match,
  Dynamic,
} from "../src/component/control-flow.ts";
import type { SinwanElement } from "../src/types.ts";

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children.length === 1 ? children[0] : children;
  }
  return { tag: tag as any, props: finalProps, children };
}

let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

/**
 * Hydrate a component, resetting any logs captured during the (same-process)
 * server render so we only measure client-side hydration + update behavior.
 */
async function hydrateApp(App: Function, reset?: () => void) {
  const html = await renderToHydratableString(App as any);
  container.innerHTML = html;
  reset?.();
  return hydrate(App as any, container);
}

describe("post-hydration update behavior", () => {
  it("Show: toggling `when` swaps content; stable `when` does NOT re-render", async () => {
    const flag = signal(true);
    const mountLog: string[] = [];

    const Child = cc<{ label: string }>(({ label }) => {
      onMounted(() => mountLog.push("mount:" + label));
      return el("span", {}, label);
    });

    const App = cc(() =>
      el(
        Show,
        { when: flag, fallback: el(Child, { label: "off" }) },
        el(Child, { label: "on" }),
      ),
    );

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(container.textContent).toContain("on");
    expect(mountLog).toEqual(["mount:on"]);
    mountLog.length = 0;

    // Toggle → content must swap, fallback mounts.
    flag.value = false;
    await nextTick();
    expect(container.textContent).toContain("off");
    expect(mountLog).toEqual(["mount:off"]);
    mountLog.length = 0;

    // Re-assign same value → no re-render.
    flag.value = false;
    await nextTick();
    expect(mountLog.length).toBe(0);

    app.unmount();
  });

  it("Show wrapping a list: editing an item does NOT re-render via a stable computed `when`", async () => {
    const items = signal(["a", "b", "c"]);
    const notEmpty = computed(() => items.value.length > 0);
    const mountLog: string[] = [];

    const Row = cc<{ item: () => string }>(({ item }) => {
      const initial = item();
      onMounted(() => mountLog.push("mount:" + initial));
      return el("li", {}, item);
    });

    const App = cc(() =>
      el(
        Show,
        { when: notEmpty, fallback: el("p", {}, "empty") },
        el(
          "ul",
          {},
          el(Index, { each: items }, (item: () => string) => el(Row, { item })),
        ),
      ),
    );

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(mountLog).toEqual(["mount:a", "mount:b", "mount:c"]);
    mountLog.length = 0;

    items.value = items.value.map((v, i) => (i === 1 ? "B" : v));
    await nextTick();
    expect(container.textContent).toContain("aBc");
    expect(mountLog.length).toBe(0);

    app.unmount();
  });

  it("Index: edit updates only the signal; add/remove only touch the delta", async () => {
    const items = signal(["a", "b"]);
    const mountLog: string[] = [];
    const unmountLog: string[] = [];

    const Row = cc<{ item: () => string }>(({ item }) => {
      const initial = item();
      onMounted(() => mountLog.push("mount:" + initial));
      onUnmounted(() => unmountLog.push("unmount:" + initial));
      return el("span", {}, item);
    });

    const App = cc(() =>
      el(Index, { each: items }, (item: () => string) => el(Row, { item })),
    );

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(mountLog).toEqual(["mount:a", "mount:b"]);
    mountLog.length = 0;

    // Edit
    items.value = ["z", "b"];
    await nextTick();
    expect(container.textContent).toContain("zb");
    expect(mountLog.length).toBe(0);

    // Add
    items.value = ["z", "b", "c"];
    await nextTick();
    expect(mountLog).toEqual(["mount:c"]);
    mountLog.length = 0;

    // Remove
    items.value = ["z", "b"];
    await nextTick();
    expect(unmountLog).toEqual(["unmount:c"]);

    app.unmount();
  });

  it("Switch: changing the matched branch swaps content", async () => {
    const mode = signal<"a" | "b">("a");

    const App = cc(() =>
      el(
        Switch,
        { fallback: el("span", {}, "none") },
        el(
          Match,
          { when: computed(() => mode.value === "a") },
          el("span", {}, "A"),
        ),
        el(
          Match,
          { when: computed(() => mode.value === "b") },
          el("span", {}, "B"),
        ),
      ),
    );

    const app = await hydrateApp(App);
    expect(container.textContent).toContain("A");

    mode.value = "b";
    await nextTick();
    expect(container.textContent).toContain("B");
    expect(container.textContent).not.toContain("A");

    app.unmount();
  });

  it("Dynamic: changing tag swaps element; stable tag does NOT re-render", async () => {
    const tag = signal<"h1" | "h2">("h1");
    const App = cc(() => el(Dynamic, { component: tag }, "title"));

    const app = await hydrateApp(App);
    expect(container.querySelector("h1")).toBeTruthy();

    tag.value = "h2";
    await nextTick();
    expect(container.querySelector("h2")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();

    app.unmount();
  });

  it("Key: changing key remounts; stable key does NOT remount", async () => {
    const k = signal("k1");
    const mountLog: string[] = [];

    const Child = cc(() => {
      onMounted(() => mountLog.push("mount"));
      return el("span", {}, k);
    });

    const App = cc(() => el(Key, { when: k }, el(Child, {})));

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(mountLog.length).toBe(1);
    mountLog.length = 0;

    // Same key → no remount
    k.value = "k1";
    await nextTick();
    expect(mountLog.length).toBe(0);

    // New key → remount
    k.value = "k2";
    await nextTick();
    expect(mountLog.length).toBe(1);

    app.unmount();
  });

  it("For: updating one item should NOT re-mount the whole list (keyed reconciliation parity)", async () => {
    const items = signal([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ]);
    const mountLog: string[] = [];

    const Row = cc<{ name: string }>(({ name }) => {
      onMounted(() => mountLog.push("mount:" + name));
      return el("li", {}, name);
    });

    const App = cc(() =>
      el(
        For,
        { each: items, key: (it: { id: number }) => it.id },
        (it: { id: number; name: string }) => el(Row, { name: it.name }),
      ),
    );

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(mountLog).toEqual(["mount:a", "mount:b", "mount:c"]);
    mountLog.length = 0;

    // Edit only the first row, preserving references for rows 2 & 3 (mirrors a
    // typical `list.map((it, i) => i === 0 ? {...} : it)` update).
    const prev = items.value;
    items.value = prev.map((it, i) => (i === 0 ? { id: 1, name: "A" } : it));
    await nextTick();

    expect(container.textContent).toContain("Abc");
    // Keyed reconciliation reuses rows 2 & 3 (same reference) — only row 1
    // re-renders. (Client renderForBlock behaves identically.)
    expect(mountLog).toEqual(["mount:A"]);

    app.unmount();
  });

  it("For: appending an item only mounts the new row (reuses existing)", async () => {
    const items = signal([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    const mountLog: string[] = [];

    const Row = cc<{ name: string }>(({ name }) => {
      onMounted(() => mountLog.push("mount:" + name));
      return el("li", {}, name);
    });

    const App = cc(() =>
      el(
        For,
        { each: items, key: (it: { id: number }) => it.id },
        (it: { id: number; name: string }) => el(Row, { name: it.name }),
      ),
    );

    const app = await hydrateApp(App, () => (mountLog.length = 0));
    expect(mountLog).toEqual(["mount:a", "mount:b"]);
    mountLog.length = 0;

    const prev = items.value;
    items.value = [...prev, { id: 3, name: "c" }];
    await nextTick();

    expect(container.textContent).toContain("abc");
    expect(mountLog).toEqual(["mount:c"]);

    app.unmount();
  });
});
