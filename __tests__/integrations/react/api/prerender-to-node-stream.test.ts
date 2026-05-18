/**
 * Comprehensive tests for `prerenderToNodeStream`.
 *
 * Tests mirror the React `prerenderToNodeStream` documentation sections.
 */

import { describe, it, expect } from "bun:test";
import { prerenderToNodeStream } from "../../../../src/integrations/react/prerender.ts";
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

async function nodeStreamToString(s: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of s as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks as readonly Uint8Array[]).toString("utf8");
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("prerenderToNodeStream — Reference", () => {
  it("accepts a React node and returns a Promise<PrerenderToNodeStreamResult>", async () => {
    const result = prerenderToNodeStream(el("span", {}, "hello"));
    expect(result).toBeInstanceOf(Promise);

    const { prelude, postponed } = await result;
    expect(typeof (prelude as any).pipe).toBe("function");
    expect(postponed).toBeNull();
  });

  it("accepts an optional options object", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "app"), {
      identifierPrefix: "myapp",
    });
    expect(typeof (prelude as any).pipe).toBe("function");
  });

  it("returns postponed as null since Sinwan always finishes", async () => {
    const { postponed } = await prerenderToNodeStream(el("div", {}, "done"));
    expect(postponed).toBeNull();
  });
});

// ─── Usage / Rendering a React tree to a stream of static HTML ────────────────

describe("prerenderToNodeStream — Rendering", () => {
  it("produces the rendered HTML in the prelude Node stream", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "content"));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("content");
    expect(html).toContain("<div>");
  });

  it("renders a full page tree", async () => {
    const Page = () =>
      el(
        "html",
        {},
        el("head", {}, el("title", {}, "App")),
        el("body", {}, el("h1", {}, "Hello"), el("p", {}, "World")),
      );

    const { prelude } = await prerenderToNodeStream(el(Page, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("<html");
    expect(html).toContain("<title>App</title>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
    expect(html).toContain("</html>");
  });

  it("injects bootstrapScriptContent as inline script after content", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "app"), {
      bootstrapScriptContent: "window.boot = true;",
    });
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("<script>window.boot = true;</script>");
    expect(html.indexOf("app")).toBeLessThan(html.indexOf("<script>"));
  });

  it("injects bootstrapScripts with async attribute", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "app"), {
      bootstrapScripts: ["/main.js"],
    });
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('<script src="/main.js" async=""></script>');
  });

  it("injects bootstrapModules as type=module without async", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "app"), {
      bootstrapModules: ["/client.js"],
    });
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('type="module"');
    expect(html).not.toContain('async=""');
  });

  it("supports BootstrapScript objects with integrity and crossOrigin", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "app"), {
      bootstrapScripts: [
        { src: "/main.js", integrity: "sha384-abc", crossOrigin: "anonymous" },
      ],
    });
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('integrity="sha384-abc"');
    expect(html).toContain('crossorigin="anonymous"');
  });
});

// ─── Rendering a React tree to a string of static HTML via Node stream ───────

describe("prerenderToNodeStream — String conversion", () => {
  it("can be consumed into a full HTML string", async () => {
    const { prelude } = await prerenderToNodeStream(el("div", {}, "text"), {
      bootstrapScripts: ["/main.js"],
    });

    const html = await nodeStreamToString(prelude);
    expect(html).toContain("<div>text</div>");
    expect(html).toContain('<script src="/main.js" async=""></script>');
  });
});

// ─── Waiting for all data to load ───────────────────────────────────────────

