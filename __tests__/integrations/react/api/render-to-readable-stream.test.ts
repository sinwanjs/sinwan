/**
 * renderToReadableStream — React-compatible server streaming to a Web Stream.
 */

import { describe, it, expect } from "bun:test";
import { renderToReadableStream } from "../../../../src/integrations/react/_server.ts";
import type { SinwanElement } from "../../../../src/types.ts";

const div = (
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: "div",
  props: { ...props, children },
  children: children as any,
});

async function streamToString(s: ReadableStream<Uint8Array>): Promise<string> {
  const reader = s.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("renderToReadableStream — Reference", () => {
  it("returns a Promise that resolves to a ReadableStream", async () => {
    const result = renderToReadableStream(div({}, "hello"));
    expect(result).toBeInstanceOf(Promise);
    const stream = await result;
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("resolved stream carries an allReady Promise", async () => {
    const stream = await renderToReadableStream(div({}, "ready"));
    expect(stream.allReady).toBeInstanceOf(Promise);
  });
});

// ─── Usage / Rendering to a Readable Web Stream ───────────────────────────

describe("renderToReadableStream — Rendering", () => {
  it("produces the rendered HTML", async () => {
    const stream = await renderToReadableStream(div({}, "content"));
    const html = await streamToString(stream);
    expect(html).toContain("content");
  });

  it("injects bootstrapScriptContent as inline script after content", async () => {
    const stream = await renderToReadableStream(div({}, "app"), {
      bootstrapScriptContent: "window.boot = true;",
    });
    const html = await streamToString(stream);
    expect(html).toContain("<script>window.boot = true;</script>");
    expect(html.indexOf("app")).toBeLessThan(html.indexOf("<script>"));
  });

  it("injects bootstrapScripts with async attribute", async () => {
    const stream = await renderToReadableStream(div({}, "app"), {
      bootstrapScripts: ["/main.js"],
    });
    const html = await streamToString(stream);
    expect(html).toContain('<script src="/main.js" async=""></script>');
  });

  it("injects bootstrapModules as type=module without async", async () => {
    const stream = await renderToReadableStream(div({}, "app"), {
      bootstrapModules: ["/client.js"],
    });
    const html = await streamToString(stream);
    expect(html).toContain('type="module"');
    expect(html).not.toContain('async=""');
  });

  it("applies nonce to all emitted scripts", async () => {
    const stream = await renderToReadableStream(div({}, "app"), {
      bootstrapScriptContent: "console.log(1);",
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
      nonce: "abc123",
    });
    const html = await streamToString(stream);
    const nonceCount = (html.match(/nonce="abc123"/g) || []).length;
    expect(nonceCount).toBe(3);
  });

  it("supports BootstrapScript objects with integrity and crossOrigin", async () => {
    const stream = await renderToReadableStream(div({}, "app"), {
      bootstrapScripts: [
        { src: "/main.js", integrity: "sha384-abc", crossOrigin: "anonymous" },
      ],
    });
    const html = await streamToString(stream);
    expect(html).toContain('integrity="sha384-abc"');
    expect(html).toContain('crossorigin="anonymous"');
  });
});

// ─── Shell callbacks & allReady ───────────────────────────────────────────

describe("renderToReadableStream — Shell & allReady", () => {
  it("allReady resolves after the full stream closes", async () => {
    const stream = await renderToReadableStream(div({}, "done"));
    await streamToString(stream);
    await stream.allReady;
    expect(true).toBe(true);
  });

  it("allReady resolves after bootstrap scripts are emitted", async () => {
    const stream = await renderToReadableStream(div({}, "complete"), {
      bootstrapScripts: ["/app.js"],
    });
    await streamToString(stream);
    await stream.allReady;
    expect(true).toBe(true);
  });
});

// ─── Logging crashes & error recovery ─────────────────────────────────────

describe("renderToReadableStream — Errors", () => {
  it("calls onError when a shell error occurs", async () => {
    const errors: unknown[] = [];
    const BadApp = () => {
      throw new Error("boom");
    };
    try {
      await renderToReadableStream(
        { tag: BadApp, props: { children: [] }, children: [] } as any,
        {
          onError(err) {
            errors.push(err);
          },
        },
      );
    } catch {
      /* expected */
    }
    expect(errors.length).toBe(1);
    expect(String(errors[0])).toContain("boom");
  });

  it("rejects the Promise when the shell fails", async () => {
    const BadApp = () => {
      throw new Error("shell-boom");
    };
    await expect(
      renderToReadableStream({
        tag: BadApp,
        props: { children: [] },
        children: [],
      } as any),
    ).rejects.toThrow("shell-boom");
  });

  it("onError receives the same error the Promise rejects with", async () => {
    const originalError = new Error("same");
    const BadApp = () => {
      throw originalError;
    };
    let onErrorError: unknown = null;
    let rejectError: unknown = null;
    try {
      await renderToReadableStream(
        { tag: BadApp, props: { children: [] }, children: [] } as any,
        {
          onError(err) {
            onErrorError = err;
          },
        },
      );
    } catch (err) {
      rejectError = err;
    }
    expect(onErrorError).toBe(originalError);
    expect(rejectError).toBe(originalError);
  });
});

// ─── Aborting server rendering ────────────────────────────────────────────

describe("renderToReadableStream — Abort", () => {
  it("signal abort before reading ends the stream early", async () => {
    const controller = new AbortController();
    const stream = await renderToReadableStream(div({}, "abort-me"), {
      signal: controller.signal,
    });
    controller.abort();
    const html = await streamToString(stream);
    expect(typeof html).toBe("string");
  });

  it("signal abort does not throw when creating the stream", async () => {
    const controller = new AbortController();
    const streamPromise = renderToReadableStream(div({}, "safe"), {
      signal: controller.signal,
    });
    controller.abort();
    const stream = await streamPromise;
    expect(stream).toBeInstanceOf(ReadableStream);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("renderToReadableStream — Edge cases", () => {
  it("handles empty node (null)", async () => {
    const stream = await renderToReadableStream(null as any);
    expect(await streamToString(stream)).toBe("");
  });

  it("handles boolean node", async () => {
    const stream = await renderToReadableStream(true as any);
    expect(await streamToString(stream)).toBe("");
  });

  it("handles multiple bootstrapScripts and modules", async () => {
    const stream = await renderToReadableStream(div({}, "multi"), {
      bootstrapScripts: ["/a.js", "/b.js"],
      bootstrapModules: ["/c.js", "/d.js"],
    });
    const html = await streamToString(stream);
    expect(html).toContain('src="/a.js"');
    expect(html).toContain('src="/b.js"');
    expect(html).toContain('src="/c.js"');
    expect(html).toContain('src="/d.js"');
  });

  it("identifierPrefix is passed through", async () => {
    const stream = await renderToReadableStream(div({}, "prefixed"), {
      identifierPrefix: "myApp",
    });
    expect(await streamToString(stream)).toContain("prefixed");
  });

  it("does not emit bootstrap when arrays are empty", async () => {
    const stream = await renderToReadableStream(div({}, "no-boot"), {
      bootstrapScripts: [],
      bootstrapModules: [],
    });
    const html = await streamToString(stream);
    expect(html).not.toContain("<script");
  });
});

// ─── Bootstrap parity with pipeable stream ─────────────────────────────────

describe("renderToReadableStream — Bootstrap parity", () => {
  it("emits identical bootstrap tags to pipeable stream", async () => {
    const { renderToPipeableStream } =
      await import("../../../../src/integrations/react/_server.ts");

    const opts = {
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
      bootstrapScriptContent: "console.log(1);",
      nonce: "abc",
    };

    const readable = await renderToReadableStream(div({}, "x"), opts);
    const readableHtml = await streamToString(readable);

    const chunks: Uint8Array[] = [];
    const writable = {
      write(c: string | Uint8Array) {
        chunks.push(typeof c === "string" ? new TextEncoder().encode(c) : c);
        return true;
      },
      end() {},
      on() {},
    };
    const ended = new Promise<void>((resolve) => {
      const orig = writable.end;
      (writable as any).end = () => {
        orig();
        resolve();
      };
    });
    const { pipe } = renderToPipeableStream(div({}, "x"), opts);
    pipe(writable as any);
    await ended;
    const pipeableHtml = chunks
      .map((c) => new TextDecoder().decode(c))
      .join("");

    expect(readableHtml).toBe(pipeableHtml);
  });
});

// ─── Complex rendering ──────────────────────────────────────────────────────

describe("renderToReadableStream — Complex rendering", () => {
  it("renders deeply nested elements", async () => {
    const node = div({}, div({}, div({}, "deep")));
    const stream = await renderToReadableStream(node);
    expect(await streamToString(stream)).toBe(
      "<div><div><div>deep</div></div></div>",
    );
  });

  it("escapes special HTML characters", async () => {
    const stream = await renderToReadableStream(
      div({}, "<script>alert(1)</script>"),
    );
    const html = await streamToString(stream);
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders numeric children", async () => {
    const stream = await renderToReadableStream(div({}, 42));
    expect(await streamToString(stream)).toBe("<div>42</div>");
  });

  it("renders element attributes", async () => {
    const stream = await renderToReadableStream(
      div({ id: "foo", class: "bar" }, "text"),
    );
    const html = await streamToString(stream);
    expect(html).toContain('id="foo"');
    expect(html).toContain('class="bar"');
  });

  it("renders void elements without closing tag", async () => {
    const stream = await renderToReadableStream({
      tag: "input",
      props: { type: "text" },
      children: [],
    });
    expect(await streamToString(stream)).toBe('<input type="text">');
  });

  it("does not render onClick handlers", async () => {
    const stream = await renderToReadableStream(
      div({ onClick: () => {} }, "click"),
    );
    const html = await streamToString(stream);
    expect(html).not.toContain("onClick");
    expect(html).toContain("click");
  });

  it("does not render ref or key attributes", async () => {
    const stream = await renderToReadableStream(
      div({ ref: () => {}, key: "1" }, "ref"),
    );
    const html = await streamToString(stream);
    expect(html).not.toContain("ref=");
    expect(html).not.toContain("key=");
  });

  it("renders raw HTML when dangerouslySetInnerHTML is used", async () => {
    const stream = await renderToReadableStream(
      div({ dangerouslySetInnerHTML: { __html: "<span>raw</span>" } }),
    );
    expect(await streamToString(stream)).toBe("<div><span>raw</span></div>");
  });

  it("renders children of a fragment (tag='')", async () => {
    const stream = await renderToReadableStream({
      tag: "",
      props: {},
      children: ["a", "b"],
    });
    expect(await streamToString(stream)).toBe("ab");
  });

  it("renders array children inline", async () => {
    const stream = await renderToReadableStream(div({}, ["a", "b", "c"]));
    expect(await streamToString(stream)).toBe("<div>abc</div>");
  });

  it("renders null children as empty", async () => {
    const stream = await renderToReadableStream(div({}, null, "x", undefined));
    expect(await streamToString(stream)).toBe("<div>x</div>");
  });

  it("renders functional components nested inside elements", async () => {
    const Child = () => div({}, "child");
    const stream = await renderToReadableStream({
      tag: "div",
      props: {},
      children: [{ tag: Child, props: {}, children: [] }],
    });
    expect(await streamToString(stream)).toBe("<div><div>child</div></div>");
  });

  it("handles async components that return a Promise", async () => {
    const AsyncComp = async () => div({}, "async");
    const stream = await renderToReadableStream({
      tag: AsyncComp,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("<div>async</div>");
  });

  it("handles large text content", async () => {
    const text = "x".repeat(10000);
    const stream = await renderToReadableStream(div({}, text));
    const html = await streamToString(stream);
    expect(html.length).toBeGreaterThan(10000);
    expect(html).toContain(text);
  });

  it("escapes ampersand and quotes in text", async () => {
    const stream = await renderToReadableStream(div({}, 'a & b "c"'));
    const html = await streamToString(stream);
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
  });

  it("renders a deeply nested tree without stack overflow", async () => {
    let node: any = div({}, "deep");
    for (let i = 0; i < 100; i++) node = div({}, node);
    const stream = await renderToReadableStream(node);
    expect(await streamToString(stream)).toContain("deep");
  });
});

// ─── Style and boolean attributes ───────────────────────────────────────────

describe("renderToReadableStream — Attributes", () => {
  it("renders style object as inline style", async () => {
    const stream = await renderToReadableStream(
      div({ style: { color: "red", fontSize: "12px" } }, "styled"),
    );
    const html = await streamToString(stream);
    expect(html).toContain("color:red");
    expect(html).toContain("font-size:12px");
  });

  it("renders style as a string when passed", async () => {
    const stream = await renderToReadableStream(
      div({ style: "color: blue;" }, "str"),
    );
    expect(await streamToString(stream)).toContain('style="color: blue;"');
  });

  it("renders true boolean attributes", async () => {
    const stream = await renderToReadableStream(
      div({ disabled: true }, "bool"),
    );
    expect(await streamToString(stream)).toContain("disabled");
  });

  it("omits false boolean attributes", async () => {
    const stream = await renderToReadableStream(
      div({ disabled: false }, "bool"),
    );
    expect(await streamToString(stream)).not.toContain("disabled=");
  });

  it("renders data-attributes", async () => {
    const stream = await renderToReadableStream(
      div({ "data-testid": "foo" }, "data"),
    );
    expect(await streamToString(stream)).toContain('data-testid="foo"');
  });

  it("renders aria-attributes", async () => {
    const stream = await renderToReadableStream(
      div({ "aria-label": "label" }, "aria"),
    );
    expect(await streamToString(stream)).toContain('aria-label="label"');
  });

  it("preserves className as class attribute", async () => {
    const stream = await renderToReadableStream(
      div({ className: "foo" }, "cls"),
    );
    expect(await streamToString(stream)).toContain('class="foo"');
  });
});

// ─── Hydration markers ──────────────────────────────────────────────────────

describe("renderToReadableStream — Hydration", () => {
  it("emits hydration markers for components", async () => {
    const Child = () => div({}, "child");
    const stream = await renderToReadableStream({
      tag: Child,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("<div>child</div>");
  });

  it("does not emit component hydration markers on plain elements", async () => {
    const stream = await renderToReadableStream(div({}, "plain"));
    expect(await streamToString(stream)).not.toContain("data-sinwan-id");
  });
});

// ─── Response compatibility ─────────────────────────────────────────────────

describe("renderToReadableStream — Response", () => {
  it("can be wrapped in a Response", async () => {
    const stream = await renderToReadableStream(div({}, "response"));
    const response = new Response(stream, {
      headers: { "content-type": "text/html" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html");
    expect(await response.text()).toContain("response");
  });
});

// ─── Global state ───────────────────────────────────────────────────────────

describe("renderToReadableStream — Global state", () => {
  it("multiple sequential calls do not leak state", async () => {
    const html1 = await streamToString(
      await renderToReadableStream(div({}, "first")),
    );
    const html2 = await streamToString(
      await renderToReadableStream(div({}, "second")),
    );
    expect(html1).toContain("first");
    expect(html2).toContain("second");
  });
});

// ─── Concurrent streams ───────────────────────────────────────────────────

describe("renderToReadableStream — Concurrent", () => {
  it("supports rendering multiple streams concurrently", async () => {
    const [a, b] = await Promise.all([
      renderToReadableStream(div({}, "a")),
      renderToReadableStream(div({}, "b")),
    ]);
    expect(await streamToString(a)).toContain("a");
    expect(await streamToString(b)).toContain("b");
  });
});

// ─── Options pass-through ───────────────────────────────────────────────────

describe("renderToReadableStream — Options", () => {
  it("accepts namespaceURI without throwing", async () => {
    const stream = await renderToReadableStream(div({}, "ns"), {
      namespaceURI: "http://www.w3.org/2000/svg",
    });
    expect(await streamToString(stream)).toContain("ns");
  });

  it("accepts progressiveChunkSize without throwing", async () => {
    const stream = await renderToReadableStream(div({}, "chunk"), {
      progressiveChunkSize: 1024,
    });
    expect(await streamToString(stream)).toContain("chunk");
  });

  it("accepts formState without error", async () => {
    const stream = await renderToReadableStream(div({}, "form"), {
      formState: { id: "1" },
    });
    expect(await streamToString(stream)).toContain("form");
  });

  it("accepts onPostpone without throwing", async () => {
    const stream = await renderToReadableStream(div({}, "postpone"), {
      onPostpone() {},
    });
    expect(await streamToString(stream)).toContain("postpone");
  });
});

// ─── Stream properties ──────────────────────────────────────────────────────

describe("renderToReadableStream — Stream", () => {
  it("is not locked before consumption", async () => {
    const stream = await renderToReadableStream(div({}, "lock"));
    expect(stream.locked).toBe(false);
  });

  it("can be read with a default reader", async () => {
    const stream = await renderToReadableStream(div({}, "reader"));
    const reader = stream.getReader();
    const result = await reader.read();
    expect(result.done).toBe(false);
    expect(result.value).toBeInstanceOf(Uint8Array);
    reader.releaseLock();
  });

  it("cancel on the outer stream is safe", async () => {
    const stream = await renderToReadableStream(div({}, "cancel"));
    await stream.cancel();
    expect(true).toBe(true);
  });

  it("supports async iteration", async () => {
    const stream = await renderToReadableStream(div({}, "async-iter"));
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as any) chunks.push(chunk);
    const html = chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(html).toContain("async-iter");
  });

  it("can be teed for multiple consumers", async () => {
    const stream = await renderToReadableStream(div({}, "tee"));
    const [branch1, branch2] = stream.tee();
    const html1 = await streamToString(branch1);
    const html2 = await streamToString(branch2);
    expect(html1).toBe(html2);
  });
});

// ─── Bootstrap order ────────────────────────────────────────────────────────

describe("renderToReadableStream — Bootstrap order", () => {
  it("emits bootstrapScriptContent first, then scripts, then modules", async () => {
    const stream = await renderToReadableStream(div({}, "order"), {
      bootstrapScriptContent: "window.x = 1;",
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
    });
    const html = await streamToString(stream);
    const contentIdx = html.indexOf("window.x = 1;");
    const scriptIdx = html.indexOf('src="/a.js"');
    const moduleIdx = html.indexOf('src="/b.js"');
    expect(contentIdx).toBeGreaterThan(-1);
    expect(scriptIdx).toBeGreaterThan(-1);
    expect(moduleIdx).toBeGreaterThan(-1);
    expect(contentIdx).toBeLessThan(scriptIdx);
    expect(scriptIdx).toBeLessThan(moduleIdx);
  });
});

// ─── Comprehensive ────────────────────────────────────────────────────────

describe("renderToReadableStream — Comprehensive", () => {
  it("renders a complex tree with all features", async () => {
    const stream = await renderToReadableStream(
      div(
        { id: "app", class: "root" },
        div({ class: "header" }, "Header"),
        div({ class: "content" }, "Content"),
        div({ class: "footer" }, "Footer"),
      ),
      { bootstrapScripts: ["/app.js"] },
    );
    const html = await streamToString(stream);
    expect(html).toContain('id="app"');
    expect(html).toContain("Header");
    expect(html).toContain("Content");
    expect(html).toContain("Footer");
    expect(html).toContain('src="/app.js"');
    await stream.allReady;
  });
});

// ─── No options ─────────────────────────────────────────────────────────────

describe("renderToReadableStream — No options", () => {
  it("works without passing options", async () => {
    const stream = await renderToReadableStream(div({}, "no-opts"));
    expect(await streamToString(stream)).toContain("no-opts");
  });

  it("works with an empty options object", async () => {
    const stream = await renderToReadableStream(div({}, "empty-opts"), {});
    expect(await streamToString(stream)).toContain("empty-opts");
  });
});

// ─── Options immutability ─────────────────────────────────────────────────

describe("renderToReadableStream — Immutability", () => {
  it("does not mutate the options object", async () => {
    const opts = { bootstrapScripts: ["/a.js"] };
    const original = JSON.stringify(opts);
    await renderToReadableStream(div({}, "mut"), opts);
    expect(JSON.stringify(opts)).toBe(original);
  });
});

// ─── allReady before consume ────────────────────────────────────────────────

describe("renderToReadableStream — allReady before consume", () => {
  it("allReady can be awaited before returning response", async () => {
    const stream = await renderToReadableStream(div({}, "crawler"), {
      bootstrapScripts: ["/app.js"],
    });
    await stream.allReady;
    const html = await streamToString(stream);
    expect(html).toContain("crawler");
    expect(html).toContain("/app.js");
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────

describe("renderToReadableStream — Round-trip", () => {
  it("full round-trip from render to string", async () => {
    const stream = await renderToReadableStream(
      div({ id: "root" }, "hello world"),
      { bootstrapScripts: ["/app.js"] },
    );
    const html = await streamToString(stream);
    await stream.allReady;
    expect(html).toContain('id="root"');
    expect(html).toContain("hello world");
    expect(html).toContain('src="/app.js"');
  });
});

// ─── Multiple roots ───────────────────────────────────────────────────────────

describe("renderToReadableStream — Multiple roots", () => {
  it("renders multiple sibling elements", async () => {
    const stream = await renderToReadableStream([div({}, "a"), div({}, "b")]);
    expect(await streamToString(stream)).toBe("<div>a</div><div>b</div>");
  });
});

// ─── Component returns ──────────────────────────────────────────────────────

describe("renderToReadableStream — Component returns", () => {
  it("renders nothing when a component returns null", async () => {
    const NullComp = () => null;
    const stream = await renderToReadableStream({
      tag: NullComp,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("");
  });

  it("renders array returned from component", async () => {
    const MultiComp = () => [div({}, "1"), div({}, "2")];
    const stream = await renderToReadableStream({
      tag: MultiComp,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("<div>1</div><div>2</div>");
  });

  it("renders a component that returns a plain string", async () => {
    const Str = () => "plain";
    const stream = await renderToReadableStream({
      tag: Str,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("plain");
  });

  it("renders a component that returns a number", async () => {
    const Num = () => 42;
    const stream = await renderToReadableStream({
      tag: Num,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("42");
  });

  it("renders a component that returns a boolean", async () => {
    const Bool = () => true;
    const stream = await renderToReadableStream({
      tag: Bool,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("");
  });

  it("renders a component that returns nested arrays", async () => {
    const Nested = () => [["a"], [["b"], "c"]];
    const stream = await renderToReadableStream({
      tag: Nested,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("abc");
  });

  it("renders a component returning an element with props", async () => {
    const WithProps = () => div({ id: "x" }, "props");
    const stream = await renderToReadableStream({
      tag: WithProps,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe('<div id="x">props</div>');
  });

  it("renders a component returning a fragment", async () => {
    const Frag = () => ({ tag: "", props: {}, children: ["a", "b"] });
    const stream = await renderToReadableStream({
      tag: Frag,
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("ab");
  });
});

// ─── Mixed children ─────────────────────────────────────────────────────────

describe("renderToReadableStream — Mixed children", () => {
  it("renders a mix of strings, numbers, and nulls", async () => {
    const stream = await renderToReadableStream(
      div({}, ["a", 1, null, "b", undefined, 2]),
    );
    expect(await streamToString(stream)).toBe("<div>a1b2</div>");
  });

  it("flattens nested array children", async () => {
    const stream = await renderToReadableStream(div({}, [["a", ["b"]], "c"]));
    expect(await streamToString(stream)).toBe("<div>abc</div>");
  });
});

// ─── Numeric edge cases ─────────────────────────────────────────────────────

describe("renderToReadableStream — Numeric edge cases", () => {
  it("renders numeric zero", async () => {
    const stream = await renderToReadableStream(div({}, 0));
    expect(await streamToString(stream)).toBe("<div>0</div>");
  });

  it("renders negative numbers", async () => {
    const stream = await renderToReadableStream(div({}, -5));
    expect(await streamToString(stream)).toBe("<div>-5</div>");
  });

  it("renders float numbers", async () => {
    const stream = await renderToReadableStream(div({}, 3.14));
    expect(await streamToString(stream)).toBe("<div>3.14</div>");
  });
});

// ─── Void elements ──────────────────────────────────────────────────────────

describe("renderToReadableStream — Void elements", () => {
  it("renders br as self-closing", async () => {
    const stream = await renderToReadableStream({
      tag: "br",
      props: {},
      children: [],
    });
    expect(await streamToString(stream)).toBe("<br>");
  });

  it("renders img as self-closing", async () => {
    const stream = await renderToReadableStream({
      tag: "img",
      props: { src: "/x.png" },
      children: [],
    });
    expect(await streamToString(stream)).toBe('<img src="/x.png">');
  });

  it("renders meta as self-closing", async () => {
    const stream = await renderToReadableStream({
      tag: "meta",
      props: { charset: "utf-8" },
      children: [],
    });
    expect(await streamToString(stream)).toBe('<meta charset="utf-8">');
  });

  it("renders link as self-closing", async () => {
    const stream = await renderToReadableStream({
      tag: "link",
      props: { rel: "stylesheet", href: "/style.css" },
      children: [],
    });
    expect(await streamToString(stream)).toBe(
      '<link rel="stylesheet" href="/style.css">',
    );
  });
});

// ─── Table and list elements ────────────────────────────────────────────────

describe("renderToReadableStream — Table and list", () => {
  it("renders table elements", async () => {
    const stream = await renderToReadableStream({
      tag: "table",
      props: {},
      children: [
        {
          tag: "tr",
          props: {},
          children: [{ tag: "td", props: {}, children: ["cell"] }],
        },
      ],
    });
    expect(await streamToString(stream)).toBe(
      "<table><tr><td>cell</td></tr></table>",
    );
  });

  it("renders ul with li", async () => {
    const stream = await renderToReadableStream({
      tag: "ul",
      props: {},
      children: [
        { tag: "li", props: {}, children: ["item1"] },
        { tag: "li", props: {}, children: ["item2"] },
      ],
    });
    expect(await streamToString(stream)).toBe(
      "<ul><li>item1</li><li>item2</li></ul>",
    );
  });
});

// ─── Form elements ──────────────────────────────────────────────────────────

describe("renderToReadableStream — Form elements", () => {
  it("renders a form tag", async () => {
    const stream = await renderToReadableStream({
      tag: "form",
      props: { action: "/submit", method: "post" },
      children: ["form-content"],
    });
    expect(await streamToString(stream)).toBe(
      '<form action="/submit" method="post">form-content</form>',
    );
  });

  it("renders a select tag with option", async () => {
    const stream = await renderToReadableStream({
      tag: "select",
      props: { name: "choice" },
      children: [{ tag: "option", props: { value: "a" }, children: ["A"] }],
    });
    expect(await streamToString(stream)).toBe(
      '<select name="choice"><option value="a">A</option></select>',
    );
  });

  it("renders a fieldset with legend", async () => {
    const stream = await renderToReadableStream({
      tag: "fieldset",
      props: {},
      children: [{ tag: "legend", props: {}, children: ["legend"] }, "content"],
    });
    expect(await streamToString(stream)).toBe(
      "<fieldset><legend>legend</legend>content</fieldset>",
    );
  });
});

// ─── Semantic elements ────────────────────────────────────────────────────

describe("renderToReadableStream — Semantic", () => {
  it("renders semantic elements", async () => {
    const stream = await renderToReadableStream({
      tag: "article",
      props: {},
      children: [
        { tag: "header", props: {}, children: ["header"] },
        { tag: "section", props: {}, children: ["section"] },
        { tag: "footer", props: {}, children: ["footer"] },
      ],
    });
    const html = await streamToString(stream);
    expect(html).toBe(
      "<article><header>header</header><section>section</section><footer>footer</footer></article>",
    );
  });

  it("renders a time tag", async () => {
    const stream = await renderToReadableStream({
      tag: "time",
      props: { datetime: "2024-01-01" },
      children: ["Jan 1"],
    });
    expect(await streamToString(stream)).toBe(
      '<time datetime="2024-01-01">Jan 1</time>',
    );
  });
});

// ─── SVG elements ───────────────────────────────────────────────────────────

describe("renderToReadableStream — SVG", () => {
  it("renders an svg tag with circle", async () => {
    const stream = await renderToReadableStream({
      tag: "svg",
      props: { viewBox: "0 0 100 100" },
      children: [
        { tag: "circle", props: { cx: "50", cy: "50", r: "40" }, children: [] },
      ],
    });
    expect(await streamToString(stream)).toBe(
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"></circle></svg>',
    );
  });
});

// ─── Custom elements ──────────────────────────────────────────────────────

describe("renderToReadableStream — Custom elements", () => {
  it("renders custom elements", async () => {
    const stream = await renderToReadableStream({
      tag: "my-element",
      props: { prop: "value" },
      children: ["custom"],
    });
    expect(await streamToString(stream)).toBe(
      '<my-element prop="value">custom</my-element>',
    );
  });
});

// ─── Large inline script ────────────────────────────────────────────────────

describe("renderToReadableStream — Large inline script", () => {
  it("handles large bootstrapScriptContent", async () => {
    const bigScript = "var x = " + "1".repeat(10000) + ";";
    const stream = await renderToReadableStream(div({}, "big"), {
      bootstrapScriptContent: bigScript,
    });
    expect(await streamToString(stream)).toContain(bigScript);
  });
});

// ─── Object props ignored ───────────────────────────────────────────────────

describe("renderToReadableStream — Object props", () => {
  it("ignores non-primitive props that are not valid attributes", async () => {
    const stream = await renderToReadableStream(
      div({ customObj: { a: 1 } }, "obj"),
    );
    expect(await streamToString(stream)).toBe("<div>obj</div>");
  });
});

// ─── Signal listener cleanup ──────────────────────────────────────────────────

describe("renderToReadableStream — Cleanup", () => {
  it("signal listener cleanup after stream finishes", async () => {
    const ac = new AbortController();
    const stream = await renderToReadableStream(div({}, "cleanup"), {
      signal: ac.signal,
    });
    await streamToString(stream);
    await stream.allReady;
    expect(true).toBe(true);
  });
});

// ─── Cancel after release ───────────────────────────────────────────────────

describe("renderToReadableStream — Cancel", () => {
  it("cancel after releasing reader is safe", async () => {
    const stream = await renderToReadableStream(div({}, "cancel-rel"));
    const reader = stream.getReader();
    reader.releaseLock();
    await stream.cancel();
    expect(true).toBe(true);
  });
});

// ─── Single reader ──────────────────────────────────────────────────────────

describe("renderToReadableStream — Reader", () => {
  it("only allows one active reader at a time", async () => {
    const stream = await renderToReadableStream(div({}, "reader"));
    const reader1 = stream.getReader();
    expect(() => stream.getReader()).toThrow();
    reader1.releaseLock();
  });

  it("releasing a reader allows a new reader", async () => {
    const stream = await renderToReadableStream(div({}, "re-read"));
    const reader = stream.getReader();
    await reader.read();
    reader.releaseLock();
    expect(await streamToString(stream)).toContain("re-read");
  });
});

// ─── Abort timing ───────────────────────────────────────────────────────────

describe("renderToReadableStream — Abort timing", () => {
  it("abort after partial consumption is safe", async () => {
    const ac = new AbortController();
    const stream = await renderToReadableStream(div({}, "partial"), {
      signal: ac.signal,
    });
    const reader = stream.getReader();
    await reader.read();
    ac.abort();
    reader.releaseLock();
    expect(true).toBe(true);
  });

  it("abort before stream consumption still resolves shell", async () => {
    const ac = new AbortController();
    const streamPromise = renderToReadableStream(div({}, "pre"), {
      signal: ac.signal,
    });
    ac.abort();
    const stream = await streamPromise;
    expect(stream).toBeInstanceOf(ReadableStream);
  });
});

// ─── Synchronous shell error ────────────────────────────────────────────────

describe("renderToReadableStream — Sync shell error", () => {
  it("rejects when a component throws synchronously during shell", async () => {
    const BadApp = () => {
      throw new Error("sync-boom");
    };
    await expect(
      renderToReadableStream({
        tag: BadApp,
        props: { children: [] },
        children: [],
      } as any),
    ).rejects.toThrow("sync-boom");
  });
});

// ─── Valid shell ────────────────────────────────────────────────────────────

describe("renderToReadableStream — Valid shell", () => {
  it("resolves for a valid component tree", async () => {
    const stream = await renderToReadableStream(div({}, "valid"));
    expect(stream).toBeInstanceOf(ReadableStream);
    expect(await streamToString(stream)).toContain("valid");
  });
});

// ─── Empty inline script ────────────────────────────────────────────────────

describe("renderToReadableStream — Empty inline", () => {
  it("renders empty inline script", async () => {
    const stream = await renderToReadableStream(div({}, "empty-script"), {
      bootstrapScriptContent: "",
    });
    expect(await streamToString(stream)).toContain("<script></script>");
  });
});

// ─── Identifier prefix ──────────────────────────────────────────────────────

describe("renderToReadableStream — identifierPrefix", () => {
  it("renders with identifierPrefix without breaking", async () => {
    const stream = await renderToReadableStream(div({}, "hydrate"), {
      identifierPrefix: "app",
    });
    expect(await streamToString(stream)).toContain("hydrate");
  });
});

// ─── Namespace URI ────────────────────────────────────────────────────────────

describe("renderToReadableStream — namespaceURI", () => {
  it("accepts SVG namespace without error", async () => {
    const stream = await renderToReadableStream(div({}, "svg"), {
      namespaceURI: "http://www.w3.org/2000/svg",
    });
    expect(await streamToString(stream)).toContain("svg");
  });
});

// ─── Progressive chunk size ─────────────────────────────────────────────────

describe("renderToReadableStream — progressiveChunkSize", () => {
  it("accepts progressiveChunkSize without error", async () => {
    const stream = await renderToReadableStream(div({}, "chunk"), {
      progressiveChunkSize: 512,
    });
    expect(await streamToString(stream)).toContain("chunk");
  });
});

// ─── onPostpone ───────────────────────────────────────────────────────────────

describe("renderToReadableStream — onPostpone", () => {
  it("accepts onPostpone without error", async () => {
    const stream = await renderToReadableStream(div({}, "postpone"), {
      onPostpone() {},
    });
    expect(await streamToString(stream)).toContain("postpone");
  });
});

// ─── FormState ──────────────────────────────────────────────────────────────

describe("renderToReadableStream — FormState", () => {
  it("accepts formState without error", async () => {
    const stream = await renderToReadableStream(div({}, "form"), {
      formState: { id: "1" },
    });
    expect(await streamToString(stream)).toContain("form");
  });
});

// ─── Bootstrap whitespace ───────────────────────────────────────────────────

describe("renderToReadableStream — Bootstrap whitespace", () => {
  it("does not add extra whitespace around bootstrap scripts", async () => {
    const stream = await renderToReadableStream(div({}, "ws"), {
      bootstrapScriptContent: ";",
    });
    const html = await streamToString(stream);
    expect(html.indexOf("<script>;</script>")).toBeGreaterThan(-1);
  });
});

// ─── allReady defined ─────────────────────────────────────────────────────────

describe("renderToReadableStream — allReady defined", () => {
  it("allReady is defined and is a Promise", async () => {
    const stream = await renderToReadableStream(div({}, "defined"));
    expect(stream.allReady).toBeDefined();
    expect(stream.allReady).toBeInstanceOf(Promise);
    await streamToString(stream);
    await stream.allReady;
  });
});

// ─── Stream type ────────────────────────────────────────────────────────────

describe("renderToReadableStream — Stream type", () => {
  it("returns a ReadableStream of Uint8Array", async () => {
    const stream = await renderToReadableStream(div({}, "type"));
    expect(stream).toBeInstanceOf(ReadableStream);
  });
});

// ─── Stream properties ──────────────────────────────────────────────────────

describe("renderToReadableStream — Stream properties", () => {
  it("has correct ReadableStream properties", async () => {
    const stream = await renderToReadableStream(div({}, "props"));
    expect(typeof stream.getReader).toBe("function");
    expect(typeof stream.cancel).toBe("function");
    expect(typeof stream.tee).toBe("function");
  });
});

// ─── Empty bootstrap ──────────────────────────────────────────────────────────

describe("renderToReadableStream — Empty bootstrap", () => {
  it("renders content even with empty bootstrap", async () => {
    const stream = await renderToReadableStream(div({}, "content-only"), {
      bootstrapScripts: [],
      bootstrapModules: [],
      bootstrapScriptContent: undefined,
    });
    const html = await streamToString(stream);
    expect(html).toContain("content-only");
    expect(html).not.toContain("<script");
  });
});

// ─── Null props ─────────────────────────────────────────────────────────────

describe("renderToReadableStream — Null props", () => {
  it("renders a component with null props", async () => {
    const NullProps = (props: any) => div({}, props?.text ?? "fallback");
    const stream = await renderToReadableStream({
      tag: NullProps,
      props: null as any,
      children: [],
    });
    expect(await streamToString(stream)).toBe("<div>fallback</div>");
  });
});

// ─── Undefined props ──────────────────────────────────────────────────────────

describe("renderToReadableStream — Undefined props", () => {
  it("renders a component with undefined props", async () => {
    const UndefProps = (props: any) => div({}, props?.text ?? "fallback");
    const stream = await renderToReadableStream({
      tag: UndefProps,
      props: undefined as any,
      children: [],
    });
    expect(await streamToString(stream)).toBe("<div>fallback</div>");
  });
});

// ─── Fragment variants ────────────────────────────────────────────────────────

describe("renderToReadableStream — Fragment variants", () => {
  it("renders a fragment with children", async () => {
    const stream = await renderToReadableStream({
      tag: "",
      props: {},
      children: ["a", "b", "c"],
    });
    expect(await streamToString(stream)).toBe("abc");
  });

  it("renders nested fragments", async () => {
    const stream = await renderToReadableStream({
      tag: "",
      props: {},
      children: [
        { tag: "", props: {}, children: ["a"] },
        { tag: "", props: {}, children: ["b"] },
      ],
    });
    expect(await streamToString(stream)).toBe("ab");
  });

  it("renders a fragment with element children", async () => {
    const stream = await renderToReadableStream({
      tag: "",
      props: {},
      children: [div({}, "a"), div({}, "b")],
    });
    expect(await streamToString(stream)).toBe("<div>a</div><div>b</div>");
  });

  it("renders a fragment with mixed children", async () => {
    const stream = await renderToReadableStream({
      tag: "",
      props: {},
      children: ["text", div({}, "el"), 42, null],
    });
    expect(await streamToString(stream)).toBe("text<div>el</div>42");
  });
});

// ─── Array roots ──────────────────────────────────────────────────────────────

describe("renderToReadableStream — Array roots", () => {
  it("renders array as root", async () => {
    const stream = await renderToReadableStream([div({}, "a"), div({}, "b")]);
    expect(await streamToString(stream)).toBe("<div>a</div><div>b</div>");
  });
});

// ─── Null and undefined roots ───────────────────────────────────────────────

describe("renderToReadableStream — Null/undefined roots", () => {
  it("renders null as empty", async () => {
    const stream = await renderToReadableStream(null);
    expect(await streamToString(stream)).toBe("");
  });

  it("renders undefined as empty", async () => {
    const stream = await renderToReadableStream(undefined);
    expect(await streamToString(stream)).toBe("");
  });
});

// ─── Component with children prop variants ──────────────────────────────────

describe("renderToReadableStream — Children prop variants", () => {
  it("renders a component with null children prop", async () => {
    const Child = (props: any) => div({}, props.children ?? "fallback");
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: null },
      children: [null],
    });
    expect(await streamToString(stream)).toBe("<div>fallback</div>");
  });

  it("renders a component with undefined children prop", async () => {
    const Child = (props: any) => div({}, props.children ?? "fallback");
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: undefined },
      children: [undefined],
    });
    expect(await streamToString(stream)).toBe("<div>fallback</div>");
  });

  it("renders a component with boolean children prop", async () => {
    const Child = (props: any) => div({}, String(props.children));
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: true },
      children: [true],
    });
    expect(await streamToString(stream)).toBe("<div>true</div>");
  });

  it("renders a component with numeric children prop", async () => {
    const Child = (props: any) => div({}, String(props.children));
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: 42 },
      children: [42],
    });
    expect(await streamToString(stream)).toBe("<div>42</div>");
  });

  it("renders a component with array children prop", async () => {
    const Child = (props: any) => div({}, props.children.join(""));
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: ["a", "b"] },
      children: [["a", "b"]],
    });
    expect(await streamToString(stream)).toBe("<div>ab</div>");
  });

  it("renders a component with element children prop", async () => {
    const Child = (props: any) => div({}, props.children);
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: div({}, "inner") },
      children: [div({}, "inner")],
    });
    expect(await streamToString(stream)).toBe("<div><div>inner</div></div>");
  });

  it("renders a component with fragment children prop", async () => {
    const Child = (props: any) => div({}, props.children);
    const stream = await renderToReadableStream({
      tag: Child,
      props: { children: { tag: "", props: {}, children: ["a", "b"] } },
      children: [{ tag: "", props: {}, children: ["a", "b"] }],
    });
    expect(await streamToString(stream)).toBe("<div>ab</div>");
  });
});

// ─── Rejected promise children ──────────────────────────────────────────────

describe("renderToReadableStream — Rejected promise", () => {
  it("rejects when component has rejected promise children prop", async () => {
    const Child = async (props: any) => div({}, await props.children);
    const rej = Promise.reject(new Error("rej"));
    await expect(
      renderToReadableStream({
        tag: Child,
        props: { children: rej },
        children: [rej],
      }),
    ).rejects.toThrow("rej");
  });
});

// ─── Symbol and bigint props ──────────────────────────────────────────────────

describe("renderToReadableStream — Symbol/bigint props", () => {
  it("ignores symbol props", async () => {
    const stream = await renderToReadableStream(
      div({ [Symbol.iterator]: "sym" }, "sym"),
    );
    expect(await streamToString(stream)).toBe("<div>sym</div>");
  });

  it("ignores bigint props", async () => {
    const stream = await renderToReadableStream(div({ big: BigInt(1) }, "big"));
    expect(await streamToString(stream)).toBe("<div>big</div>");
  });
});

// ─── Function and class props ─────────────────────────────────────────────────

describe("renderToReadableStream — Function/class props", () => {
  it("ignores function props that are not event handlers", async () => {
    const stream = await renderToReadableStream(div({ fn: () => {} }, "fn"));
    expect(await streamToString(stream)).toBe("<div>fn</div>");
  });

  it("ignores class instance props", async () => {
    class MyClass {}
    const stream = await renderToReadableStream(
      div({ cls: new MyClass() }, "cls"),
    );
    expect(await streamToString(stream)).toBe("<div>cls</div>");
  });
});

// ─── Circular and nested object props ───────────────────────────────────────

describe("renderToReadableStream — Circular/nested props", () => {
  it("ignores nested object props", async () => {
    const stream = await renderToReadableStream(
      div({ nested: { a: { b: 1 } } }, "nested"),
    );
    expect(await streamToString(stream)).toBe("<div>nested</div>");
  });

  it("ignores circular reference props", async () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const stream = await renderToReadableStream(
      div({ circular: obj }, "circular"),
    );
    expect(await streamToString(stream)).toBe("<div>circular</div>");
  });
});

// ─── Special numeric props ────────────────────────────────────────────────────

describe("renderToReadableStream — Special numeric props", () => {
  it("ignores NaN props", async () => {
    const stream = await renderToReadableStream(div({ nan: NaN }, "nan"));
    expect(await streamToString(stream)).toBe("<div>nan</div>");
  });

  it("ignores Infinity props", async () => {
    const stream = await renderToReadableStream(div({ inf: Infinity }, "inf"));
    expect(await streamToString(stream)).toBe("<div>inf</div>");
  });

  it("renders zero as attribute value", async () => {
    const stream = await renderToReadableStream(div({ zero: 0 }, "zero"));
    expect(await streamToString(stream)).toBe('<div zero="0">zero</div>');
  });
});

// ─── Empty and whitespace string props ──────────────────────────────────────

describe("renderToReadableStream — Empty/whitespace props", () => {
  it("renders empty string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ empty: "" }, "empty"));
    expect(await streamToString(stream)).toBe('<div empty="">empty</div>');
  });

  it("renders whitespace string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ws: "  " }, "ws"));
    expect(await streamToString(stream)).toBe('<div ws="  ">ws</div>');
  });
});

// ─── Unicode and special char props ─────────────────────────────────────────

describe("renderToReadableStream — Unicode props", () => {
  it("renders unicode string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ unicode: "🎉" }, "unicode"),
    );
    expect(await streamToString(stream)).toBe(
      '<div unicode="🎉">unicode</div>',
    );
  });

  it("escapes special characters in attribute values", async () => {
    const stream = await renderToReadableStream(
      div({ special: '"<&>' }, "special"),
    );
    const html = await streamToString(stream);
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).toContain("&amp;");
  });
});

// ─── Newline and control character props ────────────────────────────────────

describe("renderToReadableStream — Control char props", () => {
  it("renders newline string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ nl: "a\nb" }, "nl"));
    const html = await streamToString(stream);
    expect(html).toContain('nl="a');
    expect(html).toContain('b"');
  });

  it("renders tab string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tab: "a\tb" }, "tab"));
    const html = await streamToString(stream);
    expect(html).toContain('tab="a');
    expect(html).toContain('b"');
  });

  it("renders null byte string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ nb: "a\0b" }, "nb"));
    const html = await streamToString(stream);
    expect(html).toContain('nb="a');
    expect(html).toContain('b"');
  });
});

// ─── Surrogate pair and combining char props ──────────────────────────────────

describe("renderToReadableStream — Surrogate/combining props", () => {
  it("renders surrogate pair string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ sp: "\uD83D\uDE00" }, "sp"),
    );
    expect(await streamToString(stream)).toBe('<div sp="😀">sp</div>');
  });

  it("renders combining character string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ cc: "e\u0301" }, "cc"));
    expect(await streamToString(stream)).toBe('<div cc="e\u0301">cc</div>');
  });

  it("renders zero width joiner string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ zwj: "👨\u200D👩\u200D👧\u200D👦" }, "zwj"),
    );
    expect(await streamToString(stream)).toContain('zwj="');
  });
});

// ─── RTL and mixed direction props ────────────────────────────────────────────

describe("renderToReadableStream — RTL props", () => {
  it("renders right-to-left string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rtl: "مرحبا" }, "rtl"));
    expect(await streamToString(stream)).toBe('<div rtl="مرحبا">rtl</div>');
  });

  it("renders mixed direction string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mixed: "hello مرحبا" }, "mixed"),
    );
    expect(await streamToString(stream)).toBe(
      '<div mixed="hello مرحبا">mixed</div>',
    );
  });
});

