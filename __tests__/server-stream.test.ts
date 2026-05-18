import { describe, it, expect } from "bun:test";
import { signal, computed } from "../src/reactivity/index.ts";
import { cc } from "../src/component/create.ts";
import {
  Show,
  For,
  Switch,
  Match,
  Index,
  Key,
  Dynamic,
  Visible,
  Portal,
} from "../src/component/control-flow.ts";
import { raw, HtmlEscapedString } from "../src/common/escaper.ts";
import { island } from "../src/component/island.ts";
import {
  streamPage,
  streamHydratablePage,
  streamHydratableNode,
} from "../src/server/stream.ts";
import type { SinwanElement } from "../src/types.ts";

const STATE_GETTER_MARKER = Symbol.for("sinwan.state_getter");

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag: tag as any, props: { ...props, children }, children };
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }
  html += decoder.decode();
  return html;
}

function mockGetter(value: unknown) {
  const fn = () => value;
  (fn as any)[STATE_GETTER_MARKER] = true;
  return fn;
}

// ─── streamPage ─────────────────────────────────────────────────────────────

describe("streamPage", () => {
  it("streams a simple page", async () => {
    const page = () => el("div", {}, "hello");
    const html = await collectStream(streamPage(page, {}));
    expect(html).toBe("<div>hello</div>");
  });

  it("handles errors by calling controller.error", async () => {
    const page = () => {
      throw new Error("page boom");
    };
    const stream = streamPage(page, {});
    const reader = stream.getReader();
    try {
      await reader.read();
      expect(false).toBe(true); // should not reach here
    } catch (e: any) {
      expect(e.message).toContain("page boom");
    }
  });
});

// ─── streamHydratablePage ───────────────────────────────────────────────────

describe("streamHydratablePage", () => {
  it("streams a hydratable page with markers", async () => {
    const App = cc(() => el("div", {}, "hello"));
    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("hello");
  });

  it("streams with identifierPrefix", async () => {
    const App = cc(() => el("div", {}, "hello"));
    const html = await collectStream(
      streamHydratablePage(App, {}, { identifierPrefix: "p" }),
    );
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("hello");
  });

  it("handles errors by calling controller.error", async () => {
    const App = cc(() => {
      throw new Error("hydratable boom");
    });
    const stream = streamHydratablePage(App);
    const reader = stream.getReader();
    try {
      await reader.read();
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.message).toContain("hydratable boom");
    }
  });
});

// ─── streamHydratableNode ───────────────────────────────────────────────────

describe("streamHydratableNode", () => {
  it("streams a raw node without prefix", async () => {
    const html = await collectStream(streamHydratableNode("hello"));
    expect(html).toBe("hello");
  });

  it("streams a raw node with identifierPrefix", async () => {
    const html = await collectStream(
      streamHydratableNode(el("div", {}, "hello"), {
        identifierPrefix: "x",
      }),
    );
    expect(html).toContain("<div>hello</div>");
  });
});

// ─── streamNode branches ────────────────────────────────────────────────────

describe("streamNode branches", () => {
  it("ignores null", async () => {
    const html = await collectStream(streamPage(() => null as any, {}));
    expect(html).toBe("");
  });

  it("ignores undefined", async () => {
    const html = await collectStream(streamPage(() => undefined as any, {}));
    expect(html).toBe("");
  });

  it("ignores boolean", async () => {
    const html = await collectStream(streamPage(() => true as any, {}));
    expect(html).toBe("");
  });

  it("streams a string", async () => {
    const html = await collectStream(streamPage(() => "hello", {}));
    expect(html).toBe("hello");
  });

  it("escapes HTML in strings", async () => {
    const html = await collectStream(streamPage(() => "<script>", {}));
    expect(html).toBe("&lt;script&gt;");
  });

  it("streams a number", async () => {
    const html = await collectStream(streamPage(() => 42 as any, {}));
    expect(html).toBe("42");
  });

  it("streams HtmlEscapedString without escaping", async () => {
    const html = await collectStream(
      streamPage(() => raw("<b>bold</b>") as any, {}),
    );
    expect(html).toBe("<b>bold</b>");
  });

  it("streams signal value", async () => {
    const s = signal(5);
    const html = await collectStream(streamPage(() => s as any, {}));
    expect(html).toBe("5");
  });

  it("streams computed value", async () => {
    const s = signal(5);
    const c = computed(() => s.value * 2);
    const html = await collectStream(streamPage(() => c as any, {}));
    expect(html).toBe("10");
  });

  it("streams state getter value", async () => {
    const getter = mockGetter("getter-value");
    const html = await collectStream(streamPage(() => getter as any, {}));
    expect(html).toBe("getter-value");
  });

  it("streams an array of nodes", async () => {
    const html = await collectStream(
      streamPage(() => ["a", el("span", {}, "b")] as any, {}),
    );
    expect(html).toBe("a<span>b</span>");
  });

  it("streams a Promise element", async () => {
    const html = await collectStream(
      streamPage(() => [Promise.resolve(el("div", {}, "async"))] as any, {}),
    );
    expect(html).toBe("<div>async</div>");
  });
});

