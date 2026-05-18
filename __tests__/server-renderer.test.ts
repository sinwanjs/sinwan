import { describe, it, expect } from "bun:test";
import { signal, computed } from "../src/reactivity/index.ts";
import {
  registerPage,
  getPage,
  hasPage,
  renderPage,
  renderToString,
  isSlots,
} from "../src/server/renderer.ts";
import { HtmlEscapedString, raw } from "../src/escaper.ts";
import {
  Show,
  For,
  Switch,
  Match,
  Index,
  Key,
  Dynamic,
  Portal,
  Visible,
} from "../src/component/control-flow.ts";
import { cc } from "../src/component/create.ts";
import { ACTIVITY_TYPE } from "../src/component/control-flow.ts";
import { island } from "../src/component/island.ts";
import type { SinwanElement } from "../src/types.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag: tag as any, props: { ...props, children }, children };
}

describe("page registry", () => {
  it("registerPage, getPage, hasPage, renderPage work end-to-end", async () => {
    const Home = cc<{ title: string }>((data) => el("h1", {}, data.title));
    registerPage("home", Home as any);
    expect(hasPage("home")).toBe(true);
    expect(getPage<{ title: string }>("home" as any)).toBe(Home);
    const html = await renderPage("home", { title: "Hello" });
    expect(html).toContain("<h1>Hello</h1>");
  });

  it("renderPage throws when page is not registered", async () => {
    expect(renderPage("missing", {})).rejects.toThrow(
      'Page "missing" not found in registry',
    );
  });

  it("getPage returns undefined for missing pages", () => {
    expect(getPage("missing")).toBeUndefined();
  });

  it("hasPage returns false for missing pages", () => {
    expect(hasPage("missing")).toBe(false);
  });
});

