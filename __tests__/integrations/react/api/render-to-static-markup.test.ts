/**
 * Comprehensive tests for `renderToStaticMarkup`.
 *
 * Tests mirror the React `renderToStaticMarkup` documentation sections.
 */

import { describe, it, expect } from "bun:test";
import { renderToStaticMarkup } from "../../../../src/integrations/react/render-to-static-markup.ts";
import { useId } from "../../../../src/integrations/react/use-id.ts";
import type { SinwanElement } from "../../../../src/types.ts";

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ──────────────────────────────────────────────────────────────

describe("renderToStaticMarkup — Reference", () => {
  it("accepts a React node and returns a Promise<string>", async () => {
    const html = await renderToStaticMarkup(el("span", {}, "hello"));
    expect(typeof html).toBe("string");
    expect(html).toBe("<span>hello</span>");
  });

  it("accepts an optional options object with identifierPrefix", async () => {
    const Component = () => {
      const id = useId();
      return el("div", { id }, "content");
    };
    const html = await renderToStaticMarkup(el(Component, {}), {
      identifierPrefix: "myapp",
    });
    expect(html).toContain('id="myapp:');
  });

  it("returns an HTML string for primitive nodes", async () => {
    expect(await renderToStaticMarkup("text")).toBe("text");
    expect(await renderToStaticMarkup(42)).toBe("42");
    expect(await renderToStaticMarkup(null)).toBe("");
    expect(await renderToStaticMarkup(undefined)).toBe("");
    expect(await renderToStaticMarkup(true)).toBe("");
  });
});

// ─── Usage ──────────────────────────────────────────────────────────────────