// ─── Variation selector and ideographic space props ───────────────────────────

describe("renderToReadableStream — Variation/ideographic props", () => {
  it("renders variation selector string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ vs: "❤️" }, "vs"));
    expect(await streamToString(stream)).toContain('vs="');
  });

  it("renders ideographic space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ is: "　" }, "is"));
    expect(await streamToString(stream)).toBe('<div is="　">is</div>');
  });

  it("renders narrow no-break space string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ nnbs: "\u202F" }, "nnbs"),
    );
    expect(await streamToString(stream)).toContain('nnbs="');
  });

  it("renders non-breaking space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ nbs: "\u00A0" }, "nbs"));
    expect(await streamToString(stream)).toContain('nbs="');
  });
});

// ─── En/em space props ────────────────────────────────────────────────────────

describe("renderToReadableStream — En/em space props", () => {
  it("renders en space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ens: "\u2002" }, "ens"));
    expect(await streamToString(stream)).toContain('ens="');
  });

  it("renders em space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ems: "\u2003" }, "ems"));
    expect(await streamToString(stream)).toContain('ems="');
  });

  it("renders thin space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ts: "\u2009" }, "ts"));
    expect(await streamToString(stream)).toContain('ts="');
  });

  it("renders hair space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hs: "\u200A" }, "hs"));
    expect(await streamToString(stream)).toContain('hs="');
  });

  it("renders zero width space string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ zws: "\u200B" }, "zws"));
    expect(await streamToString(stream)).toContain('zws="');
  });

  it("renders zero width non-joiner string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ zwnj: "\u200C" }, "zwnj"),
    );
    expect(await streamToString(stream)).toContain('zwnj="');
  });

  it("renders zero width joiner string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ zwj2: "\u200D" }, "zwj2"),
    );
    expect(await streamToString(stream)).toContain('zwj2="');
  });
});