describe("prerenderToNodeStream — Waiting for all data", () => {
  it("waits for async components before resolving", async () => {
    const AsyncComp = async () => {
      await Promise.resolve();
      return el("div", {}, "async");
    };

    const { prelude } = await prerenderToNodeStream(el(AsyncComp, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("async");
    expect(html).toContain("<div");
    expect(html).toContain("</div>");
  });
});

// ─── Aborting prerendering ──────────────────────────────────────────────────

describe("prerenderToNodeStream — Aborting", () => {
  it("rejects when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("aborted"));

    await expect(
      prerenderToNodeStream(el("div", {}, "app"), {
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("prerenderToNodeStream — Caveats", () => {
  it("output contains hydration markers for components", async () => {
    const Component = () => el("div", {}, "hydratable");
    const { prelude } = await prerenderToNodeStream(el(Component, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("hydratable");
    expect(html).toContain('data-sinwan-id="c0"');
  });

  it("does not emit event handler attributes but emits event markers", async () => {
    const { prelude } = await prerenderToNodeStream(
      el("button", { onClick: () => {} }, "click me"),
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("click me");
    expect(html).not.toContain("onClick");
    expect(html).toContain('data-sinwan-ev="click:0"');
  });

  it("dangerouslySetInnerHTML is emitted raw", async () => {
    const { prelude } = await prerenderToNodeStream(
      el("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<div><b>raw</b></div>");
  });

  it("escapes regular text content", async () => {
    const { prelude } = await prerenderToNodeStream(
      el("div", {}, "<script>alert(1)</script>"),
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("prerenderToNodeStream — Edge cases", () => {
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

    const { prelude } = await prerenderToNodeStream(el(Field, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('for="');
    expect(html).toContain('id="');
    const forMatch = html.match(/<label[^>]*for="([^"]+)"/);
    const idMatch = html.match(/<input[^>]*id="([^"]+)"/);
    expect(forMatch?.[1]).toBe(idMatch?.[1]);
  });

  it("supports identifierPrefix for useId", async () => {
    const Field = () => {
      const id = useId();
      return el("input", { id });
    };

    const { prelude } = await prerenderToNodeStream(el(Field, {}), {
      identifierPrefix: "app",
    });
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('id="app:');
  });

  it("renders nested components with boundary markers", async () => {
    const Inner = () => el("span", {}, "inner");
    const Outer = () => el("div", {}, el(Inner, {}));

    const { prelude } = await prerenderToNodeStream(el(Outer, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("<div");
    expect(html).toContain("data-sinwan-id=");
    expect(html).toContain("<span");
    expect(html).toContain(">inner</span>");
    expect(html).toContain("</div>");
  });

  it("renders arrays of elements", async () => {
    const { prelude } = await prerenderToNodeStream([
      el("a", {}, "1"),
      el("b", {}, "2"),
    ] as any);
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<a>1</a><b>2</b>");
  });

  it("handles empty elements gracefully", async () => {
    const Empty = () => null;
    const { prelude } = await prerenderToNodeStream(el(Empty, {}));
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("");
  });

  it("renders Show control flow with true condition", async () => {
    const { Show } = await import("../../../../src/component/control-flow.ts");
    const { prelude } = await prerenderToNodeStream(
      el(
        Show,
        { when: true, fallback: el("div", {}, "no") },
        el("div", {}, "yes"),
      ),
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<div>yes</div>");
  });

  it("renders Show control flow with false condition", async () => {
    const { Show } = await import("../../../../src/component/control-flow.ts");
    const { prelude } = await prerenderToNodeStream(
      el(
        Show,
        { when: false, fallback: el("div", {}, "no") },
        el("div", {}, "yes"),
      ),
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<div>no</div>");
  });

  it("renders For control flow", async () => {
    const { FOR_TYPE } =
      await import("../../../../src/component/control-flow.ts");
    const { prelude } = await prerenderToNodeStream({
      tag: FOR_TYPE,
      props: {
        each: ["a", "b", "c"],
        children: (item: string) => el("span", {}, item),
      },
      children: [],
    } as any);
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("<span>a</span><span>b</span><span>c</span>");
  });

  it("includes reactive text markers for signal values", async () => {
    const { signal } = await import("../../../../src/reactivity/signal.ts");
    const count = signal(5);
    const { prelude } = await prerenderToNodeStream(el("div", {}, count));
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("5");
    expect(html).toContain("<!--sinwan-t:");
    expect(html).toContain("<!--/sinwan-t-->");
  });

  it("calls onError when rendering fails", async () => {
    const errors: unknown[] = [];
    const BadApp = () => {
      throw new Error("boom");
    };
    try {
      await prerenderToNodeStream(
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

  it("onError receives the same error the Promise rejects with", async () => {
    const originalError = new Error("same");
    const BadApp = () => {
      throw originalError;
    };
    let onErrorError: unknown = null;
    let rejectError: unknown = null;
    try {
      await prerenderToNodeStream(
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

  it("handles null node", async () => {
    const { prelude } = await prerenderToNodeStream(null as any);
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("");
  });

  it("handles boolean node", async () => {
    const { prelude } = await prerenderToNodeStream(true as any);
    const html = await nodeStreamToString(prelude);
    expect(html).toBe("");
  });
});
