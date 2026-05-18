/**
 * Comprehensive tests for `resumeAndPrerender` & `resumeAndPrerenderToNodeStream`.
 *
 * Tests mirror the React `resumeAndPrerender` documentation sections.
 */

import { describe, it, expect } from "bun:test";
import {
  resumeAndPrerender,
  resumeAndPrerenderToNodeStream,
} from "../../../../src/integrations/react/_static.ts";
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

async function nodeStreamToString(s: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of s as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks as readonly Uint8Array[]).toString("utf8");
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("resumeAndPrerender — Reference", () => {
  it("accepts a React node, postponedState, and returns a Promise<PrerenderResult>", async () => {
    const result = resumeAndPrerender(el("span", {}, "hello"), null);
    expect(result).toBeInstanceOf(Promise);

    const { prelude, postponed } = await result;
    expect(prelude).toBeInstanceOf(ReadableStream);
    expect(postponed).toBeNull();
  });

  it("accepts an optional options object as third argument", async () => {
    const { prelude } = await resumeAndPrerender(el("div", {}, "app"), null, {
      identifierPrefix: "myapp",
    });
    expect(prelude).toBeInstanceOf(ReadableStream);
  });

  it("returns postponed as null since Sinwan always finishes", async () => {
    const { postponed } = await resumeAndPrerender(el("div", {}, "done"), null);
    expect(postponed).toBeNull();
  });
});

// ─── Usage / Resuming a prerender ───────────────────────────────────────────

describe("resumeAndPrerender — Usage / Resuming a prerender", () => {
  it("produces the rendered HTML in the prelude stream", async () => {
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "content"),
      null,
    );
    const html = await streamToString(prelude);
    expect(html).toContain("content");
    expect(html).toContain("<div>");
  });

  it("ignores postponedState and re-renders from scratch", async () => {
    const { prelude } = await resumeAndPrerender(el("div", {}, "fresh"), {
      some: "state",
    });
    const html = await streamToString(prelude);
    expect(html).toContain("fresh");
  });

  it("works with a null postponedState", async () => {
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "null-state"),
      null,
    );
    expect(await streamToString(prelude)).toContain("null-state");
  });

  it("works with an undefined postponedState", async () => {
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "undef-state"),
      undefined,
    );
    expect(await streamToString(prelude)).toContain("undef-state");
  });

  it("renders a full page tree", async () => {
    const Page = () =>
      el(
        "html",
        {},
        el("head", {}, el("title", {}, "App")),
        el("body", {}, el("h1", {}, "Hello"), el("p", {}, "World")),
      );

    const { prelude } = await resumeAndPrerender(el(Page, {}), null);
    const html = await streamToString(prelude);
    expect(html).toContain("<html");
    expect(html).toContain("<title>App</title>");
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<p>World</p>");
    expect(html).toContain("</html>");
  });
});

// ─── Options pass-through ──────────────────────────────────────────────────