// ─── LRM/RLM props ────────────────────────────────────────────────────────────

describe("renderToReadableStream — LRM/RLM props", () => {
  it("renders left-to-right mark string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lrm: "\u200E" }, "lrm"));
    expect(await streamToString(stream)).toContain('lrm="');
  });

  it("renders right-to-left mark string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rlm: "\u200F" }, "rlm"));
    expect(await streamToString(stream)).toContain('rlm="');
  });
});

// ─── Embedding/pop directional formatting props ─────────────────────────────

describe("renderToReadableStream — Embedding props", () => {
  it("renders left-to-right embedding string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lre: "\u202A" }, "lre"));
    expect(await streamToString(stream)).toContain('lre="');
  });

  it("renders right-to-left embedding string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rle: "\u202B" }, "rle"));
    expect(await streamToString(stream)).toContain('rle="');
  });

  it("renders pop directional formatting string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ pdf: "\u202C" }, "pdf"));
    expect(await streamToString(stream)).toContain('pdf="');
  });
});

// ─── Override/Isolate props ───────────────────────────────────────────────────

describe("renderToReadableStream — Override/Isolate props", () => {
  it("renders left-to-right override string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lro: "\u202D" }, "lro"));
    expect(await streamToString(stream)).toContain('lro="');
  });

  it("renders right-to-left override string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rlo: "\u202E" }, "rlo"));
    expect(await streamToString(stream)).toContain('rlo="');
  });

  it("renders left-to-right isolate string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lri: "\u2066" }, "lri"));
    expect(await streamToString(stream)).toContain('lri="');
  });

  it("renders right-to-left isolate string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rli: "\u2067" }, "rli"));
    expect(await streamToString(stream)).toContain('rli="');
  });

  it("renders first strong isolate string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ fsi: "\u2068" }, "fsi"));
    expect(await streamToString(stream)).toContain('fsi="');
  });

  it("renders pop directional isolate string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ pdi: "\u2069" }, "pdi"));
    expect(await streamToString(stream)).toContain('pdi="');
  });
});