// ─── streamElement branches ───────────────────────────────────────────────────

describe("streamElement branches", () => {
  it("streams Show when=true", async () => {
    const html = await collectStream(
      streamPage(() => el(Show, { when: true }, "visible"), {}),
    );
    expect(html).toBe("visible");
  });

  it("streams Show when=false with fallback", async () => {
    const html = await collectStream(
      streamPage(
        () => el(Show, { when: false, fallback: "fallback" }, "visible"),
        {},
      ),
    );
    expect(html).toBe("fallback");
  });

  it("streams Show when=false without fallback", async () => {
    const html = await collectStream(
      streamPage(() => el(Show, { when: false }, "visible"), {}),
    );
    expect(html).toBe("");
  });

  it("streams For with items", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          For({
            each: ["a", "b"],
            children: (item: string) => el("span", {}, item),
          }),
        {},
      ),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });

  it("streams For with empty array and fallback", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el(For, { each: [], fallback: "no-items" }, (item: string) =>
            el("span", {}, item),
          ),
        {},
      ),
    );
    expect(html).toBe("no-items");
  });

  it("streams Switch with Match", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Switch({
            children: Match({ when: true, children: "ok" }),
          }),
        {},
      ),
    );
    expect(html).toBe("ok");
  });

  it("streams Switch with no matching Match and fallback", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el(
            Switch,
            { fallback: "no-match" },
            el(Match, { when: false, children: "ok" }),
          ),
        {},
      ),
    );
    expect(html).toBe("no-match");
  });

  it("streams Match when=false", async () => {
    const html = await collectStream(
      streamPage(() => el(Match, { when: false, children: "ok" }), {}),
    );
    expect(html).toBe("");
  });

  it("streams Index with items", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Index({
            each: ["x", "y"],
            children: (item: () => string) => el("span", {}, item()),
          }),
        {},
      ),
    );
    expect(html).toBe("<span>x</span><span>y</span>");
  });

  it("streams Key", async () => {
    const html = await collectStream(
      streamPage(() => el(Key, { when: "mykey" }, "keyed"), {}),
    );
    expect(html).toBe("keyed");
  });

  it("streams Dynamic with string component", async () => {
    const html = await collectStream(
      streamPage(() => el(Dynamic, { component: "div" }, "dynamic"), {}),
    );
    expect(html).toBe("<div>dynamic</div>");
  });

  it("streams Dynamic with null component", async () => {
    const html = await collectStream(
      streamPage(() => el(Dynamic, { component: null }, "ignored"), {}),
    );
    expect(html).toBe("");
  });

  it("streams Portal as empty", async () => {
    const html = await collectStream(
      streamPage(() => el(Portal, { target: "body" }, "portal"), {}),
    );
    expect(html).toBe("");
  });

  it("streams Visible", async () => {
    const html = await collectStream(
      streamPage(() => el(Visible, { when: true, as: "span" }, "visible"), {}),
    );
    expect(html).toContain("visible");
  });

  it("streams functional component", async () => {
    const Comp = cc(() => el("span", {}, "comp"));
    const html = await collectStream(streamPage(() => el(Comp, {}), {}));
    expect(html).toBe("<span>comp</span>");
  });

  it("streams intrinsic element with children", async () => {
    const html = await collectStream(
      streamPage(() => el("div", {}, "hello"), {}),
    );
    expect(html).toBe("<div>hello</div>");
  });

  it("streams unknown tag as children", async () => {
    const html = await collectStream(
      streamPage(
        () => ({ tag: 42 as any, props: {}, children: ["fallback"] }),
        {},
      ),
    );
    expect(html).toBe("fallback");
  });
});