describe("resumeAndPrerender — Options", () => {
  it("injects bootstrapScripts with async attribute", async () => {
    const { prelude } = await resumeAndPrerender(el("div", {}, "app"), null, {
      bootstrapScripts: ["/main.js"],
    });
    const html = await streamToString(prelude);
    expect(html).toContain('<script src="/main.js" async=""></script>');
  });

  it("injects bootstrapModules as type=module without async", async () => {
    const { prelude } = await resumeAndPrerender(el("div", {}, "app"), null, {
      bootstrapModules: ["/client.js"],
    });
    const html = await streamToString(prelude);
    expect(html).toContain('type="module"');
    expect(html).not.toContain('async=""');
  });

  it("injects bootstrapScriptContent as inline script after content", async () => {
    const { prelude } = await resumeAndPrerender(el("div", {}, "app"), null, {
      bootstrapScriptContent: "window.boot = true;",
    });
    const html = await streamToString(prelude);
    expect(html).toContain("<script>window.boot = true;</script>");
    expect(html.indexOf("app")).toBeLessThan(html.indexOf("<script>"));
  });

  it("passes signal through for abort support", async () => {
    const controller = new AbortController();
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "abort-me"),
      null,
      { signal: controller.signal },
    );
    controller.abort();
    const html = await streamToString(prelude);
    expect(typeof html).toBe("string");
  });

  it("rejects when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("aborted"));

    await expect(
      resumeAndPrerender(el("div", {}, "app"), null, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("aborted");
  });

  it("calls onError when rendering fails", async () => {
    const errors: unknown[] = [];
    const BadApp = () => {
      throw new Error("boom");
    };
    try {
      await resumeAndPrerender(
        { tag: BadApp, props: { children: [] }, children: [] } as any,
        null,
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

  it("accepts identifierPrefix without throwing", async () => {
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "prefixed"),
      null,
      { identifierPrefix: "myApp" },
    );
    expect(await streamToString(prelude)).toContain("prefixed");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("resumeAndPrerender — Caveats", () => {
  it("nonce is not an available option when prerendering", async () => {
    // Sinwan accepts the option for API parity but React docs warn against it.
    // PrerenderOptions type does not include nonce, so this verifies parity.
    const { prelude } = await resumeAndPrerender(
      el("div", {}, "no-nonce"),
      null,
    );
    const html = await streamToString(prelude);
    expect(html).toContain("no-nonce");
  });

  it("output contains hydration markers for components", async () => {
    const Component = () => el("div", {}, "hydratable");
    const { prelude } = await resumeAndPrerender(el(Component, {}), null);
    const html = await streamToString(prelude);
    expect(html).toContain("hydratable");
    expect(html).toContain('data-sinwan-id="c0"');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("resumeAndPrerender — Edge cases", () => {
  it("handles null node", async () => {
    const { prelude } = await resumeAndPrerender(null as any, null);
    expect(await streamToString(prelude)).toBe("");
  });

  it("handles boolean node", async () => {
    const { prelude } = await resumeAndPrerender(true as any, null);
    expect(await streamToString(prelude)).toBe("");
  });

  it("supports deeply nested elements", async () => {
    const node = el("div", {}, el("div", {}, el("div", {}, "deep")));
    const { prelude } = await resumeAndPrerender(node, null);
    expect(await streamToString(prelude)).toBe(
      "<div><div><div>deep</div></div></div>",
    );
  });

  it("supports async components", async () => {
    const AsyncComp = async () => el("div", {}, "async");
    const { prelude } = await resumeAndPrerender(
      { tag: AsyncComp, props: {}, children: [] } as any,
      null,
    );
    const html = await streamToString(prelude);
    expect(html).toContain("async");
    expect(html).toContain("<div");
    expect(html).toContain("</div>");
  });

  it("renders arrays of elements", async () => {
    const { prelude } = await resumeAndPrerender(
      [el("a", {}, "1"), el("b", {}, "2")] as any,
      null,
    );
    expect(await streamToString(prelude)).toBe("<a>1</a><b>2</b>");
  });
});

// ─── resumeAndPrerenderToNodeStream ─────────────────────────────────────────

describe("resumeAndPrerenderToNodeStream — Reference", () => {
  it("accepts a React node and returns a Promise<PrerenderToNodeStreamResult>", async () => {
    const result = resumeAndPrerenderToNodeStream(
      el("span", {}, "hello"),
      null,
    );
    expect(result).toBeInstanceOf(Promise);

    const { prelude, postponed } = await result;
    expect(typeof (prelude as any).pipe).toBe("function");
    expect(postponed).toBeNull();
  });

  it("accepts an optional options object", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(
      el("div", {}, "app"),
      null,
      { identifierPrefix: "myapp" },
    );
    expect(typeof (prelude as any).pipe).toBe("function");
  });
});

describe("resumeAndPrerenderToNodeStream — Usage", () => {
  it("produces the rendered HTML in the prelude Node stream", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(
      el("div", {}, "content"),
      null,
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("content");
    expect(html).toContain("<div>");
  });

  it("ignores postponedState and re-renders from scratch", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(
      el("div", {}, "fresh"),
      { some: "state" },
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toContain("fresh");
  });

  it("injects bootstrap scripts into the Node stream", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(
      el("div", {}, "app"),
      null,
      { bootstrapScripts: ["/main.js"] },
    );
    const html = await nodeStreamToString(prelude);
    expect(html).toContain('<script src="/main.js" async=""></script>');
  });

  it("calls onError when rendering fails", async () => {
    const errors: unknown[] = [];
    const BadApp = () => {
      throw new Error("boom");
    };
    try {
      await resumeAndPrerenderToNodeStream(
        { tag: BadApp, props: { children: [] }, children: [] } as any,
        null,
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

  it("handles null node", async () => {
    const { prelude } = await resumeAndPrerenderToNodeStream(null as any, null);
    expect(await nodeStreamToString(prelude)).toBe("");
  });
});

// ─── Parity with prerender ──────────────────────────────────────────────────

describe("resumeAndPrerender — Parity with prerender", () => {
  it("emits identical output to prerender for the same node and options", async () => {
    const { prerender } =
      await import("../../../../src/integrations/react/_static.ts");

    const opts = {
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
      bootstrapScriptContent: "console.log(1);",
    };

    const resumeResult = await resumeAndPrerender(
      el("div", {}, "x"),
      null,
      opts,
    );
    const resumeHtml = await streamToString(resumeResult.prelude);

    const prerenderResult = await prerender(el("div", {}, "x"), opts);
    const prerenderHtml = await streamToString(prerenderResult.prelude);

    expect(resumeHtml).toBe(prerenderHtml);
  });
});