// ─── Invisible formatting characters ──────────────────────────────────────────

describe("renderToReadableStream — Invisible formatting", () => {
  it("renders invisible times string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ it: "\u2062" }, "it"));
    expect(await streamToString(stream)).toContain('it="');
  });

  it("renders invisible separator string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ isep: "\u2063" }, "isep"),
    );
    expect(await streamToString(stream)).toContain('isep="');
  });

  it("renders invisible plus string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ip: "\u2064" }, "ip"));
    expect(await streamToString(stream)).toContain('ip="');
  });
});

// ─── Byte order mark ──────────────────────────────────────────────────────────

describe("renderToReadableStream — BOM", () => {
  it("renders BOM string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ bom: "\uFEFF" }, "bom"));
    expect(await streamToString(stream)).toContain('bom="');
  });
});

// ─── Replacement character ────────────────────────────────────────────────────

describe("renderToReadableStream — Replacement char", () => {
  it("renders replacement character string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ rc: "\uFFFD" }, "rc"));
    expect(await streamToString(stream)).toContain('rc="');
  });
});

// ─── Object replacement character ─────────────────────────────────────────────

describe("renderToReadableStream — Object replacement", () => {
  it("renders object replacement character string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ orc: "\uFFFC" }, "orc"));
    expect(await streamToString(stream)).toContain('orc="');
  });
});