// ─── streamIntrinsicElement ─────────────────────────────────────────────────

describe("streamIntrinsicElement", () => {
  it("streams void element without closing tag", async () => {
    const html = await collectStream(
      streamPage(() => el("input", { type: "text" }), {}),
    );
    expect(html).toBe('<input type="text">');
  });

  it("streams void element with boolean attr", async () => {
    const html = await collectStream(
      streamPage(() => el("input", { disabled: true }), {}),
    );
    expect(html).toBe("<input disabled>");
  });

  it("streams dangerouslySetInnerHTML", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el("div", {
            dangerouslySetInnerHTML: { __html: "<b>bold</b>" },
          }),
        {},
      ),
    );
    expect(html).toBe("<div><b>bold</b></div>");
  });

  it("streams normal children", async () => {
    const html = await collectStream(
      streamPage(() => el("div", {}, "hello", " world"), {}),
    );
    expect(html).toBe("<div>hello world</div>");
  });
});

// ─── renderAttributes ─────────────────────────────────────────────────────────

describe("renderAttributes", () => {
  it("skips null and false values", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el("div", {
            class: null as any,
            id: false as any,
            title: "ok",
          }),
        {},
      ),
    );
    expect(html).toBe('<div title="ok"></div>');
  });

  it("skips event props", async () => {
    const html = await collectStream(
      streamPage(() => el("button", { onClick: () => {} }, "click"), {}),
    );
    expect(html).toBe("<button>click</button>");
  });

  it("skips children, key, ref, dangerouslySetInnerHTML", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el(
            "div",
            {
              key: "k",
              ref: () => {},
            },
            "child",
          ),
        {},
      ),
    );
    expect(html).toBe("<div>child</div>");
  });
});

// ─── streamHydratableNodeToController branches ──────────────────────────────

describe("streamHydratableNodeToController", () => {
  it("handles null node", async () => {
    const html = await collectStream(streamHydratableNode(null));
    expect(html).toBe("");
  });

  it("handles boolean node", async () => {
    const html = await collectStream(streamHydratableNode(true));
    expect(html).toBe("");
  });

  it("handles string node", async () => {
    const html = await collectStream(streamHydratableNode("hello"));
    expect(html).toBe("hello");
  });

  it("handles number node", async () => {
    const html = await collectStream(streamHydratableNode(42 as any));
    expect(html).toBe("42");
  });

  it("handles HtmlEscapedString node", async () => {
    const html = await collectStream(streamHydratableNode(raw("<b>x</b>")));
    expect(html).toBe("<b>x</b>");
  });

  it("handles signal node with markers", async () => {
    const s = signal(7);
    const html = await collectStream(streamHydratableNode(s as any));
    expect(html).toContain("<!--sinwan-t:0-->");
    expect(html).toContain("7");
  });

  it("handles computed node with markers", async () => {
    const s = signal(3);
    const c = computed(() => s.value * 2);
    const html = await collectStream(streamHydratableNode(c as any));
    expect(html).toContain("<!--sinwan-t:0-->");
    expect(html).toContain("6");
  });

  it("handles state getter node with markers", async () => {
    const getter = mockGetter("sg");
    const html = await collectStream(streamHydratableNode(getter as any));
    expect(html).toContain("<!--sinwan-t:0-->");
    expect(html).toContain("sg");
  });

  it("handles array node", async () => {
    const html = await collectStream(
      streamHydratableNode(["a", el("span", {}, "b")]),
    );
    expect(html).toBe("a<span>b</span>");
  });

  it("handles Promise element node", async () => {
    const html = await collectStream(
      streamHydratableNode(Promise.resolve(el("div", {}, "async")) as any),
    );
    expect(html).toContain("async");
  });
});

// ─── streamHydratableElement branches ───────────────────────────────────────

