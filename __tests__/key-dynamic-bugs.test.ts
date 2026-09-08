/**
 * Reproduction tests for Key component dynamic swap bugs.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import { Key } from "../src/component/control-flow.ts";
import { useState } from "../src/react/_client.ts";
import type { SinwanElement } from "../src/types.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { _$createTemplate, _$bindText } from "../src/renderer/template.ts";

let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Text = (win as any).Text;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
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

describe("Key — event preservation on key swap", () => {
  it("preserves onClick after swapping back to a previous key", async () => {
    const key = signal<"a" | "b">("a");
    let clicks = 0;

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) =>
          el("button", { onClick: () => clicks++ }, `btn-${k}`),
      }),
    );

    mount(App, container);
    const btn1 = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    btn1.click();
    expect(clicks).toBe(1);

    key.value = "b";
    await nextTick();
    const btn2 = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    btn2.click();
    expect(clicks).toBe(2);

    key.value = "a";
    await nextTick();
    const btn3 = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    btn3.click();
    expect(clicks).toBe(3);
  });
});

describe("Key — React hooks preservation on key swap", () => {
  it("preserves useState when swapping back to a previous key", async () => {
    const key = signal<"a" | "b">("a");

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) => el(Counter, { label: k }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toContain("count:0");

    // increment
    let btn = container.getElementsByTagName("button")[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("count:1");

    // switch to b
    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("count:0");

    // switch back to a
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("count:1");
  });
});

const Counter = cc<{ label: string }>(({ label }) => {
  const [count, setCount] = useState(0);
  return el(
    "div",
    {},
    `${label}:`,
    el("span", {}, () => `count:${count()}`),
    el("button", { onClick: () => setCount((c: number) => c + 1) }, "inc"),
  );
});

describe("Key — lifecycle consistency on key swap", () => {
  it("fires consistent mount/unmount when swapping keys", async () => {
    const key = signal<"a" | "b">("a");
    const log: string[] = [];

    const Child = cc<{ id: string }>(({ id }) => {
      onMounted(() => log.push(`mounted:${id}`));
      onUnmounted(() => log.push(`unmounted:${id}`));
      return el("span", {}, id);
    });

    const App = cc(() =>
      el(Key, {
        when: key,
        children: (k: string) => el(Child, { id: k }),
      }),
    );

    mount(App, container);
    expect(log).toEqual(["mounted:a"]);

    key.value = "b";
    await nextTick();
    expect(log).toEqual(["mounted:a", "unmounted:a", "mounted:b"]);

    key.value = "a";
    await nextTick();
    expect(log).toEqual([
      "mounted:a",
      "unmounted:a",
      "mounted:b",
      "unmounted:b",
      "mounted:a",
    ]);
  });
});

describe("Key — reactivity preservation on key swap", () => {
  it("keeps internal signals reactive after returning to a key", async () => {
    const key = signal<"a" | "b">("a");

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) => el(ReactiveChild, { id: k }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toContain("val:0");

    let btn = container.getElementsByTagName("button")[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("val:1");

    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("val:0");

    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("val:1");

    btn = container.getElementsByTagName("button")[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("val:2");
  });
});

const ReactiveChild = cc<{ id: string }>(({ id }) => {
  const s = signal(0);
  return el(
    "div",
    {},
    () => `val:${s.value}`,
    el("button", { onClick: () => (s.value = s.value + 1) }, "inc"),
  );
});

describe("Key — cache=false React-style unmount/remount", () => {
  it("fully resets useState when swapping back to a previous key", async () => {
    const key = signal<"a" | "b">("a");

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: false,
        children: (k: string) => el(Counter, { label: k }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toContain("count:0");

    // increment
    let btn = container.getElementsByTagName("button")[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("count:1");

    // switch to b
    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("count:0");

    // switch back to a — state is fully reset because cache=false
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("count:0");
  });

  it("fires mount/unmount on every key change without reusing cached instances", async () => {
    const key = signal<"a" | "b">("a");
    const log: string[] = [];

    const Child = cc<{ id: string }>(({ id }) => {
      onMounted(() => log.push(`mounted:${id}`));
      onUnmounted(() => log.push(`unmounted:${id}`));
      return el("span", {}, id);
    });

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: false,
        children: (k: string) => el(Child, { id: k }),
      }),
    );

    mount(App, container);
    expect(log).toEqual(["mounted:a"]);

    key.value = "b";
    await nextTick();
    expect(log).toEqual(["mounted:a", "unmounted:a", "mounted:b"]);

    key.value = "a";
    await nextTick();
    // a is freshly remounted, not reused from cache
    expect(log).toEqual([
      "mounted:a",
      "unmounted:a",
      "mounted:b",
      "unmounted:b",
      "mounted:a",
    ]);
  });

  it("fully remounts DOM nodes on every key change", async () => {
    const key = signal<"a" | "b">("a");

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: false,
        children: (k: string) => el("div", { id: k }, k),
      }),
    );

    mount(App, container);
    let div = container.querySelector("#a") as unknown as HTMLElement;
    expect(div).toBeTruthy();
    const firstA = div;

    key.value = "b";
    await nextTick();
    expect(container.querySelector("#a")).toBeNull();
    div = container.querySelector("#b") as unknown as HTMLElement;
    expect(div).toBeTruthy();

    key.value = "a";
    await nextTick();
    div = container.querySelector("#a") as unknown as HTMLElement;
    expect(div).toBeTruthy();
    // DOM node is recreated, not the same cached instance
    expect(div).not.toBe(firstA);
  });
});

describe("Key — omitted cache remounts (React-style)", () => {
  it("resets useState when cache is not specified", async () => {
    const key = signal<"a" | "b">("a");

    const App = cc(() =>
      el(Key, {
        when: key,
        children: (k: string) => el(Counter, { label: k }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toContain("count:0");

    const btn = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("count:1");

    key.value = "b";
    await nextTick();
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("count:0");
    expect(container.textContent).not.toContain("count:1");
  });

  it("does not leave both keys in the DOM", async () => {
    const key = signal("a");
    const App = cc(() =>
      el(Key, {
        when: key,
        children: (k: string) => el("span", { class: "item" }, k),
      }),
    );
    mount(App, container);
    expect(container.querySelectorAll(".item").length).toBe(1);

    key.value = "b";
    await nextTick();
    expect(container.querySelectorAll(".item").length).toBe(1);
    expect(container.textContent).toBe("b");
  });
});

describe("Key — cache=true compiled template bindings survive hide/show", () => {
  it("keeps template text bindings live after returning to a key", async () => {
    const key = signal<"a" | "b">("a");
    const count = signal(0);
    const def = {
      html: "<span class='n'><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };

    const Compiled = cc(() =>
      _$createTemplate(def, [_$bindText(() => `n:${count.value}`)]),
    );

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) => el(Compiled as any, { id: k }),
      }),
    );

    mount(App, container);
    expect(container.textContent).toContain("n:0");

    key.value = "b";
    await nextTick();
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("n:0");

    count.value = 3;
    await nextTick();
    expect(container.textContent).toContain("n:3");
  });

  it("disposes cached entries when the Key owner unmounts", async () => {
    const key = signal<"a" | "b">("a");
    const log: string[] = [];
    const Child = cc<{ id: string }>(({ id }) => {
      onUnmounted(() => log.push(`u:${id}`));
      return el("span", {}, id);
    });
    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) => el(Child, { id: k }),
      }),
    );
    const app = mount(App, container);
    key.value = "b";
    await nextTick();
    app.unmount();
    expect(log).toContain("u:a");
    expect(log).toContain("u:b");
  });
});

describe("Key — hydration does not remount until the key changes", () => {
  it("keeps the hydrated DOM node when cache is omitted", async () => {
    const key = signal("a");
    const App = cc(() =>
      el(Key, {
        when: key,
        children: (k: string) => el("span", { id: "k" }, k),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const before = container.querySelector("#k");
    hydrate(App, container);
    await nextTick();
    expect(container.querySelector("#k")).toBe(before);
    expect(container.textContent).toContain("a");
  });
});