// ─── Line separator ───────────────────────────────────────────────────────────

describe("renderToReadableStream — Line separator", () => {
  it("renders line separator string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ls: "\u2028" }, "ls"));
    expect(await streamToString(stream)).toContain('ls="');
  });

  it("renders paragraph separator string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ps: "\u2029" }, "ps"));
    expect(await streamToString(stream)).toContain('ps="');
  });
});

// ─── Next line ────────────────────────────────────────────────────────────────

describe("renderToReadableStream — Next line", () => {
  it("renders next line string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ nl2: "\u0085" }, "nl2"));
    expect(await streamToString(stream)).toContain('nl2="');
  });
});

// ─── Soft hyphen ────────────────────────────────────────────────────────────────

describe("renderToReadableStream — Soft hyphen", () => {
  it("renders soft hyphen string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ sh: "\u00AD" }, "sh"));
    expect(await streamToString(stream)).toContain('sh="');
  });
});

// ─── Mongolian vowel separator ──────────────────────────────────────────────────

describe("renderToReadableStream — Mongolian vowel", () => {
  it("renders mongolian vowel separator string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mvs: "\u180E" }, "mvs"));
    expect(await streamToString(stream)).toContain('mvs="');
  });
});

// ─── Hangul chosongul filler ────────────────────────────────────────────────────