describe("streamHydratableElement branches", () => {
  it("handles fragment", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => ({
          tag: "",
          props: {},
          children: [el("span", {}, "a"), el("span", {}, "b")],
        })),
      ),
    );
    expect(html).toContain("<span>a</span>");
    expect(html).toContain("<span>b</span>");
  });

  it("handles Show control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Show, { when: true }, "yes"))),
    );
    expect(html).toContain("yes");
  });

  it("handles For control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          For({
            each: ["a"],
            children: (item: string) => el("span", {}, item),
          }),
        ),
      ),
    );
    expect(html).toContain("<span>a</span>");
  });

  it("handles Switch control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          Switch({
            children: Match({ when: true, children: "ok" }),
          }),
        ),
      ),
    );
    expect(html).toContain("ok");
  });

  it("handles Index control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          Index({
            each: ["x"],
            children: (item: () => string) => el("span", {}, item()),
          }),
        ),
      ),
    );
    expect(html).toContain("<span>x</span>");
  });

  it("handles Key control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Key, { when: "k" }, "keyed"))),
    );
    expect(html).toContain("keyed");
  });

  it("handles Dynamic control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => Dynamic({ component: "div", children: "dyn" })),
      ),
    );
    expect(html).toContain("dyn");
    expect(html).toContain("<div");
  });

  it("handles Portal control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Portal, { target: "body" }, "portal"))),
    );
    expect(html).toBe("");
  });

  it("handles Visible control flow tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => el(Visible, { when: true, as: "span" }, "vis")),
      ),
    );
    expect(html).toContain("vis");
  });

  it("handles Show with fallback", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => el(Show, { when: false, fallback: "fb" }, "yes")),
      ),
    );
    expect(html).toContain("fb");
  });

  it("handles isForElement", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          For({
            each: ["a", "b"],
            children: (item: string) => el("span", {}, item),
          }),
        ),
      ),
    );
    expect(html).toContain("<span>a</span>");
    expect(html).toContain("<span>b</span>");
  });

  it("handles isSwitchElement", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          el(
            Switch,
            { fallback: "fb" },
            el(Match, { when: false, children: "ok" }),
          ),
        ),
      ),
    );
    expect(html).toContain("fb");
  });

  it("handles isMatchElement when=true", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => Match({ when: true, children: "matched" })),
      ),
    );
    expect(html).toBe("matched");
  });

  it("handles isMatchElement when=false", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => el(Match, { when: false, children: "matched" })),
      ),
    );
    expect(html).toBe("");
  });

  it("handles isIndexElement", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          Index({
            each: ["x", "y"],
            children: (item: () => string) => el("span", {}, item()),
          }),
        ),
      ),
    );
    expect(html).toContain("<span>x</span>");
  });

  it("handles isKeyElement", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Key, { when: "k" }, "keyed"))),
    );
    expect(html).toContain("keyed");
  });

  it("handles isDynamicElement with null tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => el(Dynamic, { component: null }, "ignored")),
      ),
    );
    expect(html).toBe("");
  });

  it("handles isPortalElement", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Portal, { target: "body" }, "portal"))),
    );
    expect(html).toBe("");
  });

  it("handles functional component", async () => {
    const Child = cc(() => el("span", {}, "child"));
    const html = await collectStream(
      streamHydratablePage(cc(() => el(Child, {}))),
    );
    expect(html).toContain("<span>child</span>");
  });

  it("handles intrinsic element", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el("div", {}, "hello"))),
    );
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("hello");
  });

  it("handles fallback for unknown tag", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => ({
          tag: 42 as any,
          props: {},
          children: ["fallback"],
        })),
      ),
    );
    expect(html).toContain("fallback");
  });
});

// ─── streamHydratableIntrinsic ──────────────────────────────────────────────

describe("streamHydratableIntrinsic", () => {
  it("streams void element", async () => {
    const html = await collectStream(
      streamHydratablePage(cc(() => el("br", {}))),
    );
    expect(html).toContain("<br");
    expect(html).not.toContain("</br>");
  });

  it("streams dangerouslySetInnerHTML", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          el("div", { dangerouslySetInnerHTML: { __html: "<b>x</b>" } }),
        ),
      ),
    );
    expect(html).toContain("<b>x</b>");
  });
});

// ─── streamHydratableForElement fallbacks ───────────────────────────────────

