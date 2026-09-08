import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { Window } from "happy-dom";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { cc } from "../src/component/create.ts";
import {
  onMounted,
  onUnmounted,
  onUpdated,
  onError,
} from "../src/component/lifecycle.ts";
import { signal } from "../src/reactivity/signal.ts";
import { computed, nextTick } from "../src/reactivity/index.ts";
import { useState } from "../src/react/_client.ts";
import {
  Show,
  For,
  Index,
  Key,
  Switch,
  Match,
  Dynamic,
  Visible,
  PORTAL_TYPE,
  Portal,
  Virtual,
} from "../src/component/control-flow.ts";
import { ErrorBoundary } from "../src/component/control-flow.ts";
import { Suspense } from "../src/react/suspense.ts";
import { ViewTransition } from "../src/react/view-transition.ts";
import { raw } from "../src/common/escaper.ts";
import { jsxs } from "../src/jsx/jsx-runtime.ts";
import type { SinwanElement } from "../src/types.ts";
import {
  _$bindAttr,
  _$bindClass,
  _$bindStyle,
  _$bindText,
} from "../src/renderer/template.ts";

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
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Text = (win as any).Text;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

// ─── hydrateNode branches ───────────────────────────────────────────────────

describe("hydrateNode branches", () => {
  it("hydrates a number child", async () => {
    const App = cc(() => el("div", {}, 42));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("42");
    app.unmount();
  });

  it("hydrates an HtmlEscapedString child", async () => {
    const App = cc(() => el("div", {}, raw("&amp;")));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("&");
    app.unmount();
  });
});

// ─── Control flow hydration ─────────────────────────────────────────────────