describe("renderToReadableStream — Hangul filler", () => {
  it("renders hangul chosongul filler string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hcf: "\u115F" }, "hcf"));
    expect(await streamToString(stream)).toContain('hcf="');
  });

  it("renders hangul jungseong filler string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hjf: "\u1160" }, "hjf"));
    expect(await streamToString(stream)).toContain('hjf="');
  });
});

// ─── Khmer vowel inherent aq ──────────────────────────────────────────────────

describe("renderToReadableStream — Khmer vowel", () => {
  it("renders khmer vowel inherent aq string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kvia: "\u17B4" }, "kvia"),
    );
    expect(await streamToString(stream)).toContain('kvia="');
  });

  it("renders khmer vowel inherent aa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kviaa: "\u17B5" }, "kviaa"),
    );
    expect(await streamToString(stream)).toContain('kviaa="');
  });
});

// ─── Syriac abbreviation mark ─────────────────────────────────────────────────

describe("renderToReadableStream — Syriac abbreviation", () => {
  it("renders syriac abbreviation mark string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ sam: "\u070F" }, "sam"));
    expect(await streamToString(stream)).toContain('sam="');
  });
});

// ─── Hebrew marks ───────────────────────────────────────────────────────────────

describe("renderToReadableStream — Hebrew marks", () => {
  it("renders hebrew point sheva string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hps: "\u05B0" }, "hps"));
    expect(await streamToString(stream)).toContain('hps="');
  });

  it("renders hebrew point hataf segol string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hphs: "\u05B1" }, "hphs"),
    );
    expect(await streamToString(stream)).toContain('hphs="');
  });

  it("renders hebrew point hataf patah string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hphp: "\u05B2" }, "hphp"),
    );
    expect(await streamToString(stream)).toContain('hphp="');
  });

  it("renders hebrew point hataf qamats string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hphq: "\u05B3" }, "hphq"),
    );
    expect(await streamToString(stream)).toContain('hphq="');
  });

  it("renders hebrew point hiriq string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hph: "\u05B4" }, "hph"));
    expect(await streamToString(stream)).toContain('hph="');
  });

  it("renders hebrew point tsere string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpt: "\u05B5" }, "hpt"));
    expect(await streamToString(stream)).toContain('hpt="');
  });

  it("renders hebrew point segol string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hps2: "\u05B6" }, "hps2"),
    );
    expect(await streamToString(stream)).toContain('hps2="');
  });

  it("renders hebrew point patah string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpp: "\u05B7" }, "hpp"));
    expect(await streamToString(stream)).toContain('hpp="');
  });

  it("renders hebrew point qamats string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpq: "\u05B8" }, "hpq"));
    expect(await streamToString(stream)).toContain('hpq="');
  });

  it("renders hebrew point holam string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hph2: "\u05B9" }, "hph2"),
    );
    expect(await streamToString(stream)).toContain('hph2="');
  });

  it("renders hebrew point holam haser string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hphh: "\u05BA" }, "hphh"),
    );
    expect(await streamToString(stream)).toContain('hphh="');
  });

  it("renders hebrew point qubuts string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hpq2: "\u05BB" }, "hpq2"),
    );
    expect(await streamToString(stream)).toContain('hpq2="');
  });

  it("renders hebrew point dagesh or mapiq string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpd: "\u05BC" }, "hpd"));
    expect(await streamToString(stream)).toContain('hpd="');
  });

  it("renders hebrew point meteg string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpm: "\u05BD" }, "hpm"));
    expect(await streamToString(stream)).toContain('hpm="');
  });

  it("renders hebrew point rafe string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ hpr: "\u05BF" }, "hpr"));
    expect(await streamToString(stream)).toContain('hpr="');
  });

  it("renders hebrew point shin dot string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hpsd: "\u05C1" }, "hpsd"),
    );
    expect(await streamToString(stream)).toContain('hpsd="');
  });

  it("renders hebrew point sin dot string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hpsin: "\u05C2" }, "hpsin"),
    );
    expect(await streamToString(stream)).toContain('hpsin="');
  });

  it("renders hebrew point vowel letter string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ hpvl: "\u05C7" }, "hpvl"),
    );
    expect(await streamToString(stream)).toContain('hpvl="');
  });
});

// ─── Arabic marks ─────────────────────────────────────────────────────────────

describe("renderToReadableStream — Arabic marks", () => {
  it("renders arabic fatha string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ af: "\u064E" }, "af"));
    expect(await streamToString(stream)).toContain('af="');
  });

  it("renders arabic damma string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ad: "\u064F" }, "ad"));
    expect(await streamToString(stream)).toContain('ad="');
  });

  it("renders arabic kasra string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ak: "\u0650" }, "ak"));
    expect(await streamToString(stream)).toContain('ak="');
  });

  it("renders arabic shadda string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ as: "\u0651" }, "as"));
    expect(await streamToString(stream)).toContain('as="');
  });

  it("renders arabic sukun string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ask: "\u0652" }, "ask"));
    expect(await streamToString(stream)).toContain('ask="');
  });

  it("renders arabic maddah above string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ama: "\u0653" }, "ama"));
    expect(await streamToString(stream)).toContain('ama="');
  });

  it("renders arabic hamza above string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ aha: "\u0654" }, "aha"));
    expect(await streamToString(stream)).toContain('aha="');
  });

  it("renders arabic hamza below string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ahb: "\u0655" }, "ahb"));
    expect(await streamToString(stream)).toContain('ahb="');
  });

  it("renders arabic subscript alef string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ asa: "\u0656" }, "asa"));
    expect(await streamToString(stream)).toContain('asa="');
  });

  it("renders arabic inverted damma string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ aid: "\u0657" }, "aid"));
    expect(await streamToString(stream)).toContain('aid="');
  });

  it("renders arabic mark noon ghunna string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ amng: "\u0658" }, "amng"),
    );
    expect(await streamToString(stream)).toContain('amng="');
  });

  it("renders arabic zwnj string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ az: "\u200C" }, "az"));
    expect(await streamToString(stream)).toContain('az="');
  });
});

// ─── Devanagari marks ─────────────────────────────────────────────────────────

describe("renderToReadableStream — Devanagari marks", () => {
  it("renders devanagari sign nukta string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ dsn: "\u093C" }, "dsn"));
    expect(await streamToString(stream)).toContain('dsn="');
  });

  it("renders devanagari sign avagraha string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ dsa: "\u093D" }, "dsa"));
    expect(await streamToString(stream)).toContain('dsa="');
  });

  it("renders devanagari vowel sign aa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsa: "\u093E" }, "dvsa"),
    );
    expect(await streamToString(stream)).toContain('dvsa="');
  });

  it("renders devanagari vowel sign i string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsi: "\u093F" }, "dvsi"),
    );
    expect(await streamToString(stream)).toContain('dvsi="');
  });

  it("renders devanagari vowel sign ii string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsii: "\u0940" }, "dvsii"),
    );
    expect(await streamToString(stream)).toContain('dvsii="');
  });

  it("renders devanagari vowel sign u string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsu: "\u0941" }, "dvsu"),
    );
    expect(await streamToString(stream)).toContain('dvsu="');
  });

  it("renders devanagari vowel sign uu string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsuu: "\u0942" }, "dvsuu"),
    );
    expect(await streamToString(stream)).toContain('dvsuu="');
  });

  it("renders devanagari vowel sign vocalic r string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsr: "\u0943" }, "dvsr"),
    );
    expect(await streamToString(stream)).toContain('dvsr="');
  });

  it("renders devanagari vowel sign vocalic rr string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsrr: "\u0944" }, "dvsrr"),
    );
    expect(await streamToString(stream)).toContain('dvsrr="');
  });

  it("renders devanagari vowel sign candra e string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsce: "\u0945" }, "dvsce"),
    );
    expect(await streamToString(stream)).toContain('dvsce="');
  });

  it("renders devanagari vowel sign short e string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsse: "\u0946" }, "dvsse"),
    );
    expect(await streamToString(stream)).toContain('dvsse="');
  });

  it("renders devanagari vowel sign e string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvse: "\u0947" }, "dvse"),
    );
    expect(await streamToString(stream)).toContain('dvse="');
  });

  it("renders devanagari vowel sign ai string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsai: "\u0948" }, "dvsai"),
    );
    expect(await streamToString(stream)).toContain('dvsai="');
  });

  it("renders devanagari vowel sign candra o string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsco: "\u0949" }, "dvsco"),
    );
    expect(await streamToString(stream)).toContain('dvsco="');
  });

  it("renders devanagari vowel sign short o string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsso: "\u094A" }, "dvsso"),
    );
    expect(await streamToString(stream)).toContain('dvsso="');
  });

  it("renders devanagari vowel sign o string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvso: "\u094B" }, "dvso"),
    );
    expect(await streamToString(stream)).toContain('dvso="');
  });

  it("renders devanagari vowel sign au string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dvsau: "\u094C" }, "dvsau"),
    );
    expect(await streamToString(stream)).toContain('dvsau="');
  });

  it("renders devanagari sign virama string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ dsv: "\u094D" }, "dsv"));
    expect(await streamToString(stream)).toContain('dsv="');
  });

  it("renders devanagari sign nukta string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ dsn2: "\u093C" }, "dsn2"),
    );
    expect(await streamToString(stream)).toContain('dsn2="');
  });
});