describe("streamHydratableForElement fallbacks", () => {
  it("streams For with non-array each", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => For({ each: "not-array", fallback: "fb" } as any)),
      ),
    );
    expect(html).toBe("fb");
  });

  it("streams For with no children function", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => For({ each: ["a"], fallback: "fb" } as any)),
      ),
    );
    expect(html).toBe("fb");
  });

  it("streams For with empty array and fallback", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          For({
            each: [],
            fallback: "empty",
            children: (item: string) => el("span", {}, item),
          }),
        ),
      ),
    );
    expect(html).toBe("empty");
  });

  it("streams For with items", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          For({
            each: ["a", "b"],
            children: (item: string, _index: () => number) =>
              el("span", {}, item),
          }),
        ),
      ),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });
});

// ─── streamHydratableIndexElement fallbacks ─────────────────────────────────

describe("streamHydratableIndexElement fallbacks", () => {
  it("streams Index with non-array each", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => Index({ each: "not-array", fallback: "fb" } as any)),
      ),
    );
    expect(html).toBe("fb");
  });

  it("streams Index with no children function", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() => Index({ each: ["a"], fallback: "fb" } as any)),
      ),
    );
    expect(html).toBe("fb");
  });

  it("streams Index with empty array and fallback", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          Index({
            each: [],
            fallback: "empty",
            children: (item: () => string, _index: number) =>
              el("span", {}, item()),
          }),
        ),
      ),
    );
    expect(html).toBe("empty");
  });

  it("streams Index with items", async () => {
    const html = await collectStream(
      streamHydratablePage(
        cc(() =>
          Index({
            each: ["x", "y"],
            children: (item: () => string, _index: number) =>
              el("span", {}, item()),
          }),
        ),
      ),
    );
    expect(html).toBe("<span>x</span><span>y</span>");
  });
});

// ─── streamForElement (non-hydratable) ──────────────────────────────────────

describe("streamForElement", () => {
  it("streams For with non-array each", async () => {
    const html = await collectStream(
      streamPage(() => For({ each: "not-array", fallback: "fb" } as any), {}),
    );
    expect(html).toBe("fb");
  });

  it("streams For with no children function", async () => {
    const html = await collectStream(
      streamPage(() => For({ each: ["a"], fallback: "fb" } as any), {}),
    );
    expect(html).toBe("fb");
  });

  it("streams For with empty array and fallback", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          For({
            each: [],
            fallback: "empty",
            children: (item: string) => el("span", {}, item),
          }),
        {},
      ),
    );
    expect(html).toBe("empty");
  });

  it("streams For with items", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          For({
            each: ["a", "b"],
            children: (item: string, _index: () => number) =>
              el("span", {}, item),
          }),
        {},
      ),
    );
    expect(html).toBe("<span>a</span><span>b</span>");
  });
});

// ─── streamIndexElement (non-hydratable) ────────────────────────────────────

describe("streamIndexElement", () => {
  it("streams Index with non-array each", async () => {
    const html = await collectStream(
      streamPage(() => Index({ each: "not-array", fallback: "fb" } as any), {}),
    );
    expect(html).toBe("fb");
  });

  it("streams Index with no children function", async () => {
    const html = await collectStream(
      streamPage(() => Index({ each: ["a"], fallback: "fb" } as any), {}),
    );
    expect(html).toBe("fb");
  });

  it("streams Index with empty array and fallback", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Index({
            each: [],
            fallback: "empty",
            children: (item: () => string, _index: number) =>
              el("span", {}, item()),
          }),
        {},
      ),
    );
    expect(html).toBe("empty");
  });

  it("streams Index with items", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Index({
            each: ["x", "y"],
            children: (item: () => string, _index: number) =>
              el("span", {}, item()),
          }),
        {},
      ),
    );
    expect(html).toBe("<span>x</span><span>y</span>");
  });
});

// ─── resolveShowChildren / resolveMatchChildren / resolveKeyChildren ────────

describe("resolve children helpers", () => {
  it("resolveShowChildren with function children", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Show({
            when: true,
            children: (v: boolean) => String(v),
          }),
        {},
      ),
    );
    expect(html).toBe("true");
  });

  it("resolveMatchChildren with function children", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Switch({
            children: Match({
              when: true,
              children: (v: boolean) => String(v),
            }),
          }),
        {},
      ),
    );
    expect(html).toBe("true");
  });

  it("resolveKeyChildren with function children", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Key({
            when: "k",
            children: (v: string) => v,
          }),
        {},
      ),
    );
    expect(html).toBe("k");
  });
});