describe("hydrateElement control flow", () => {
  it("hydrates Show when=true", async () => {
    const App = cc(() => el(Show, { when: true }, "visible"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("visible");
    app.unmount();
  });

  it("hydrates Show when=false with fallback", async () => {
    const App = cc(() =>
      el(Show, { when: false, fallback: "fallback-text" }, "visible"),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("fallback-text");
    app.unmount();
  });

  it("hydrates For with items", async () => {
    const App = cc(() =>
      el(For, { each: ["a", "b", "c"] }, (item: string, _index: () => number) =>
        el("span", {}, item),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(3);
    app.unmount();
  });

  it("hydrates For with empty array and fallback", async () => {
    const App = cc(() =>
      el(For, { each: [], fallback: "no-items" }, (item: string) =>
        el("span", {}, item),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("no-items");
    app.unmount();
  });

  it("hydrates Switch with Match", async () => {
    const App = cc(() => el(Switch, {}, el(Match, { when: true }, "matched")));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("matched");
    app.unmount();
  });

  it("hydrates Index with items", async () => {
    const App = cc(() =>
      el(Index, { each: ["x", "y"] }, (item: () => string, _index: number) =>
        el("span", {}, item()),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    app.unmount();
  });

  it("hydrates Index with granular signal updates after hydration", async () => {
    const items = signal(["a", "b"]);
    const mountLog: string[] = [];

    const ListItem = cc<{ item: () => string }>(({ item }) => {
      onMounted(() => {
        mountLog.push("mount:" + item());
      });
      return el("span", {}, item);
    });

    const App = cc(() =>
      el(Index, { each: items }, (item: () => string, _index: number) =>
        el(ListItem, { item }),
      ),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);

    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toContain("ab");

    // Mounted hooks fire during hydration
    expect(mountLog).toEqual(["mount:a", "mount:b"]);
    mountLog.length = 0;

    // Granular update — only one item changes
    items.value = ["a", "c"];
    await nextTick();

    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toContain("ac");
    expect(mountLog.length).toBe(0); // No remounts

    app.unmount();
  });

  it("hydrated Index mounts only added items and removes only dropped items", async () => {
    const items = signal(["a", "b"]);
    const mountLog: string[] = [];
    const unmountLog: string[] = [];

    const ListItem = cc<{ item: () => string }>(({ item }) => {
      const initial = item();
      onMounted(() => {
        mountLog.push("mount:" + initial);
      });
      onUnmounted(() => {
        unmountLog.push("unmount:" + initial);
      });
      return el("span", {}, item);
    });

    const App = cc(() =>
      el(Index, { each: items }, (item: () => string, _index: number) =>
        el(ListItem, { item }),
      ),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);

    expect(mountLog).toEqual(["mount:a", "mount:b"]);
    mountLog.length = 0;

    // Add an item — only the new item should mount, no remounts of a/b.
    items.value = ["a", "b", "c"];
    await nextTick();

    expect(container.querySelectorAll("span").length).toBe(3);
    expect(container.textContent).toContain("abc");
    expect(mountLog).toEqual(["mount:c"]);
    expect(unmountLog.length).toBe(0);
    mountLog.length = 0;

    // Remove an item — only the dropped item's DOM is destroyed, no remounts.
    items.value = ["a", "b"];
    await nextTick();

    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toContain("ab");
    expect(mountLog.length).toBe(0);
    expect(unmountLog).toEqual(["unmount:c"]);

    app.unmount();
  });

  it("does not re-render an Index wrapped in a Show when the computed `when` is unchanged", async () => {
    const items = signal(["a", "b", "c"]);
    const isNotEmpty = computed(() => items.value.length > 0);
    const callbackLog: number[] = [];
    const mountLog: string[] = [];

    const ListItem = cc<{ item: () => string }>(({ item }) => {
      const initial = item();
      onMounted(() => {
        mountLog.push("mount:" + initial);
      });
      return el("span", {}, item);
    });

    const App = cc(() =>
      el(
        Show,
        { when: isNotEmpty, fallback: el("p", {}, "empty") },
        el(
          "ul",
          {},
          el(Index, { each: items }, (item: () => string, index: number) => {
            callbackLog.push(index);
            return el(ListItem, { item });
          }),
        ),
      ),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    // Reset logs captured during the (same-process) server render so we only
    // measure client-side hydration behavior.
    callbackLog.length = 0;
    const app = hydrate(App, container);

    expect(container.querySelectorAll("span").length).toBe(3);
    expect(callbackLog).toEqual([0, 1, 2]);
    expect(mountLog).toEqual(["mount:a", "mount:b", "mount:c"]);
    callbackLog.length = 0;
    mountLog.length = 0;

    // Edit the first item — `isNotEmpty` stays true, so the Show must NOT
    // re-render. Only the changed item signal updates its text node.
    items.value = items.value.map((v, i) => (i === 0 ? "z" : v));
    await nextTick();

    expect(container.querySelectorAll("span").length).toBe(3);
    expect(container.textContent).toContain("zbc");
    expect(callbackLog.length).toBe(0); // No <Index> callbacks re-executed
    expect(mountLog.length).toBe(0); // No ListItem re-mounts

    app.unmount();
  });

  it("hydrates Key", async () => {
    const App = cc(() => el(Key, { when: "mykey" }, el("span", {}, "mykey")));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("mykey");
    app.unmount();
  });

  it("hydrates Key with cache=false and fully remounts on key swap", async () => {
    const key = signal<"a" | "b">("a");

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

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: false,
        children: (k: string) => el(Counter, { label: k }),
      }),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);

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

    app.unmount();
  });

  it("hydrates Key with cache=true and restores state on key swap-back", async () => {
    const key = signal<"a" | "b">("a");

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

    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (k: string) => el(Counter, { label: k }),
      }),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);

    expect(container.textContent).toContain("count:0");

    const btn = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    btn.click();
    await nextTick();
    expect(container.textContent).toContain("count:1");

    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("count:0");

    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("count:1");

    app.unmount();
  });

  it("hydrates Dynamic with string component", async () => {
    const App = cc(() => el(Dynamic, { component: "div" }, "dynamic-content"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("dynamic-content");
    app.unmount();
  });

  it("hydrates Dynamic with null component", async () => {
    const App = cc(() => el(Dynamic, { component: null }, "ignored"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).not.toContain("ignored");
    app.unmount();
  });

  it("hydrates Visible", async () => {
    const App = cc(() =>
      el(Visible, { when: true, as: "span" }, "visible-text"),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("visible-text");
    app.unmount();
  });

  it("hydrates Virtual with initial visible window", async () => {
    const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 50,
        containerHeight: 100,
        overscan: 2,
        children: (item: string) => el("div", { class: "row" }, item),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);

    const rows = Array.from(container.querySelectorAll(".row"));
    // scrollTop=0, container fits 2 items, overscan=2 => 0..3 (4 items)
    expect(rows.length).toBe(4);
    expect(rows[0]!.textContent).toBe("item-0");
    expect(rows[3]!.textContent).toBe("item-3");
    app.unmount();
  });

  it("hydrates Virtual fallback when list is empty", async () => {
    const App = cc(() =>
      el(Virtual, {
        each: [],
        itemHeight: 50,
        containerHeight: 100,
        fallback: el("p", { id: "empty" }, "No items"),
        children: (item: string) => el("div", { class: "row" }, item),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("No items");
    app.unmount();
  });
});

// ─── Ref handling ───────────────────────────────────────────────────────────

describe("applyRef", () => {
  it("hydrates with function ref", async () => {
    const calls: (Element | null)[] = [];
    const ref = (el: Element | null) => calls.push(el);
    const App = cc(() => el("div", { ref }, "hello"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(calls.length).toBe(1);
    expect(calls[0]).not.toBeNull();
    expect(typeof calls[0]).toBe("object");
    app.unmount();
    expect(calls.length).toBe(2);
    expect(calls[1]).toBeNull();
  });

  it("hydrates with object ref", async () => {
    const ref = { current: null as Element | null };
    const App = cc(() => el("div", { ref }, "hello"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(ref.current).not.toBeNull();
    app.unmount();
    expect(ref.current).toBeNull();
  });
});

// ─── Hydration mismatch ─────────────────────────────────────────────────────

describe("hydrateIntrinsic mismatch", () => {
  it("warns when expected element node is missing", async () => {
    const App = cc(() => el("div", {}, "hello"));
    const html = await renderToHydratableString(App);
    container.innerHTML = "text" + html;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    const app = hydrate(App, container);
    expect(warnings.some((w) => w.includes("expected <div>"))).toBe(true);

    console.warn = originalWarn;
    app.unmount();
  });
});

// ─── Component returning non-element ────────────────────────────────────────

describe("hydrateComponent non-element", () => {
  it("hydrates component returning a string", async () => {
    const App = cc(() => "hello" as any);
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    app.unmount();
  });

  it("hydrates component returning an array", async () => {
    const App = cc(() => [el("span", {}, "a"), el("span", {}, "b")] as any);
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    app.unmount();
  });
});

// ─── Remaining walk.ts branches ─────────────────────────────────────────────

describe("hydrateNode fallback", () => {
  it("skips a text node for unhandled node types", async () => {
    const App = cc(() => el("div", {}, { foo: "bar" } as any));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

describe("hydrateReactiveText fallbacks", () => {
  it("hydrates reactive text without markers", async () => {
    const App = cc(() => {
      const count = signal(5);
      return el("div", {}, count as any);
    });
    container.innerHTML = "<div>5</div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("5");
    app.unmount();
  });

  it("hydrates reactive text with empty DOM (last resort)", async () => {
    const App = cc(() => {
      const count = signal(5);
      return el("div", {}, count as any);
    });
    container.innerHTML = "<div></div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("5");
    app.unmount();
  });
});

describe("hydrateElement fragments", () => {
  it("hydrates a fragment", async () => {
    const App = cc(() => ({
      tag: "",
      props: {},
      children: [el("span", {}, "a"), el("span", {}, "b")],
    }));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    app.unmount();
  });
});

describe("hydrateControlFlow fallbacks", () => {
  it("hydrates For with empty array and no children function", async () => {
    const App = cc(() => For({ each: [], fallback: "no-items" }));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("no-items");
    app.unmount();
  });

  it("hydrates Index with empty array and no children function", async () => {
    const App = cc(() => Index({ each: [], fallback: "no-items" }));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("no-items");
    app.unmount();
  });

  it("hydrates Show with function children", async () => {
    const App = cc(() =>
      Show({ when: true, children: (value: boolean) => String(value) }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("true");
    app.unmount();
  });

  it("hydrates Show with no fallback when false", async () => {
    const App = cc(() => Show({ when: false }));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toBe("");
    app.unmount();
  });

  it("hydrates Switch with no matching Match and fallback", async () => {
    const App = cc(() =>
      Switch({
        fallback: "no-match",
        children: Match({ when: false, children: "matched" }),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("no-match");
    app.unmount();
  });

  it("hydrates Switch with non-Match children", async () => {
    const App = cc(() =>
      Switch({
        fallback: "no-match",
        children: [
          "not-a-match",
          el("div", {}, "also-not"),
          Match({ when: false, children: "matched" }),
        ] as any,
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("not-a-match");
    expect(container.textContent).not.toContain("no-match");
    app.unmount();
  });
});

describe("applyRef edge cases", () => {
  it("ignores invalid ref values", async () => {
    const App = cc(() => el("div", { ref: 42 as any }, "hello"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    app.unmount();
  });
});

describe("hydrateComponent edge cases", () => {
  it("hydrates nested component returning a string", async () => {
    const Child = cc(() => "hello" as any);
    const App = cc(() =>
      el("div", {}, { tag: Child, props: {}, children: [] } as any),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    app.unmount();
  });

  it("handles nested component that throws during hydration", async () => {
    const consoleErrors: any[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => consoleErrors.push(args);

    let shouldThrow = false;
    const BadChild = cc(() => {
      if (shouldThrow) throw new Error("hydration child boom");
      return el("span", {}, "ok");
    });
    const App = cc(() =>
      el("div", {}, { tag: BadChild, props: {}, children: [] } as any),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    shouldThrow = true;
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();

    console.error = originalConsoleError;
    expect(
      consoleErrors.some((args) =>
        args.some(
          (a: any) =>
            (typeof a === "string" && a.includes("hydration child boom")) ||
            (a instanceof Error && a.message.includes("hydration child boom")),
        ),
      ),
    ).toBe(true);
    app.unmount();
  });
});

// ─── React-compatible state getters (useState / useReducer) ─────────────────

describe("React-compatible state getters", () => {
  const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

  it("hydrates state getter in text content", async () => {
    const countSignal = signal(5);
    const stateGetter = (() => countSignal.value) as any;
    stateGetter[STATE_GETTER_MARKER] = true;
    stateGetter.__signal__ = countSignal;

    const App = cc(() => el("div", {}, stateGetter));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("5");

    // Update the underlying signal and verify DOM updates
    countSignal.value = 10;
    await Bun.sleep(0); // Wait for microtask queue
    expect(container.textContent).toContain("10");

    app.unmount();
  });

  it("hydrates state getter in attributes", async () => {
    const countSignal = signal(5);
    const stateGetter = (() => countSignal.value) as any;
    stateGetter[STATE_GETTER_MARKER] = true;
    stateGetter.__signal__ = countSignal;

    const App = cc(() => el("div", { "data-count": stateGetter }, "hello"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelector("div")?.getAttribute("data-count")).toBe(
      "5",
    );

    // Update the underlying signal and verify attribute updates
    countSignal.value = 10;
    await Bun.sleep(0); // Wait for microtask queue
    expect(container.querySelector("div")?.getAttribute("data-count")).toBe(
      "10",
    );

    app.unmount();
  });
});

// ─── Reactive functions returning complex values ────────────────────────────

describe("hydrateReactiveFunction complex values", () => {
  it("hydrates a reactive function that returns an element", async () => {
    const showSignal = signal(false);
    const child = () =>
      showSignal.value ? el("p", {}, "visible") : (false as any);

    const App = cc(() =>
      el("div", {}, el("span", {}, "before"), child, el("span", {}, "after")),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const app = hydrate(App, container);
    expect(container.textContent).toBe("beforeafter");

    showSignal.value = true;
    await Bun.sleep(0);
    expect(container.textContent).toBe("beforevisibleafter");
    expect(container.querySelectorAll("p").length).toBe(1);

    app.unmount();
  });

  it("hydrates a reactive function that returns an array of elements", async () => {
    const listSignal = signal(["a", "b"]);
    const child = () =>
      listSignal.value.map((item) => el("span", { key: item }, item));

    const App = cc(() => el("div", {}, child));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toBe("ab");

    listSignal.value = [...listSignal.value, "c"];
    await Bun.sleep(0);
    expect(container.querySelectorAll("span").length).toBe(3);
    expect(container.textContent).toBe("abc");

    app.unmount();
  });
});

// ─── Adjacent text node hydration ───────────────────────────────────────────

describe("hydration recovery and binding lifecycle", () => {
  for (const html of ["<div>1</div>", "<div></div>"]) {
    it(`updates and disposes reactive text recovered from ${html}`, async () => {
      const count = signal(1);
      const updates: number[] = [];
      const App = cc(() => {
        onUpdated(() => updates.push(count.value));
        return el("div", {}, count);
      });
      container.innerHTML = html;
      const app = hydrate(App, container);
      const text = container.querySelector("div")?.firstChild;
      try {
        expect(text?.textContent).toBe("1");
        count.value = 2;
        await nextTick();
        expect(text?.textContent).toBe("2");
        expect(updates).toEqual([2]);
      } finally {
        app.unmount();
        container.remove();
      }
      count.value = 3;
      await nextTick();
      expect(text?.textContent).toBe("2");
      expect(updates).toEqual([2]);
    });
  }

  for (const html of [
    "<div>old<span>tail</span></div>",
    "<div><!--sinwan-r-->old<span>tail</span></div>",
    "<div><!--sinwan-r-->old</div>",
  ]) {
    it(`recovers function anchors and keeps adjacent content for ${html}`, async () => {
      const value = signal("old");
      const hasTail = html.includes("tail");
      const App = cc(() =>
        el(
          "div",
          {},
          () => value.value,
          ...(hasTail ? [el("span", {}, "tail")] : []),
        ),
      );
      container.innerHTML = html;
      const tail = container.querySelector("span");
      const app = hydrate(App, container);
      try {
        value.value = "new";
        await nextTick();
        expect(container.textContent).toBe(hasTail ? "newtail" : "new");
        expect(container.querySelector("span")).toBe(tail);
      } finally {
        app.unmount();
        container.remove();
      }
    });
  }

  it("recovers an empty markerless function slot before a sibling", async () => {
    const visible = signal(false);
    const App = cc(() =>
      el(
        "div",
        {},
        () => (visible.value ? el("b", {}, "shown") : null),
        el("span", {}, "tail"),
      ),
    );
    container.innerHTML = "<div><span>tail</span></div>";
    const tail = container.querySelector("span");
    const app = hydrate(App, container);
    try {
      visible.value = true;
      await nextTick();
      expect(container.textContent).toBe("showntail");
      expect(container.querySelector("span")).toBe(tail);
      visible.value = false;
      await nextTick();
      expect(container.textContent).toBe("tail");
    } finally {
      app.unmount();
      container.remove();
    }
  });

  it("hydrates compiler binding descriptors on intrinsic attributes and children", async () => {
    const value = signal("first");
    const active = signal(true);
    const updates: string[] = [];
    const App = cc(() => {
      onUpdated(() => updates.push(value.value));
      return el(
        "div",
        {
          title: _$bindAttr("title", () => value.value),
          class: _$bindClass(() => ({ active: active.value })),
          style: _$bindStyle(() =>
            active.value
              ? { color: "red", marginTop: "2px" }
              : { color: "blue" },
          ),
        },
        _$bindText(() => value.value),
      );
    });
    container.innerHTML = await renderToHydratableString(App);
    const div = container.querySelector("div");
    const app = hydrate(App, container);
    try {
      expect(container.querySelector("div")).toBe(div);
      expect(div?.title).toBe("first");
      expect(div?.className).toBe("active");
      value.value = "second";
      active.value = false;
      await nextTick();
      expect(div?.title).toBe("second");
      expect(div?.textContent).toBe("second");
      expect(div?.className).toBe("");
      expect(div?.style.color).toBe("blue");
      expect(div?.style.marginTop).toBe("");
      expect(updates).toEqual(["second"]);
    } finally {
      app.unmount();
      container.remove();
    }
    value.value = "disposed";
    await nextTick();
    expect(div?.title).toBe("second");
    expect(updates).toEqual(["second"]);
  });
});

describe("hydrated virtual list scrolling", () => {
  it("reuses overlapping keyed rows, repositions reordered rows and disposes scrolling", async () => {
    const initial = Array.from({ length: 8 }, (_, id) => ({
      id,
      name: `row-${id}`,
    }));
    const items = signal(initial);
    const App = cc(() =>
      Virtual({
        each: items,
        key: (item) => item.id,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        minRendered: 4,
        children: (item, index) =>
          el("span", { "data-id": item.id }, `${item.name}:${index()}`),
      }),
    );
    container.innerHTML = await renderToHydratableString(App);
    const scroller = container.firstElementChild;
    if (!scroller || !("scrollTop" in scroller))
      throw new Error("missing virtual scroller");
    const app = hydrate(App, container);
    const first = container.querySelector('[data-id="0"]');
    const overlap = container.querySelector('[data-id="2"]');
    try {
      expect(container.querySelectorAll("span")).toHaveLength(4);
      scroller.scrollTop = 40;
      scroller.dispatchEvent(new window.Event("scroll"));
      await nextTick();
      expect(container.querySelectorAll("span")).toHaveLength(4);
      expect(container.querySelector('[data-id="0"]')).toBeNull();
      expect(container.querySelector('[data-id="2"]')).toBe(overlap);
      expect(container.querySelector('[data-id="4"]')?.textContent).toBe(
        "row-4:4",
      );

      items.value = [
        initial[0]!,
        initial[2]!,
        initial[1]!,
        ...initial.slice(3),
      ];
      await nextTick();
      expect(container.querySelector('[data-id="2"]')).toBe(overlap);
      expect(overlap?.parentElement?.style.top).toBe("20px");

      scroller.scrollTop = 140;
      scroller.dispatchEvent(new window.Event("scroll"));
      await nextTick();
      expect(container.querySelectorAll("span")).toHaveLength(4);
      expect(container.querySelector('[data-id="7"]')?.textContent).toBe(
        "row-7:7",
      );
      expect(first?.isConnected).toBe(false);
    } finally {
      app.unmount();
      container.remove();
    }
    // After unmount, the scroll effect and listener must be disposed.
    // The detached scroller retains its last content but must not react
    // to signal changes or scroll events.
    const contentAfterUnmount = scroller.textContent;
    items.value = initial.slice(0, 2);
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new window.Event("scroll"));
    await nextTick();
    expect(scroller.textContent).toBe(contentAfterUnmount);
    expect(scroller.isConnected).toBe(false);
  });
});

describe("hydrate adjacent text nodes", () => {
  it("hydrates JSXText + explicit space + JSXText without mismatches", async () => {
    const App = cc(() =>
      jsxs("p", {
        children: [
          "\n          Progression globale du Sprint :",
          " ",
          "\n          ",
          jsxs("strong", { children: ["0%"] }),
          "\n        ",
        ],
      }),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const consoleSpy: any[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => consoleSpy.push(args);

    const app = hydrate(App, container);

    console.warn = originalWarn;

    expect(container.querySelector("strong")?.textContent).toBe("0%");
    expect(container.textContent).toContain("Progression globale du Sprint :");
    expect(container.textContent).toContain("0%");
    expect(
      consoleSpy.some((args) =>
        String(args[0]).includes("[Sinwan hydration] expected"),
      ),
    ).toBe(false);

    app.unmount();
  });
});

// ─── hydrateNode: state getter with __signal__ (line 168) ──────────────────

describe("hydrateNode state getter with __signal__", () => {
  it("hydrates state getter whose __signal__ is a computed", async () => {
    const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");
    const base = signal(5);
    const doubled = computed(() => base.value * 2);
    const stateGetter = (() => doubled.value) as any;
    stateGetter[STATE_GETTER_MARKER] = true;
    stateGetter.__signal__ = doubled;

    const App = cc(() => el("div", {}, stateGetter));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("10");
    base.value = 10;
    await Bun.sleep(0);
    expect(container.textContent).toContain("20");
    app.unmount();
  });
});

// ─── hydrateNode: template result (lines 191-194) ──────────────────────────

describe("hydrateNode template result", () => {
  it("hydrates a compiler-generated template result child", async () => {
    const { _$createTemplate, setHydrationMode } =
      await import("../src/renderer/template.ts");
    const val = signal("hello");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = [_$bindText(() => val.value)];

    // Force live template result creation even during hydration
    const App = cc(() => {
      setHydrationMode(false);
      const tr = _$createTemplate(def, dynamics);
      setHydrationMode(true);
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    val.value = "world";
    await nextTick();
    expect(container.textContent).toContain("world");
    app.unmount();
  });
});

// ─── hydrateReactiveText: insertBefore with anchor (line 299) ───────────────

describe("hydrateReactiveText insertBefore", () => {
  // Line 299 (insertBefore with anchor) is unreachable: advance() at line 280
  // consumes any non-null cursor.current, so the last-resort path only runs
  // when cursor.current is null, which means anchor is also null.
  // Test the reachable last-resort path (appendChild when cursor is null).
  it("creates new text node via appendChild when cursor is at end", async () => {
    const val = signal("dynamic");
    const App = cc(() => el("div", {}, val));
    container.innerHTML = "<div></div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("dynamic");
    val.value = "updated";
    await nextTick();
    expect(container.textContent).toContain("updated");
    app.unmount();
  });
});

// ─── hydrateReactiveFunction: anchor insertion (lines 353, 401) ────────────

describe("hydrateReactiveFunction anchor insertion", () => {
  it("inserts start/end anchors when no server markers and siblings exist", async () => {
    const val = signal("mid");
    const App = cc(() =>
      el(
        "div",
        {},
        el("span", {}, "before"),
        () => val.value,
        el("span", {}, "after"),
      ),
    );
    container.innerHTML = "<div><span>before</span>mid<span>after</span></div>";
    const app = hydrate(App, container);
    expect(container.textContent).toBe("beforemidafter");
    val.value = "changed";
    await nextTick();
    expect(container.textContent).toBe("beforechangedafter");
    app.unmount();
  });
});

// ─── hydrateElement: Portal and fallback (lines 718, 745, 747) ─────────────

describe("hydrateElement Portal and fallback", () => {
  it("hydrates a Portal element", async () => {
    const portalTarget = doc.createElement("div");
    portalTarget.id = "portal-target";
    doc.body.appendChild(portalTarget);

    const App = cc(() =>
      el(Portal, { mount: portalTarget }, el("span", {}, "portal-content")),
    );
    // Portal SSR output is empty — content goes to the target element
    container.innerHTML = "";
    const app = hydrate(App, container);
    expect(portalTarget.textContent).toContain("portal-content");
    app.unmount();
    doc.body.removeChild(portalTarget);
  });

  it("hydrates element with non-string non-function tag (fallback to array)", async () => {
    const App = cc(() =>
      el("div", {}, {
        tag: 42,
        props: {},
        children: [el("span", {}, "x")],
      } as any),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

// ─── For: empty list with children fn (lines 921-922) and trailing sibling (966) ─

describe("For hydration edge cases", () => {
  it("hydrates For with empty each signal and later adds items", async () => {
    const items = signal<string[]>([]);
    const App = cc(() =>
      el(For, { each: items }, (item: string) => el("span", {}, item)),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(0);
    items.value = ["a", "b"];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toContain("ab");
    app.unmount();
  });

  it("hydrates For with items and trailing sibling", async () => {
    const App = cc(() =>
      el(
        "div",
        {},
        el(For, { each: ["a", "b"] }, (item: string) => el("span", {}, item)),
        el("span", { id: "tail" }, "tail"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(3);
    expect(container.querySelector("#tail")?.textContent).toBe("tail");
    app.unmount();
  });
});

// ─── Index: empty list with children fn, trailing sibling, updates ─────────

describe("Index hydration edge cases", () => {
  it("hydrates Index with empty list, children fn, and fallback", async () => {
    const App = cc(() =>
      el(Index, { each: [], fallback: "empty" }, (item: () => string) =>
        el("span", {}, item()),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("empty");
    app.unmount();
  });

  it("hydrates Index with items and trailing sibling", async () => {
    const App = cc(() =>
      el(
        "div",
        {},
        el(Index, { each: ["x", "y"] }, (item: () => string) =>
          el("span", {}, item()),
        ),
        el("span", { id: "tail" }, "tail"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(3);
    expect(container.querySelector("#tail")).toBeTruthy();
    app.unmount();
  });

  it("empties and refills Index after hydration", async () => {
    const items = signal(["a", "b"]);
    const App = cc(() =>
      el(Index, { each: items, fallback: "empty" }, (item: () => string) =>
        el("span", {}, item()),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    items.value = [];
    await nextTick();
    expect(container.textContent).toContain("empty");
    items.value = ["c", "d"];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(2);
    expect(container.textContent).toContain("cd");
    app.unmount();
  });
});

// ─── Virtual: no children fn, broken DOM (lines 1197, 1237, 1242) ──────────

describe("Virtual hydration edge cases", () => {
  it("hydrates Virtual with no children function", async () => {
    const App = cc(() =>
      el(Virtual, {
        each: ["a", "b"],
        itemHeight: 50,
        containerHeight: 100,
        children: "not-a-function" as any,
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });

  it("hydrates Virtual with missing container div", async () => {
    const App = cc(() =>
      el(Virtual, {
        each: ["a", "b"],
        itemHeight: 50,
        containerHeight: 100,
        children: (item: string) => el("div", {}, item),
      }),
    );
    // Text node instead of element — containerDiv.nodeType !== 1
    container.innerHTML = "just text";
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });

  it("hydrates Virtual with non-element rendered rows", async () => {
    const App = cc(() =>
      el(Virtual, {
        each: ["a", "b"],
        itemHeight: 50,
        containerHeight: 100,
        children: (item: string) => item, // returns string, not element
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

// ─── hydrateComponent: promise throw and error boundary (lines 1476-1491) ──

describe("hydrateComponent error paths", () => {
  it("catches promise thrown by component inside Suspense", async () => {
    let thrown = false;
    const pending = Promise.resolve("late");
    const AsyncChild = cc(() => {
      if (!thrown) {
        thrown = true;
        throw pending;
      }
      return el("span", {}, "late");
    });
    const App = cc(() =>
      el(
        Suspense,
        { fallback: el("p", { id: "loading" }, "loading") },
        el(AsyncChild),
      ),
    );
    // SSR can't render a throwing async child — manually set up fallback DOM
    container.innerHTML = '<p id="loading">loading</p>';
    const app = hydrate(App, container);
    expect(container.textContent).toContain("loading");
    await Bun.sleep(0);
    expect(container.textContent).toContain("late");
    app.unmount();
  });

  it("returns placeholder when component throws and ErrorBoundary handles it", async () => {
    const Throwing = cc(() => {
      throw new Error("hydration-boom");
    });
    const App = cc(() =>
      el(ErrorBoundary, { fallback: "caught" }, el(Throwing)),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("caught");
    app.unmount();
  });

  it("returns placeholder when component throws and parent has onError hook", async () => {
    const Throwing = cc(() => {
      throw new Error("child-boom");
    });
    let caughtError: Error | null = null;
    const Parent = cc(() => {
      onError((err: Error) => {
        caughtError = err;
      });
      return el(Throwing);
    });
    const App = cc(() => el("div", {}, el(Parent)));
    // Set up DOM with a text placeholder for the throwing child
    container.innerHTML = "<div>placeholder</div>";
    const app = hydrate(App, container);
    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError!.message).toBe("child-boom");
    app.unmount();
  });
});

// ─── hydrateErrorBoundary: function fallback and initial error (lines 1582-1625) ─

describe("hydrateErrorBoundary edge cases", () => {
  it("renders function fallback on initial error with reset", async () => {
    let shouldThrow = true;
    const Throwing = cc(() => {
      if (shouldThrow) throw new Error("initial-boom");
      return el("span", {}, "recovered");
    });
    const App = cc(() =>
      el(
        ErrorBoundary,
        {
          fallback: (_err: Error, reset: () => void) => {
            return el(
              "button",
              {
                id: "retry",
                onClick: () => {
                  shouldThrow = false;
                  reset();
                },
              },
              "retry",
            );
          },
        },
        el(Throwing),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelector("#retry")).toBeTruthy();
    shouldThrow = false;
    container
      .querySelector("#retry")!
      .dispatchEvent(new (window as any).Event("click", { bubbles: true }));
    await nextTick();
    expect(container.textContent).toContain("recovered");
    app.unmount();
  });

  it("renders fallback on re-render error after hydration", async () => {
    let shouldThrow = false;
    const trigger = signal(0);
    const Child = cc(() => {
      void trigger.value;
      if (shouldThrow) throw new Error("rerender-boom");
      return el("span", {}, "ok");
    });
    const App = cc(() =>
      el(ErrorBoundary, { fallback: "caught-rerender" }, el(Child)),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("ok");
    shouldThrow = true;
    trigger.value = 1;
    await nextTick();
    expect(container.textContent).toContain("caught-rerender");
    app.unmount();
  });

  it("renders function fallback on re-render error after hydration", async () => {
    let shouldThrow = true;
    const Throwing = cc(() => {
      if (shouldThrow) throw new Error("always-boom");
      return el("span", {}, "recovered");
    });
    let resetFn: () => void = () => {};
    const App = cc(() =>
      el(
        ErrorBoundary,
        {
          fallback: (_err: Error, reset: () => void) => {
            resetFn = reset;
            return el("p", { id: "err-fallback" }, "error");
          },
        },
        el(Throwing),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelector("#err-fallback")).toBeTruthy();
    // Call reset — child throws again → function fallback called on re-render
    resetFn();
    await nextTick();
    expect(container.querySelector("#err-fallback")).toBeTruthy();
    // Now let the child recover
    shouldThrow = false;
    resetFn();
    await nextTick();
    expect(container.textContent).toContain("recovered");
    app.unmount();
  });
});

// ─── hydrateSuspense: normal hydration, promise throw, re-render (lines 1721-1800) ─

describe("hydrateSuspense edge cases", () => {
  it("hydrates Suspense with normal children", async () => {
    const App = cc(() =>
      el(
        Suspense,
        { fallback: el("p", {}, "loading") },
        el("span", {}, "content"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("content");
    app.unmount();
  });

  it("hydrates Suspense with child that throws a promise on initial hydration", async () => {
    let thrown = false;
    const pending = Promise.resolve("late-data");
    const AsyncChild = cc(() => {
      if (!thrown) {
        thrown = true;
        throw pending;
      }
      return el("span", {}, "late-data");
    });
    const App = cc(() =>
      el(
        Suspense,
        { fallback: el("p", { id: "loading" }, "loading") },
        el(AsyncChild),
      ),
    );
    // SSR can't render a throwing async child — manually set up fallback DOM
    container.innerHTML = '<p id="loading">loading</p>';
    const app = hydrate(App, container);
    expect(container.textContent).toContain("loading");
    await Bun.sleep(0);
    expect(container.textContent).toContain("late-data");
    app.unmount();
  });

  it("re-renders Suspense fallback when child throws promise on update", async () => {
    const trigger = signal(0);
    let shouldThrow = false;
    const Child = cc(() => {
      void trigger.value;
      if (shouldThrow) throw Promise.resolve("re-suspend");
      return el("span", {}, "content");
    });
    const App = cc(() =>
      el(
        Suspense,
        { fallback: el("p", { id: "loading" }, "loading") },
        el(Child),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("content");
    shouldThrow = true;
    trigger.value = 1;
    await nextTick();
    expect(container.textContent).toContain("loading");
    app.unmount();
  });
});

// ─── hydrateViewTransition: no name, missing wrapper (lines 1920, 1925) ─────

describe("hydrateViewTransition edge cases", () => {
  it("hydrates ViewTransition with no name prop", async () => {
    const App = cc(() =>
      el(ViewTransition, { children: el("span", {}, "vt-content") } as any),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("vt-content");
    app.unmount();
  });

  it("hydrates ViewTransition with mismatched DOM (no wrapper element)", async () => {
    const App = cc(() =>
      el(ViewTransition, {
        name: "fade",
        children: el("span", {}, "vt-content"),
      } as any),
    );
    // Set up a text node instead of an element so the wrapper check fails
    container.innerHTML = "just text";
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

// ─── hydrateKey: same key early return (line 2013) ──────────────────────────

describe("hydrateKey same key", () => {
  it("does not re-render when key resolves to the same value", async () => {
    const key = signal("a");
    const trigger = signal(0);
    const mountLog: string[] = [];
    const Child = cc<{ label: string }>(({ label }) => {
      onMounted(() => mountLog.push("mount:" + label));
      return el("span", {}, label);
    });
    // Use a getter that depends on trigger but returns the same key value,
    // so the effect re-runs but Object.is(currentKey, newKey) is true.
    const App = cc(() =>
      el(Key, {
        when: () => {
          void trigger.value;
          return key.value;
        },
        children: (k: string) => el(Child, { label: k }),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(mountLog).toEqual(["mount:a"]);
    mountLog.length = 0;
    // Bump trigger — effect re-runs but key is still "a" → early return
    trigger.value = 1;
    await nextTick();
    expect(mountLog.length).toBe(0);
    key.value = "b";
    await nextTick();
    expect(mountLog).toEqual(["mount:b"]);
    app.unmount();
  });
});

// ─── makeReactiveBlock: Show/Dynamic toggle, Switch/For toggle (lines 2134, 2204, 2208, 2237, 2242) ─

describe("makeReactiveBlock post-hydration updates", () => {
  it("toggles Show after hydration (getCompareValue branch)", async () => {
    const visible = signal(true);
    const App = cc(() =>
      el(
        Show,
        { when: visible, fallback: "hidden" },
        el("span", {}, "visible"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("visible");
    visible.value = false;
    await nextTick();
    expect(container.textContent).toContain("hidden");
    visible.value = true;
    await nextTick();
    expect(container.textContent).toContain("visible");
    app.unmount();
  });

  it("toggles Dynamic after hydration (getCompareValue branch)", async () => {
    const comp = signal<string | null>("div");
    const App = cc(() => el(Dynamic, { component: comp }, "dynamic-content"));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("dynamic-content");
    comp.value = "span";
    await nextTick();
    expect(container.querySelector("span")).toBeTruthy();
    comp.value = null;
    await nextTick();
    expect(container.textContent).not.toContain("dynamic-content");
    app.unmount();
  });

  it("toggles Switch match after hydration (no-compare branch)", async () => {
    const state = signal("a");
    const App = cc(() =>
      el(
        Switch,
        {},
        el(Match, { when: () => state.value === "a" }, "A"),
        el(Match, { when: () => state.value === "b" }, "B"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("A");
    state.value = "b";
    await nextTick();
    expect(container.textContent).toContain("B");
    app.unmount();
  });

  it("changes empty For to non-empty after hydration (no-compare branch)", async () => {
    const items = signal<string[]>([]);
    const App = cc(() =>
      el(For, { each: items, fallback: "empty" }, (item: string) =>
        el("span", {}, item),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("empty");
    items.value = ["x"];
    await nextTick();
    expect(container.textContent).toContain("x");
    app.unmount();
  });
});

// ─── fireMountedForSubtree (lines 1957-1962) ───────────────────────────────

describe("fireMountedForSubtree", () => {
  it("fires onMounted for nested components inside Key swap", async () => {
    const key = signal("a");
    const mountLog: string[] = [];
    const Child = cc<{ label: string }>(({ label }) => {
      onMounted(() => mountLog.push("mount:" + label));
      return el("div", {}, el("span", {}, label));
    });
    const App = cc(() =>
      el(Key, { when: key, children: (k: string) => el(Child, { label: k }) }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(mountLog).toEqual(["mount:a"]);
    mountLog.length = 0;
    key.value = "b";
    await nextTick();
    expect(mountLog).toEqual(["mount:b"]);
    app.unmount();
  });
});

// ─── hydrateTemplateResult edge cases (lines 472, 483, 498-499) ────────────

describe("hydrateTemplateResult edge cases", () => {
  it("appends anchor when cursor is at end and inserts live nodes without SSR", async () => {
    const { _$createTemplate, setHydrationMode } =
      await import("../src/renderer/template.ts");
    const val = signal("hello");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = [_$bindText(() => val.value)];

    const App = cc(() => {
      setHydrationMode(false);
      const tr = _$createTemplate(def, dynamics);
      setHydrationMode(true);
      return el("div", {}, tr as any);
    });
    // Empty div — no SSR content for the template
    container.innerHTML = "<div></div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    app.unmount();
  });

  it("handles text-only template fragment (text node top-level)", async () => {
    const { _$createTemplate, setHydrationMode } =
      await import("../src/renderer/template.ts");
    const val = signal("txt");
    const def = {
      html: "<!--s:0-->",
      slots: [{ path: [], type: "child" as const }],
    };
    const dynamics = [_$bindText(() => val.value)];

    const App = cc(() => {
      setHydrationMode(false);
      const tr = _$createTemplate(def, dynamics);
      setHydrationMode(true);
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("txt");
    app.unmount();
  });
});

// ─── hydrateServerTemplateResult: resolveChildGetter paths (lines 656, 659, 663-664) ─

describe("hydrateServerTemplateResult edge cases", () => {
  it("hydrates server template with binding descriptor dynamics", async () => {
    const { SINWAN_SERVER_TEMPLATE, _$bindText } =
      await import("../src/renderer/template.ts");
    const val = signal("hello");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = [_$bindText(() => val.value)];

    const App = cc(() => {
      const tr = { [SINWAN_SERVER_TEMPLATE]: true as const, def, dynamics };
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    val.value = "world";
    await nextTick();
    expect(container.textContent).toContain("world");
    app.unmount();
  });

  it("hydrates server template with signal dynamics", async () => {
    const { SINWAN_SERVER_TEMPLATE } =
      await import("../src/renderer/template.ts");
    const val = signal("sig-val");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = [val]; // Signal directly

    const App = cc(() => {
      const tr = { [SINWAN_SERVER_TEMPLATE]: true as const, def, dynamics };
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("sig-val");
    app.unmount();
  });

  it("hydrates server template with function getter dynamics", async () => {
    const { SINWAN_SERVER_TEMPLATE } =
      await import("../src/renderer/template.ts");
    const val = signal("fn-val");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = [() => val.value]; // Function getter

    const App = cc(() => {
      const tr = { [SINWAN_SERVER_TEMPLATE]: true as const, def, dynamics };
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("fn-val");
    app.unmount();
  });

  it("hydrates server template with non-reactive dynamics", async () => {
    const { SINWAN_SERVER_TEMPLATE } =
      await import("../src/renderer/template.ts");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = ["static-val"]; // Non-reactive string

    const App = cc(() => {
      const tr = { [SINWAN_SERVER_TEMPLATE]: true as const, def, dynamics };
      return el("div", {}, tr as any);
    });
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("static-val");
    app.unmount();
  });
});

// ─── makeReactiveBlock: no DOM nodes, null content (lines 2134, 2237) ───────

describe("makeReactiveBlock edge cases", () => {
  it("returns initialMounted when no DOM nodes (Show with no fallback)", async () => {
    const visible = signal(false);
    const App = cc(() =>
      el(Show, { when: visible }, el("span", {}, "content")),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    // when=false, no fallback → no DOM nodes for initial content
    visible.value = true;
    await nextTick();
    expect(container.textContent).toContain("content");
    app.unmount();
  });

  it("handles null content in compare branch (Show toggles to false with no fallback)", async () => {
    const visible = signal(true);
    const App = cc(() =>
      el(Show, { when: visible }, el("span", {}, "content")),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("content");
    visible.value = false;
    await nextTick();
    expect(container.textContent).not.toContain("content");
    app.unmount();
  });
});

function explodingElement(message: string): SinwanElement {
  return {
    get tag() {
      throw new Error(message);
    },
    props: {},
    children: [],
  } as unknown as SinwanElement;
}

describe("hydrateNode state getter without a valid signal", () => {
  it("falls through when the getter marker has no usable __signal__", async () => {
    const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");
    function tagged(_unused: unknown) {
      return "hello";
    }
    (tagged as any)[STATE_GETTER_MARKER] = true;
    (tagged as any).__signal__ = { not: "a-signal" };

    const App = cc(() => el("div", {}, tagged as any));
    container.innerHTML = "<div>hello</div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("hello");
    app.unmount();
  });
});

describe("hydrateReactiveFunction empty parent", () => {
  it("appends start and end anchors when the cursor has no current node", async () => {
    const val = signal("dynamic");
    const App = cc(() => el("div", {}, () => val.value));
    container.innerHTML = "<div></div>";
    const app = hydrate(App, container);
    val.value = "updated";
    await nextTick();
    expect(container.textContent).toContain("updated");
    app.unmount();
  });
});

describe("Index children replaced after hydration", () => {
  it("clears hydrated Index items when children is no longer a function", async () => {
    const items = signal(["a", "b"]);
    const indexProps: Record<string, unknown> = {
      each: items,
      children: (item: () => string) => el("span", {}, item()),
    };
    const App = cc(() => Index(indexProps as any));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelectorAll("span").length).toBe(2);
    indexProps.children = "not-a-function";
    items.value = ["c"];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(0);
    app.unmount();
  });
});

describe("Virtual hydration missing content div", () => {
  it("hydrates Virtual when the container has no element child", async () => {
    const App = cc(() =>
      el(Virtual, {
        each: ["a", "b"],
        itemHeight: 50,
        containerHeight: 100,
        children: (item: string) => el("div", {}, item),
      }),
    );
    container.innerHTML = "<div></div>";
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

describe("hydrateSuspense remaining error paths", () => {
  it("removes already-rendered nodes when a later sibling suspends on update", async () => {
    const trigger = signal(0);
    let shouldThrow = false;
    const Child = cc(() => {
      void trigger.value;
      if (shouldThrow) throw Promise.resolve("re-suspend");
      return el("span", { id: "late" }, "late");
    });
    const App = cc(() =>
      el(Suspense, { fallback: el("p", { id: "loading" }, "loading") }, [
        el("span", { id: "first" }, "first"),
        el(Child),
      ]),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.querySelector("#first")).toBeTruthy();
    shouldThrow = true;
    trigger.value = 1;
    await nextTick();
    expect(container.textContent).toContain("loading");
    app.unmount();
  });

  it("rethrows non-thenable errors from Suspense updates after a retry", async () => {
    const trigger = signal(0);
    let throwPromise = false;
    const Child = cc(() => {
      void trigger.value;
      if (throwPromise) throw Promise.resolve("retry");
      return el("span", { id: "ok" }, "ok");
    });
    const kids: any[] = [el(Child)];
    const App = cc(() =>
      el(Suspense, { fallback: el("p", {}, "loading") }, kids),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("ok");

    throwPromise = true;
    trigger.value = 1;
    await nextTick();
    expect(container.textContent).toContain("loading");

    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      throwPromise = false;
      kids.push(explodingElement("suspense-update-boom"));
      await Bun.sleep(0);
      expect(
        errors.mock.calls.some((args) =>
          String(args[0] ?? "").includes("[Sinwan] Effect flush error:"),
        ),
      ).toBe(true);
    } finally {
      errors.mockRestore();
      app.unmount();
    }
  });

  it("rethrows non-thenable errors during initial Suspense hydration", async () => {
    const Throwing = cc(() => {
      throw new Error("suspense-initial-boom");
    });
    const App = cc(() =>
      el(
        Suspense,
        { fallback: el("p", {}, "loading") },
        el(Throwing),
      ),
    );
    container.innerHTML = "<p>loading</p>";
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });
});

describe("fireMountedForSubtree nested element children", () => {
  it("fires onMounted for a component wrapped in an element inside Key", async () => {
    const key = signal("a");
    const mountLog: string[] = [];
    const Child = cc<{ label: string }>(({ label }) => {
      onMounted(() => mountLog.push("mount:" + label));
      return el("span", {}, label);
    });
    const App = cc(() =>
      el(Key, {
        when: key,
        children: (k: string) => el("div", {}, el(Child, { label: k })),
      }),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(mountLog).toEqual(["mount:a"]);
    mountLog.length = 0;
    key.value = "b";
    await nextTick();
    expect(mountLog).toEqual(["mount:b"]);
    app.unmount();
  });
});

describe("makeReactiveBlock remaining branches", () => {
  it("returns the original mounted node when Show hydrates with no DOM nodes", async () => {
    const App = cc(() => el(Show, { when: true }, ""));
    container.innerHTML = "";
    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    app.unmount();
  });

  it("logs compare-branch errors when rendering replacement Show content throws", async () => {
    const visible = signal(true);
    let explode = false;
    const App = cc(() =>
      el(
        Show,
        { when: visible, fallback: "hidden" },
        () =>
          explode ? explodingElement("show-boom") : el("span", {}, "visible"),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("visible");
    visible.value = false;
    await nextTick();
    explode = true;
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      visible.value = true;
      await nextTick();
      expect(
        errors.mock.calls.some((args) =>
          String(args[0] ?? "").includes("[Sinwan hydration reactive block]"),
        ),
      ).toBe(true);
    } finally {
      errors.mockRestore();
      app.unmount();
    }
  });

  it("clears Switch content when the gate becomes falsy with no fallback", async () => {
    const gate = signal(true);
    const App = cc(() =>
      el(Switch, { when: gate }, el(Match, { when: true }, "A")),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("A");
    gate.value = false;
    await nextTick();
    expect(container.textContent).not.toContain("A");
    app.unmount();
  });

  it("logs no-compare-branch errors when Switch replacement content throws", async () => {
    const state = signal("a");
    const App = cc(() =>
      el(
        Switch,
        {},
        el(Match, { when: () => state.value === "a" }, "A"),
        el(Match, { when: () => state.value === "b" }, explodingElement("switch-boom")),
      ),
    );
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("A");
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      state.value = "b";
      await nextTick();
      expect(
        errors.mock.calls.some((args) =>
          String(args[0] ?? "").includes("[Sinwan hydration reactive block]"),
        ),
      ).toBe(true);
    } finally {
      errors.mockRestore();
      app.unmount();
    }
  });
});

describe("hydrateServerTemplateResult static child in-place", () => {
  it("skips a reactive effect for a static child slot", async () => {
    const { SINWAN_SERVER_TEMPLATE } =
      await import("../src/renderer/template.ts");
    const { DEFAULT_HYDRATION_ADAPTER } =
      await import("../src/hydration/markers.ts");
    const { hydrateNode } = await import("../src/hydration/walk.ts");
    const def = {
      html: "<span><!--s:0--></span>",
      slots: [{ path: [0], type: "child" as const }],
    };
    const dynamics = ["static-val"];
    container.innerHTML =
      "<span><!--sinwan-t:0-->static-val<!--/sinwan-t--></span>";
    const mounted = hydrateNode(
      { [SINWAN_SERVER_TEMPLATE]: true as const, def, dynamics } as any,
      {
        parent: container,
        current: container.firstChild,
        adapter: DEFAULT_HYDRATION_ADAPTER,
      },
    );
    expect(container.textContent).toContain("static-val");
    expect(mounted).toBeDefined();
  });
});