describe("renderToStaticMarkup — Usage", () => {
  it("renders a non-interactive React tree as HTML", async () => {
    const Page = () =>
      el(
        "html",
        {},
        el("head", {}, el("title", {}, "Static")),
        el("body", {}, el("h1", {}, "Hello"), el("p", {}, "World")),
      );

    const html = await renderToStaticMarkup(el(Page, {}));
    expect(html).toContain("<html>");
    expect(html).toContain("<title>Static</title>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
    expect(html).toContain("</html>");
  });

  it("renders void elements without closing tags", async () => {
    const html = await renderToStaticMarkup(el("input", { type: "text" }));
    expect(html).toBe('<input type="text">');
  });

  it("renders boolean attributes correctly", async () => {
    const html = await renderToStaticMarkup(
      el("input", { disabled: true, checked: false, readonly: true }),
    );
    expect(html).toContain("disabled");
    expect(html).not.toContain("checked");
    expect(html).toContain("readonly");
  });

  it("renders fragments as concatenated children", async () => {
    const Fragment = ""; // Sinwan fragment tag
    const html = await renderToStaticMarkup(
      el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b")),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("renderToStaticMarkup — Caveats", () => {
  it("output does not contain hydration markers", async () => {
    const Component = () => el("div", {}, "static");
    const html = await renderToStaticMarkup(el(Component, {}));
    expect(html).toContain("static");
    expect(html).not.toContain("data-sinwan-id");
    expect(html).not.toContain("<!--sinwan-t:");
    expect(html).not.toContain("<!--/sinwan-t-->");
    expect(html).not.toContain("data-sinwan-ev");
  });

  it("does not emit event handler attributes", async () => {
    const html = await renderToStaticMarkup(
      el("button", { onClick: () => {} }, "click me"),
    );
    expect(html).toBe("<button>click me</button>");
    expect(html).not.toContain("onClick");
    expect(html).not.toContain("data-sinwan-ev");
  });

  it("dangerouslySetInnerHTML is emitted raw", async () => {
    const html = await renderToStaticMarkup(
      el("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
    );
    expect(html).toBe("<div><b>raw</b></div>");
  });

  it("escapes regular text content", async () => {
    const html = await renderToStaticMarkup(
      el("div", {}, "<script>alert(1)</script>"),
    );
    expect(html).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("renderToStaticMarkup — Edge cases", () => {
  it("supports useId inside components", async () => {
    const Field = () => {
      const id = useId();
      return el(
        "div",
        {},
        el("label", { htmlFor: id }, "Name"),
        el("input", { id }),
      );
    };

    const html = await renderToStaticMarkup(el(Field, {}));
    expect(html).toContain('for="');
    expect(html).toContain('id="');
    // The label's for and input's id should match
    const forMatch = html.match(/for="([^"]+)"/);
    const idMatch = html.match(/id="([^"]+)"/);
    expect(forMatch?.[1]).toBe(idMatch?.[1]);
  });

  it("supports identifierPrefix for useId", async () => {
    const Field = () => {
      const id = useId();
      return el("input", { id });
    };

    const html = await renderToStaticMarkup(el(Field, {}), {
      identifierPrefix: "app",
    });
    expect(html).toContain('id="app:');
  });

  it("renders nested components", async () => {
    const Inner = () => el("span", {}, "inner");
    const Outer = () => el("div", {}, el(Inner, {}));

    const html = await renderToStaticMarkup(el(Outer, {}));
    expect(html).toBe("<div><span>inner</span></div>");
  });

  it("renders arrays of elements", async () => {
    const html = await renderToStaticMarkup([
      el("a", {}, "1"),
      el("b", {}, "2"),
    ]);
    expect(html).toBe("<a>1</a><b>2</b>");
  });

  it("renders async components", async () => {
    const AsyncComp = async () => {
      await Promise.resolve();
      return el("div", {}, "async");
    };

    const html = await renderToStaticMarkup(el(AsyncComp, {}));
    expect(html).toBe("<div>async</div>");
  });

  it("renders components that return fragments", async () => {
    const Fragment = "";
    const Multi = () =>
      el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b"));

    const html = await renderToStaticMarkup(el(Multi, {}));
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  it("handles empty elements gracefully", async () => {
    const Empty = () => null;
    const html = await renderToStaticMarkup(el(Empty, {}));
    expect(html).toBe("");
  });

  it("renders Show control flow with true condition", async () => {
    const { Show } = await import("../../../../src/component/control-flow.ts");
    const html = await renderToStaticMarkup(
      el(
        Show,
        { when: true, fallback: el("div", {}, "no") },
        el("div", {}, "yes"),
      ),
    );
    expect(html).toBe("<div>yes</div>");
  });

  it("renders Show control flow with false condition", async () => {
    const { Show } = await import("../../../../src/component/control-flow.ts");
    const html = await renderToStaticMarkup(
      el(
        Show,
        { when: false, fallback: el("div", {}, "no") },
        el("div", {}, "yes"),
      ),
    );
    expect(html).toBe("<div>no</div>");
  });

  it("renders For control flow", async () => {
    const { FOR_TYPE } =
      await import("../../../../src/component/control-flow.ts");
    const html = await renderToStaticMarkup({
      tag: FOR_TYPE,
      props: {
        each: ["a", "b", "c"],
        children: (item: string) => el("span", {}, item),
      },
      children: [],
    });
    expect(html).toBe("<span>a</span><span>b</span><span>c</span>");
  });

  it("strips reactive text markers from signal values", async () => {
    const { signal } = await import("../../../../src/reactivity/signal.ts");
    const count = signal(5);
    const html = await renderToStaticMarkup(el("div", {}, count));
    expect(html).toBe("<div>5</div>");
    expect(html).not.toContain("<!--sinwan-t:");
  });

  it("strips component boundary markers from nested components", async () => {
    const Child = () => el("span", {}, "child");
    const Parent = () => el("div", {}, el(Child, {}));

    const html = await renderToStaticMarkup(el(Parent, {}));
    expect(html).toBe("<div><span>child</span></div>");
    expect(html).not.toContain("data-sinwan-id");
  });
});