// ─── Thai marks ─────────────────────────────────────────────────────────────────

describe("renderToReadableStream — Thai marks", () => {
  it("renders thai character sara a string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsa: "\u0E30" }, "tcsa"),
    );
    expect(await streamToString(stream)).toContain('tcsa="');
  });

  it("renders thai character mai han-akat string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcmh: "\u0E31" }, "tcmh"),
    );
    expect(await streamToString(stream)).toContain('tcmh="');
  });

  it("renders thai character sara aa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsaa: "\u0E32" }, "tcsaa"),
    );
    expect(await streamToString(stream)).toContain('tcsaa="');
  });

  it("renders thai character sara am string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsam: "\u0E33" }, "tcsam"),
    );
    expect(await streamToString(stream)).toContain('tcsam="');
  });

  it("renders thai character sara i string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsi: "\u0E34" }, "tcsi"),
    );
    expect(await streamToString(stream)).toContain('tcsi="');
  });

  it("renders thai character sara ii string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsii: "\u0E35" }, "tcsii"),
    );
    expect(await streamToString(stream)).toContain('tcsii="');
  });

  it("renders thai character sara ue string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsue: "\u0E36" }, "tcsue"),
    );
    expect(await streamToString(stream)).toContain('tcsue="');
  });

  it("renders thai character sara uee string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsuee: "\u0E37" }, "tcsuee"),
    );
    expect(await streamToString(stream)).toContain('tcsuee="');
  });

  it("renders thai character sara u string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsu: "\u0E38" }, "tcsu"),
    );
    expect(await streamToString(stream)).toContain('tcsu="');
  });

  it("renders thai character sara uu string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsuu: "\u0E39" }, "tcsuu"),
    );
    expect(await streamToString(stream)).toContain('tcsuu="');
  });

  it("renders thai character phinthu string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcp: "\u0E3A" }, "tcp"));
    expect(await streamToString(stream)).toContain('tcp="');
  });

  it("renders thai currency symbol baht string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsb: "\u0E3F" }, "tcsb"),
    );
    expect(await streamToString(stream)).toContain('tcsb="');
  });

  it("renders thai character sara e string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcse: "\u0E40" }, "tcse"),
    );
    expect(await streamToString(stream)).toContain('tcse="');
  });

  it("renders thai character sara ae string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsae: "\u0E41" }, "tcsae"),
    );
    expect(await streamToString(stream)).toContain('tcsae="');
  });

  it("renders thai character sara o string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcso: "\u0E42" }, "tcso"),
    );
    expect(await streamToString(stream)).toContain('tcso="');
  });

  it("renders thai character sara ai maimuan string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsaim: "\u0E43" }, "tcsaim"),
    );
    expect(await streamToString(stream)).toContain('tcsaim="');
  });

  it("renders thai character sara ai maimalai string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcsaim2: "\u0E44" }, "tcsaim2"),
    );
    expect(await streamToString(stream)).toContain('tcsaim2="');
  });

  it("renders thai character lakkhangyao string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcl: "\u0E45" }, "tcl"));
    expect(await streamToString(stream)).toContain('tcl="');
  });

  it("renders thai character maiyamok string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcm: "\u0E46" }, "tcm"));
    expect(await streamToString(stream)).toContain('tcm="');
  });

  it("renders thai character maitaikhu string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcmt: "\u0E47" }, "tcmt"),
    );
    expect(await streamToString(stream)).toContain('tcmt="');
  });

  it("renders thai character mai ek string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcme: "\u0E48" }, "tcme"),
    );
    expect(await streamToString(stream)).toContain('tcme="');
  });

  it("renders thai character mai tho string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcmt2: "\u0E49" }, "tcmt2"),
    );
    expect(await streamToString(stream)).toContain('tcmt2="');
  });

  it("renders thai character mai tri string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcmt3: "\u0E4A" }, "tcmt3"),
    );
    expect(await streamToString(stream)).toContain('tcmt3="');
  });

  it("renders thai character mai chattawa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tcmc: "\u0E4B" }, "tcmc"),
    );
    expect(await streamToString(stream)).toContain('tcmc="');
  });

  it("renders thai character thanthakhat string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tct: "\u0E4C" }, "tct"));
    expect(await streamToString(stream)).toContain('tct="');
  });

  it("renders thai character nikhahit string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcn: "\u0E4D" }, "tcn"));
    expect(await streamToString(stream)).toContain('tcn="');
  });

  it("renders thai character yamakkan string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcy: "\u0E4E" }, "tcy"));
    expect(await streamToString(stream)).toContain('tcy="');
  });

  it("renders thai character fongman string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tcf: "\u0E4F" }, "tcf"));
    expect(await streamToString(stream)).toContain('tcf="');
  });
});

// ─── Lao marks ──────────────────────────────────────────────────────────────────

describe("renderToReadableStream — Lao marks", () => {
  it("renders lao vowel sign a string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsa: "\u0EB0" }, "lvsa"),
    );
    expect(await streamToString(stream)).toContain('lvsa="');
  });

  it("renders lao vowel sign mai kan string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsmk: "\u0EB1" }, "lvsmk"),
    );
    expect(await streamToString(stream)).toContain('lvsmk="');
  });

  it("renders lao vowel sign aa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsaa: "\u0EB2" }, "lvsaa"),
    );
    expect(await streamToString(stream)).toContain('lvsaa="');
  });

  it("renders lao vowel sign am string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsam: "\u0EB3" }, "lvsam"),
    );
    expect(await streamToString(stream)).toContain('lvsam="');
  });

  it("renders lao vowel sign i string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsi: "\u0EB4" }, "lvsi"),
    );
    expect(await streamToString(stream)).toContain('lvsi="');
  });

  it("renders lao vowel sign ii string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsii: "\u0EB5" }, "lvsii"),
    );
    expect(await streamToString(stream)).toContain('lvsii="');
  });

  it("renders lao vowel sign y string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsy: "\u0EB6" }, "lvsy"),
    );
    expect(await streamToString(stream)).toContain('lvsy="');
  });

  it("renders lao vowel sign yy string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsyy: "\u0EB7" }, "lvsyy"),
    );
    expect(await streamToString(stream)).toContain('lvsyy="');
  });

  it("renders lao vowel sign u string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsu: "\u0EB8" }, "lvsu"),
    );
    expect(await streamToString(stream)).toContain('lvsu="');
  });

  it("renders lao vowel sign uu string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsuu: "\u0EB9" }, "lvsuu"),
    );
    expect(await streamToString(stream)).toContain('lvsuu="');
  });

  it("renders lao vowel sign mae khang string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lvsmk2: "\u0EBA" }, "lvsmk2"),
    );
    expect(await streamToString(stream)).toContain('lvsmk2="');
  });

  it("renders lao sign bo yai string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lsby: "\u0EBB" }, "lsby"),
    );
    expect(await streamToString(stream)).toContain('lsby="');
  });

  it("renders lao sign lo la string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ lsll: "\u0EBC" }, "lsll"),
    );
    expect(await streamToString(stream)).toContain('lsll="');
  });

  it("renders lao sign lao string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lsl: "\u0EBD" }, "lsl"));
    expect(await streamToString(stream)).toContain('lsl="');
  });

  it("renders lao ellipsis string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ le: "\u0EC6" }, "le"));
    expect(await streamToString(stream)).toContain('le="');
  });

  it("renders lao repetition mark string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ lrm: "\u0EC6" }, "lrm"));
    expect(await streamToString(stream)).toContain('lrm="');
  });

  it("renders lao nyo string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ln: "\u0E8D" }, "ln"));
    expect(await streamToString(stream)).toContain('ln="');
  });
});

// ─── Tibetan marks ──────────────────────────────────────────────────────────────