describe("renderToString primitives", () => {
  it("renders null, undefined, and boolean as empty string", async () => {
    expect(await renderToString(null)).toBe("");
    expect(await renderToString(undefined)).toBe("");
    expect(await renderToString(true)).toBe("");
    expect(await renderToString(false)).toBe("");
  });

  it("renders and escapes strings", async () => {
    expect(await renderToString("<script>")).toBe("&lt;script&gt;");
  });

  it("renders numbers", async () => {
    expect(await renderToString(42)).toBe("42");
    expect(await renderToString(0)).toBe("0");
  });

  it("renders HtmlEscapedString raw", async () => {
    const safe = raw("<b>bold</b>");
    expect(await renderToString(safe)).toBe("<b>bold</b>");
  });

  it("renders signals as escaped text", async () => {
    const s = signal("<tag>");
    expect(await renderToString(s as any)).toBe("&lt;tag&gt;");
  });

  it("renders computed as escaped text", async () => {
    const s = signal(1);
    const c = computed(() => s.value + 1);
    expect(await renderToString(c as any)).toBe("2");
  });

  it("renders state getter functions", async () => {
    const getter = () => "hello";
    (getter as any)[STATE_GETTER_MARKER] = true;
    expect(await renderToString(getter as any)).toBe("hello");
  });

  it("renders arrays by concatenating children", async () => {
    const html = await renderToString([
      el("span", {}, "a"),
      el("span", {}, "b"),
    ]);
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  it("renders promises by awaiting", async () => {
    const html = await renderToString(Promise.resolve(el("div", {}, "async")));
    expect(html).toBe("<div>async</div>");
  });
});

describe("renderToString elements", () => {
  it("renders void elements without closing tag", async () => {
    expect(await renderToString(el("input", { type: "text" }))).toBe(
      '<input type="text">',
    );
  });

  it("renders intrinsic elements with children", async () => {
    expect(await renderToString(el("p", {}, "hello"))).toBe("<p>hello</p>");
  });

  it("strips event props", async () => {
    const html = await renderToString(
      el("button", { onClick: () => {} }, "click"),
    );
    expect(html).toBe("<button>click</button>");
  });

  it("strips null/false attributes", async () => {
    const html = await renderToString(
      el("div", { hidden: null, active: false, title: "ok" }),
    );
    expect(html).toBe('<div title="ok"></div>');
  });

  it("supports dangerouslySetInnerHTML", async () => {
    const html = await renderToString(
      el("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
    );
    expect(html).toBe("<div><b>raw</b></div>");
  });

  it("renders functional components", async () => {
    const Comp = cc<{ msg: string }>(({ msg }) => el("span", {}, msg));
    expect(await renderToString(el(Comp, { msg: "hi" }))).toBe(
      "<span>hi</span>",
    );
  });

  it("renders async functional components", async () => {
    const AsyncComp = cc(async () => el("div", {}, "async"));
    expect(await renderToString(el(AsyncComp, {}))).toBe("<div>async</div>");
  });
});

describe("renderToString control flow", () => {
  it("renders Show when true", async () => {
    const html = await renderToString({
      tag: Show,
      props: { when: true, fallback: "no", children: () => el("b", {}, "yes") },
      children: [],
    });
    expect(html).toBe("<b>yes</b>");
  });

  it("renders Show when false with fallback", async () => {
    const html = await renderToString({
      tag: Show,
      props: { when: false, fallback: el("i", {}, "no") },
      children: [],
    });
    expect(html).toBe("<i>no</i>");
  });

  it("renders Show when false without fallback", async () => {
    const html = await renderToString({
      tag: Show,
      props: { when: false },
      children: [],
    });
    expect(html).toBe("");
  });

  it("renders For with items", async () => {
    const html = await renderToString({
      tag: For,
      props: {
        each: ["a", "b", "c"],
        children: (item: string) => el("li", {}, item),
      },
      children: [],
    });
    expect(html).toBe("<li>a</li><li>b</li><li>c</li>");
  });

  it("renders For with empty array and fallback", async () => {
    const html = await renderToString({
      tag: For,
      props: {
        each: [],
        fallback: el("p", {}, "empty"),
        children: (item: string) => el("li", {}, item),
      },
      children: [],
    });
    expect(html).toBe("<p>empty</p>");
  });

  it("renders For without children function", async () => {
    const html = await renderToString({
      tag: For,
      props: { each: [1, 2] },
      children: [],
    });
    expect(html).toBe("");
  });

  it("renders Switch/Match", async () => {
    const html = await renderToString({
      tag: Switch,
      props: {
        children: [
          {
            tag: Match,
            props: { when: false, children: "a" },
            children: ["a"],
          },
          { tag: Match, props: { when: true, children: "b" }, children: ["b"] },
          { tag: Match, props: { when: true, children: "c" }, children: ["c"] },
        ],
      },
      children: [],
    });
    expect(html).toBe("b");
  });

  it("renders Match with function children", async () => {
    const html = await renderToString({
      tag: Match,
      props: { when: true, children: (v: boolean) => el("span", {}, "ok") },
      children: [],
    });
    expect(html).toBe("<span>ok</span>");
  });

  it("renders Match when false as empty", async () => {
    const html = await renderToString({
      tag: Match,
      props: { when: false, fallback: "fallback", children: "content" },
      children: [],
    });
    expect(html).toBe("");
  });

  it("renders Index with items", async () => {
    const html = await renderToString({
      tag: Index,
      props: {
        each: ["x", "y"],
        children: (item: () => string, index: number) =>
          el("span", {}, `${index}-${item()}`),
      },
      children: [],
    });
    expect(html).toBe("<span>0-x</span><span>1-y</span>");
  });

  it("renders Index with empty array and fallback", async () => {
    const html = await renderToString({
      tag: Index,
      props: {
        each: [],
        fallback: "empty",
        children: (item: any, i: number) => "x",
      },
      children: [],
    });
    expect(html).toBe("empty");
  });

  it("renders Key", async () => {
    const html = await renderToString({
      tag: Key,
      props: { when: "mykey", children: (k: string) => el("b", {}, k) },
      children: [],
    });
    expect(html).toBe("<b>mykey</b>");
  });

  it("renders Dynamic with string tag", async () => {
    const html = await renderToString(
      el(Dynamic, { component: "section" }, "content"),
    );
    expect(html).toBe("<section>content</section>");
  });

  it("renders Dynamic with function tag", async () => {
    const Func = cc(() => el("em", {}, "func"));
    const html = await renderToString(
      el(Dynamic, { component: Func }, "ignored"),
    );
    expect(html).toBe("<em>func</em>");
  });

  it("renders Dynamic with invalid tag as empty", async () => {
    const html = await renderToString(
      el(Dynamic, { component: 123 }, "content"),
    );
    expect(html).toBe("");
  });

  it("renders Portal as empty", async () => {
    const html = await renderToString(
      el(Portal, { mount: "body" }, el("div", {}, "portal")),
    );
    expect(html).toBe("");
  });

  it("renders Visible", async () => {
    const html = await renderToString(el(Visible, { when: true }, "shown"));
    expect(html).toContain("shown");
  });

  it("renders Activity visible mode", async () => {
    const html = await renderToString({
      tag: ACTIVITY_TYPE,
      props: { mode: "visible", children: "hello" },
      children: ["hello"],
    });
    expect(html).toBe("hello");
  });

  it("renders Activity hidden mode", async () => {
    const html = await renderToString({
      tag: ACTIVITY_TYPE,
      props: { mode: "hidden", children: "hello" },
      children: ["hello"],
    });
    expect(html).toContain('data-sinwan-activity="hidden"');
    expect(html).toContain("hello");
  });
});

describe("renderToString islands", () => {
  it("renders an island element", async () => {
    const Inner = cc<{ msg: string }>(({ msg }) => el("span", {}, msg));
    const Island = island(Inner, { name: "test" });
    const html = await renderToString(el(Island as any, { msg: "hi" }));
    expect(html).toContain('data-sinwan-island="test"');
    expect(html).toContain("<span");
    expect(html).toContain(">hi</span>");
  });

  it("throws when island props serialization fails", async () => {
    const Inner = cc(() => el("span", {}, "x"));
    const Island = island(Inner, { name: "bad" });
    const node = (Island as any)({});
    // Mutate serializeProps to throw
    (node.props as any).__island.serializeProps = () => {
      throw new Error("bad props");
    };
    expect(renderToString(node)).rejects.toThrow("bad props");
  });
});

describe("isSlots", () => {
  it("returns true for plain objects", () => {
    expect(isSlots({ header: "hi" })).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isSlots(["a", "b"])).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSlots(null)).toBe(false);
  });

  it("returns false for HtmlEscapedString", () => {
    expect(isSlots(raw("<b>"))).toBe(false);
  });
});
