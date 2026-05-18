/**
 * Comprehensive tests for `renderToString`.
 *
 * Tests mirror the React `renderToString` documentation sections.
 */

import { describe, it, expect } from "bun:test";
import { renderToString } from "../../../../src/integrations/react/render-to-string.ts";
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

describe("renderToString — Reference", () => {
  it("accepts a React node and returns a Promise<string>", async () => {
    const html = await renderToString(el("span", {}, "hello"));
    expect(typeof html).toBe("string");
    expect(html).toContain("hello");
  });

  it("accepts an optional options object with identifierPrefix", async () => {
    const Component = () => {
      const id = useId();
      return el("div", { id }, "content");
    };
    const html = await renderToString(el(Component, {}), {
      identifierPrefix: "myapp",
    });
    expect(html).toContain('id="myapp:');
  });

  it("returns an HTML string for primitive nodes", async () => {
    expect(await renderToString("text")).toBe("text");
    expect(await renderToString(42)).toBe("42");
    expect(await renderToString(null)).toBe("");
    expect(await renderToString(undefined)).toBe("");
    expect(await renderToString(true)).toBe("");
  });
});

// ─── Usage ──────────────────────────────────────────────────────────────────

describe("renderToString — Usage", () => {
  it("renders a React tree as HTML to a string", async () => {
    const Page = () =>
      el(
        "html",
        {},
        el("head", {}, el("title", {}, "App")),
        el("body", {}, el("h1", {}, "Hello"), el("p", {}, "World")),
      );

    const html = await renderToString(el(Page, {}));
    expect(html).toContain("<html");
    expect(html).toContain("<title>App</title>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
    expect(html).toContain("</html>");
  });

  it("renders void elements without closing tags", async () => {
    const html = await renderToString(el("input", { type: "text" }));
    expect(html).toBe('<input type="text">');
  });

  it("renders boolean attributes correctly", async () => {
    const html = await renderToString(
      el("input", { disabled: true, checked: false, readonly: true }),
    );
    expect(html).toContain("disabled");
    expect(html).not.toContain("checked");
    expect(html).toContain("readonly");
  });

  it("renders fragments as concatenated children", async () => {
    const Fragment = ""; // Sinwan fragment tag
    const html = await renderToString(
      el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b")),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("renderToString — Caveats", () => {
  it("output contains hydration markers for components", async () => {
    const Component = () => el("div", {}, "hydratable");
    const html = await renderToString(el(Component, {}));
    expect(html).toContain("hydratable");
    expect(html).toContain('data-sinwan-id="c0"');
  });

  it("does not emit event handler attributes but emits event markers", async () => {
    const html = await renderToString(
      el("button", { onClick: () => {} }, "click me"),
    );
    expect(html).toContain("click me");
    expect(html).not.toContain("onClick");
    expect(html).toContain('data-sinwan-ev="click:0"');
  });

  it("dangerouslySetInnerHTML is emitted raw", async () => {
    const html = await renderToString(
      el("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
    );
    expect(html).toBe("<div><b>raw</b></div>");
  });

  it("escapes regular text content", async () => {
    const html = await renderToString(
      el("div", {}, "<script>alert(1)</script>"),
    );
    expect(html).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("renderToString — Edge cases", () => {
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

    const html = await renderToString(el(Field, {}));
    expect(html).toContain('for="');
    expect(html).toContain('id="');
    // The label's for and input's id should match
    const forMatch = html.match(/<label[^>]*for="([^"]+)"/);
    const idMatch = html.match(/<input[^>]*id="([^"]+)"/);
    expect(forMatch?.[1]).toBe(idMatch?.[1]);
  });

  it("supports identifierPrefix for useId", async () => {
    const Field = () => {
      const id = useId();
      return el("input", { id });
    };

    const html = await renderToString(el(Field, {}), {
      identifierPrefix: "app",
    });
    expect(html).toContain('id="app:');
  });

  it("renders nested components with boundary markers", async () => {
    const Inner = () => el("span", {}, "inner");
    const Outer = () => el("div", {}, el(Inner, {}));

    const html = await renderToString(el(Outer, {}));
    expect(html).toContain("<div");
    expect(html).toContain("data-sinwan-id=");
    expect(html).toContain("<span");
    expect(html).toContain(">inner</span>");
    expect(html).toContain("</div>");
  });

  it("renders arrays of elements", async () => {
    const html = await renderToString([el("a", {}, "1"), el("b", {}, "2")]);
    expect(html).toBe("<a>1</a><b>2</b>");
  });

  it("renders async components", async () => {
    const AsyncComp = async () => {
      await Promise.resolve();
      return el("div", {}, "async");
    };

    const html = await renderToString(el(AsyncComp, {}));
    expect(html).toContain("<div");
    expect(html).toContain("async");
    expect(html).toContain("</div>");
  });

  it("renders components that return fragments", async () => {
    const Fragment = "";
    const Multi = () =>
      el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b"));

    const html = await renderToString(el(Multi, {}));
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  it("handles empty elements gracefully", async () => {
    const Empty = () => null;
    const html = await renderToString(el(Empty, {}));
    expect(html).toBe("");
  });

  it("renders Show control flow with true condition", async () => {
    const { Show } = await import("../../../../src/component/control-flow.ts");
    const html = await renderToString(
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
    const html = await renderToString(
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
    const html = await renderToString({
      tag: FOR_TYPE,
      props: {
        each: ["a", "b", "c"],
        children: (item: string) => el("span", {}, item),
      },
      children: [],
    });
    expect(html).toBe("<span>a</span><span>b</span><span>c</span>");
  });

  it("includes reactive text markers for signal values", async () => {
    const { signal } = await import("../../../../src/reactivity/signal.ts");
    const count = signal(5);
    const html = await renderToString(el("div", {}, count));
    expect(html).toContain("5");
    expect(html).toContain("<!--sinwan-t:");
    expect(html).toContain("<!--/sinwan-t-->");
  });

  it("includes component boundary markers from nested components", async () => {
    const Child = () => el("span", {}, "child");
    const Parent = () => el("div", {}, el(Child, {}));

    const html = await renderToString(el(Parent, {}));
    expect(html).toContain("<div");
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("<span");
    expect(html).toContain(">child</span>");
    expect(html).toContain("</div>");
  });

  it("includes hydration markers when rendering a component that returns a plain element", async () => {
    const Component = () => el("div", { class: "foo" }, "bar");
    const html = await renderToString(el(Component, {}));
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("bar");
  });

  it("works in the browser (does not throw)", async () => {
    // renderToString works in the browser, though it is not recommended
    const html = await renderToString(el("svg", {}, el("circle", {})));
    expect(html).toContain("<svg>");
    expect(html).toContain("<circle>");
  });
});