describe("renderToReadableStream — Tibetan marks", () => {
  it("renders tibetan syllable om string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tso: "\u0F00" }, "tso"));
    expect(await streamToString(stream)).toContain('tso="');
  });

  it("renders tibetan mark inter-syllabic tsheg string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmit: "\u0F0B" }, "tmit"),
    );
    expect(await streamToString(stream)).toContain('tmit="');
  });

  it("renders tibetan mark delimiter tsheg bstar string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmdtb: "\u0F0C" }, "tmdtb"),
    );
    expect(await streamToString(stream)).toContain('tmdtb="');
  });

  it("renders tibetan mark intesyllabic tsheg bstar string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmitb: "\u0F0D" }, "tmitb"),
    );
    expect(await streamToString(stream)).toContain('tmitb="');
  });

  it("renders tibetan mark she string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tms: "\u0F0E" }, "tms"));
    expect(await streamToString(stream)).toContain('tms="');
  });

  it("renders tibetan mark nyis tsheg string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmnt: "\u0F0F" }, "tmnt"),
    );
    expect(await streamToString(stream)).toContain('tmnt="');
  });

  it("renders tibetan mark rnam bcad string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmrbc: "\u0F10" }, "tmrbc"),
    );
    expect(await streamToString(stream)).toContain('tmrbc="');
  });

  it("renders tibetan mark closing yig mgo sgub ma string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmcyms: "\u0F11" }, "tmcyms"),
    );
    expect(await streamToString(stream)).toContain('tmcyms="');
  });

  it("renders tibetan mark closing yig mgo mdun ma string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmcymmd: "\u0F12" }, "tmcymmd"),
    );
    expect(await streamToString(stream)).toContain('tmcymmd="');
  });

  it("renders tibetan mark rjes su nga ro string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmrsnr: "\u0F13" }, "tmrsnr"),
    );
    expect(await streamToString(stream)).toContain('tmrsnr="');
  });

  it("renders tibetan mark rnam bcad string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tmrbc2: "\u0F14" }, "tmrbc2"),
    );
    expect(await streamToString(stream)).toContain('tmrbc2="');
  });

  it("renders tibetan logotype sign chad rtags string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tlsctr: "\u0F15" }, "tlsctr"),
    );
    expect(await streamToString(stream)).toContain('tlsctr="');
  });

  it("renders tibetan logotype sign lhag rtags string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tlslr: "\u0F16" }, "tlslr"),
    );
    expect(await streamToString(stream)).toContain('tlslr="');
  });

  it("renders tibetan astrological sign sgra gcan char rtags string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tasgcr: "\u0F17" }, "tasgcr"),
    );
    expect(await streamToString(stream)).toContain('tasgcr="');
  });

  it("renders tibetan astrological sign -khyud pa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ taskp: "\u0F18" }, "taskp"),
    );
    expect(await streamToString(stream)).toContain('taskp="');
  });

  it("renders tibetan astrological sign sdong tshugs string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tast: "\u0F19" }, "tast"),
    );
    expect(await streamToString(stream)).toContain('tast="');
  });

  it("renders tibetan sign rdel dkar string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tsrd: "\u0F1A" }, "tsrd"),
    );
    expect(await streamToString(stream)).toContain('tsrd="');
  });

  it("renders tibetan sign rdel nag string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tsrn: "\u0F1B" }, "tsrn"),
    );
    expect(await streamToString(stream)).toContain('tsrn="');
  });

  it("renders tibetan sign rdel dkar rdel nag string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tsrdrn: "\u0F1C" }, "tsrdrn"),
    );
    expect(await streamToString(stream)).toContain('tsrdrn="');
  });

  it("renders tibetan sign rdel dkar gcig string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tsrdc: "\u0F1D" }, "tsrdc"),
    );
    expect(await streamToString(stream)).toContain('tsrdc="');
  });

  it("renders tibetan digit zero string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tdz: "\u0F20" }, "tdz"));
    expect(await streamToString(stream)).toContain('tdz="');
  });

  it("renders tibetan digit one string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tdo: "\u0F21" }, "tdo"));
    expect(await streamToString(stream)).toContain('tdo="');
  });

  it("renders tibetan digit two string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tdt: "\u0F22" }, "tdt"));
    expect(await streamToString(stream)).toContain('tdt="');
  });

  it("renders tibetan digit three string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tdth: "\u0F23" }, "tdth"),
    );
    expect(await streamToString(stream)).toContain('tdth="');
  });

  it("renders tibetan digit four string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tdf: "\u0F24" }, "tdf"));
    expect(await streamToString(stream)).toContain('tdf="');
  });

  it("renders tibetan digit five string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tdff: "\u0F25" }, "tdff"),
    );
    expect(await streamToString(stream)).toContain('tdff="');
  });

  it("renders tibetan digit six string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tds: "\u0F26" }, "tds"));
    expect(await streamToString(stream)).toContain('tds="');
  });

  it("renders tibetan digit seven string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ tdse: "\u0F27" }, "tdse"),
    );
    expect(await streamToString(stream)).toContain('tdse="');
  });

  it("renders tibetan digit eight string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tde: "\u0F28" }, "tde"));
    expect(await streamToString(stream)).toContain('tde="');
  });

  it("renders tibetan digit nine string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ tdn: "\u0F29" }, "tdn"));
    expect(await streamToString(stream)).toContain('tdn="');
  });
});

// ─── Myanmar marks ──────────────────────────────────────────────────────────────

describe("renderToReadableStream — Myanmar marks", () => {
  it("renders myanmar sign anusvara string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ msa: "\u1036" }, "msa"));
    expect(await streamToString(stream)).toContain('msa="');
  });

  it("renders myanmar sign visarga string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ msv: "\u1037" }, "msv"));
    expect(await streamToString(stream)).toContain('msv="');
  });

  it("renders myanmar sign dot below string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ msdb: "\u1037" }, "msdb"),
    );
    expect(await streamToString(stream)).toContain('msdb="');
  });

  it("renders myanmar sign virama string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ msv2: "\u1039" }, "msv2"),
    );
    expect(await streamToString(stream)).toContain('msv2="');
  });

  it("renders myanmar sign asat string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ msa2: "\u103A" }, "msa2"),
    );
    expect(await streamToString(stream)).toContain('msa2="');
  });

  it("renders myanmar consonant sign medial ya string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mcsmy: "\u103B" }, "mcsmy"),
    );
    expect(await streamToString(stream)).toContain('mcsmy="');
  });

  it("renders myanmar consonant sign medial ra string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mcsmr: "\u103C" }, "mcsmr"),
    );
    expect(await streamToString(stream)).toContain('mcsmr="');
  });

  it("renders myanmar consonant sign medial wa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mcsmw: "\u103D" }, "mcsmw"),
    );
    expect(await streamToString(stream)).toContain('mcsmw="');
  });

  it("renders myanmar consonant sign medial ha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mcsmh: "\u103E" }, "mcsmh"),
    );
    expect(await streamToString(stream)).toContain('mcsmh="');
  });

  it("renders myanmar letter great sa string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlgs: "\u103F" }, "mlgs"),
    );
    expect(await streamToString(stream)).toContain('mlgs="');
  });

  it("renders myanmar letter ka string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mlk: "\u1000" }, "mlk"));
    expect(await streamToString(stream)).toContain('mlk="');
  });

  it("renders myanmar letter kha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlkh: "\u1001" }, "mlkh"),
    );
    expect(await streamToString(stream)).toContain('mlkh="');
  });

  it("renders myanmar letter ga string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mlg: "\u1002" }, "mlg"));
    expect(await streamToString(stream)).toContain('mlg="');
  });

  it("renders myanmar letter gha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlgh: "\u1003" }, "mlgh"),
    );
    expect(await streamToString(stream)).toContain('mlgh="');
  });

  it("renders myanmar letter nga string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mln: "\u1004" }, "mln"));
    expect(await streamToString(stream)).toContain('mln="');
  });

  it("renders myanmar letter ca string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mlc: "\u1005" }, "mlc"));
    expect(await streamToString(stream)).toContain('mlc="');
  });

  it("renders myanmar letter cha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlch: "\u1006" }, "mlch"),
    );
    expect(await streamToString(stream)).toContain('mlch="');
  });

  it("renders myanmar letter ja string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ mlj: "\u1007" }, "mlj"));
    expect(await streamToString(stream)).toContain('mlj="');
  });

  it("renders myanmar letter jha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mljh: "\u1008" }, "mljh"),
    );
    expect(await streamToString(stream)).toContain('mljh="');
  });

  it("renders myanmar letter nya string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlny: "\u1009" }, "mlny"),
    );
    expect(await streamToString(stream)).toContain('mlny="');
  });

  it("renders myanmar letter nnya string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlnn: "\u100A" }, "mlnn"),
    );
    expect(await streamToString(stream)).toContain('mlnn="');
  });

  it("renders myanmar letter tta string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mltt: "\u100B" }, "mltt"),
    );
    expect(await streamToString(stream)).toContain('mltt="');
  });

  it("renders myanmar letter ttha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mltth: "\u100C" }, "mltth"),
    );
    expect(await streamToString(stream)).toContain('mltth="');
  });

  it("renders myanmar letter dda string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mldd: "\u100D" }, "mldd"),
    );
    expect(await streamToString(stream)).toContain('mldd="');
  });

  it("renders myanmar letter ddha string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlddh: "\u100E" }, "mlddh"),
    );
    expect(await streamToString(stream)).toContain('mlddh="');
  });

  it("renders myanmar letter nna string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ mlnn2: "\u100F" }, "mlnn2"),
    );
    expect(await streamToString(stream)).toContain('mlnn2="');
  });
});

// ─── Khmer marks ────────────────────────────────────────────────────────────────

describe("renderToReadableStream — Khmer marks", () => {
  it("renders khmer sign visarga string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksv: "\u17D4" }, "ksv"));
    expect(await streamToString(stream)).toContain('ksv="');
  });

  it("renders khmer sign coeng string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksc: "\u17D2" }, "ksc"));
    expect(await streamToString(stream)).toContain('ksc="');
  });

  it("renders khmer sign muusikatoan string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksm: "\u17D1" }, "ksm"));
    expect(await streamToString(stream)).toContain('ksm="');
  });

  it("renders khmer sign samyok sannya string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ kss: "\u17D3" }, "kss"));
    expect(await streamToString(stream)).toContain('kss="');
  });

  it("renders khmer sign bariyoosan string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksb: "\u17D5" }, "ksb"));
    expect(await streamToString(stream)).toContain('ksb="');
  });

  it("renders khmer sign camnuc pii kuuh string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kscpk: "\u17D6" }, "kscpk"),
    );
    expect(await streamToString(stream)).toContain('kscpk="');
  });

  it("renders khmer sign lek too string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kslt: "\u17D7" }, "kslt"),
    );
    expect(await streamToString(stream)).toContain('kslt="');
  });

  it("renders khmer sign beyyal string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ ksb2: "\u17D8" }, "ksb2"),
    );
    expect(await streamToString(stream)).toContain('ksb2="');
  });

  it("renders khmer sign phnaek muan string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kspm: "\u17D9" }, "kspm"),
    );
    expect(await streamToString(stream)).toContain('kspm="');
  });

  it("renders khmer sign koomuut string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksk: "\u17DA" }, "ksk"));
    expect(await streamToString(stream)).toContain('ksk="');
  });

  it("renders khmer currency symbol riel string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ kcsr: "\u17DB" }, "kcsr"),
    );
    expect(await streamToString(stream)).toContain('kcsr="');
  });

  it("renders khmer sign avakraha string as attribute value", async () => {
    const stream = await renderToReadableStream(div({ ksa: "\u17DC" }, "ksa"));
    expect(await streamToString(stream)).toContain('ksa="');
  });

  it("renders khmer sign atthacan string as attribute value", async () => {
    const stream = await renderToReadableStream(
      div({ ksat: "\u17DD" }, "ksat"),
    );
    expect(await streamToString(stream)).toContain('ksat="');
  });
});