// ─── resolveSwitchContent ───────────────────────────────────────────────────

describe("resolveSwitchContent", () => {
  it("returns fallback when no Match matches", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el(
            Switch,
            { fallback: "none" },
            el(Match, { when: false, children: "a" }),
            el(Match, { when: false, children: "b" }),
          ),
        {},
      ),
    );
    expect(html).toBe("none");
  });

  it("returns first matching Match", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Switch({
            children: [
              Match({ when: false, children: "a" }),
              Match({ when: true, children: "b" }),
              Match({ when: true, children: "c" }),
            ] as any,
          }),
        {},
      ),
    );
    expect(html).toBe("b");
  });

  it("skips non-Match children", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          el(
            Switch,
            { fallback: "fb" },
            "not-a-match",
            el("div", {}, "also-not"),
            el(Match, { when: false, children: "m" }),
          ),
        {},
      ),
    );
    expect(html).toBe("fb");
  });
});

// ─── createDynamicElement ───────────────────────────────────────────────────

describe("createDynamicElement", () => {
  it("returns null for invalid tag type", async () => {
    const html = await collectStream(
      streamPage(() => el(Dynamic, { component: 42 }, "ignored"), {}),
    );
    expect(html).toBe("");
  });
});

// ─── streamIsland ───────────────────────────────────────────────────────────

describe("streamIsland", () => {
  it("streams an island", async () => {
    const Inner = cc(() => el("span", {}, "isle"));
    const Isle = island(Inner, { name: "my-island" });
    const html = await collectStream(streamPage(() => el(Isle as any, {}), {}));
    expect(html).toContain('data-sinwan-island="my-island"');
    expect(html).toContain("isle");
  });

  it("throws when props serialization fails", async () => {
    const Inner = cc(() => el("span", {}, "isle"));
    const Isle = island(Inner, {
      name: "bad",
      serializeProps: () => {
        throw new Error("bad json");
      },
    });
    const stream = streamPage(() => el(Isle as any, {}), {});
    try {
      await collectStream(stream);
      expect(false).toBe(true);
    } catch (e: any) {
      expect(e.message).toContain("bad json");
    }
  });
});

// ─── readReactive ───────────────────────────────────────────────────────────

describe("readReactive through stream", () => {
  it("reads signal value", async () => {
    const s = signal("reactive");
    const html = await collectStream(
      streamPage(() => el("div", { title: s as any }, "hello"), {}),
    );
    expect(html).toBe('<div title="reactive">hello</div>');
  });

  it("reads computed value", async () => {
    const s = signal(5);
    const c = computed(() => s.value * 2);
    const html = await collectStream(
      streamPage(() => el("div", { title: c as any }, "hello"), {}),
    );
    expect(html).toBe('<div title="10">hello</div>');
  });

  it("reads state getter value", async () => {
    const getter = mockGetter("getter");
    const html = await collectStream(
      streamPage(() => el("div", { title: getter as any }, "hello"), {}),
    );
    expect(html).toBe('<div title="getter">hello</div>');
  });
});

// ─── normalizeContent ───────────────────────────────────────────────────────

describe("normalizeContent", () => {
  it("normalizes null to empty array", async () => {
    const html = await collectStream(
      streamPage(() => Switch({ fallback: null, children: null } as any), {}),
    );
    expect(html).toBe("");
  });

  it("normalizes boolean to empty array", async () => {
    const html = await collectStream(
      streamPage(() => Switch({ fallback: true, children: false } as any), {}),
    );
    expect(html).toBe("");
  });

  it("normalizes non-array to array", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          Switch({
            fallback: "single",
            children: el(Match, { when: false, children: "m" }),
          } as any),
        {},
      ),
    );
    expect(html).toBe("single");
  });
});

// ─── renderHydratableAttributes ─────────────────────────────────────────────

describe("renderHydratableAttributes", () => {
  it("adds component id for component root", async () => {
    const App = cc(() => el("div", {}, "hello"));
    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain('data-sinwan-id="c0"');
  });

  it("adds event markers", async () => {
    const App = cc(() => el("button", { onClick: () => {} }, "click"));
    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain('data-sinwan-ev="click:0"');
  });
});
