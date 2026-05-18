import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { cc } from "../src/component/create.ts";
import { signal } from "../src/reactivity/index.ts";
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
  Virtual,
} from "../src/component/control-flow.ts";
import { raw } from "../src/common/escaper.ts";
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

  it("hydrates Key", async () => {
    const App = cc(() => el(Key, { when: "mykey" }, el("span", {}, "mykey")));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const app = hydrate(App, container);
    expect(container.textContent).toContain("mykey");
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
    expect(container.textContent).toContain("no-match");
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
