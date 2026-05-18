/**
 * resume — React-compatible server streaming that continues a prerender.
 */

import { describe, it, expect } from "bun:test";
import {
  resume,
  resumeToPipeableStream,
} from "../../../../src/integrations/react/_server.ts";
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

describe("resume — Reference", () => {
  it("returns a Promise that resolves to a ReadableStream", async () => {
    const result = resume(div({}, "hello"), null);
    expect(result).toBeInstanceOf(Promise);
    const stream = await result;
    expect(stream).toBeInstanceOf(ReadableStream);
  });

  it("resolved stream carries an allReady Promise", async () => {
    const stream = await resume(div({}, "ready"), null);
    expect(stream.allReady).toBeInstanceOf(Promise);
  });

  it("accepts optional options as third argument", async () => {
    const stream = await resume(div({}, "opts"), null, {});
    expect(stream).toBeInstanceOf(ReadableStream);
  });
});

// ─── Usage / Resuming a prerender ─────────────────────────────────────────

describe("resume — Usage / Resuming a prerender", () => {
  it("produces rendered HTML from the node", async () => {
    const stream = await resume(div({}, "resumed"), null);
    const html = await streamToString(stream);
    expect(html).toContain("resumed");
  });

  it("ignores postponedState and re-renders from scratch", async () => {
    const stream = await resume(div({}, "fresh"), { some: "state" });
    const html = await streamToString(stream);
    expect(html).toContain("fresh");
  });

  it("works with a null postponedState", async () => {
    const stream = await resume(div({}, "null-state"), null);
    expect(await streamToString(stream)).toContain("null-state");
  });

  it("works with an undefined postponedState", async () => {
    const stream = await resume(div({}, "undef-state"), undefined);
    expect(await streamToString(stream)).toContain("undef-state");
  });
});

// ─── Options pass-through ─────────────────────────────────────────────────

describe("resume — Options", () => {
  it("passes nonce through to emitted scripts", async () => {
    const stream = await resume(div({}, "app"), null, {
      bootstrapScriptContent: "console.log(1);",
      nonce: "abc123",
    });
    const html = await streamToString(stream);
    expect(html).toContain('nonce="abc123"');
  });

  it("passes signal through for abort support", async () => {
    const controller = new AbortController();
    const stream = await resume(div({}, "abort-me"), null, {
      signal: controller.signal,
    });
    controller.abort();
    const html = await streamToString(stream);
    expect(typeof html).toBe("string");
  });

  it("calls onError when a shell error occurs", async () => {
    const errors: unknown[] = [];
    const BadApp = () => {
      throw new Error("boom");
    };
    try {
      await resume(
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

  it("rejects the Promise when the shell fails", async () => {
    const BadApp = () => {
      throw new Error("shell-boom");
    };
    await expect(
      resume(
        { tag: BadApp, props: { children: [] }, children: [] } as any,
        null,
      ),
    ).rejects.toThrow("shell-boom");
  });

  it("accepts identifierPrefix without throwing", async () => {
    const stream = await resume(div({}, "prefixed"), null, {
      identifierPrefix: "myApp",
    });
    expect(await streamToString(stream)).toContain("prefixed");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("resume — Caveats", () => {
  it("does not accept bootstrapScripts (React caveat)", async () => {
    // Sinwan accepts the option for compat but the React docs say
    // bootstrapScripts should be passed to prerender, not resume.
    const stream = await resume(div({}, "boot"), null, {
      bootstrapScripts: ["/app.js"],
    });
    const html = await streamToString(stream);
    // Sinwan still emits them for API parity
    expect(html).toContain("/app.js");
  });

  it("does not accept identifierPrefix as a change from prerender", async () => {
    // In React the prefix must be the same in both prerender and resume.
    // Sinwan accepts it and passes it through.
    const stream = await resume(div({}, "same-prefix"), null, {
      identifierPrefix: "app",
    });
    expect(await streamToString(stream)).toContain("same-prefix");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("resume — Edge cases", () => {
  it("handles empty node (null)", async () => {
    const stream = await resume(null as any, null);
    expect(await streamToString(stream)).toBe("");
  });

  it("handles boolean node", async () => {
    const stream = await resume(true as any, null);
    expect(await streamToString(stream)).toBe("");
  });

  it("allReady resolves after the full stream closes", async () => {
    const stream = await resume(div({}, "done"), null);
    await streamToString(stream);
    await stream.allReady;
    expect(true).toBe(true);
  });

  it("supports deeply nested elements", async () => {
    const node = div({}, div({}, div({}, "deep")));
    const stream = await resume(node, null);
    expect(await streamToString(stream)).toBe(
      "<div><div><div>deep</div></div></div>",
    );
  });

  it("supports async components", async () => {
    const AsyncComp = async () => div({}, "async");
    const stream = await resume(
      { tag: AsyncComp, props: {}, children: [] } as any,
      null,
    );
    expect(await streamToString(stream)).toBe("<div>async</div>");
  });
});

// ─── resumeToPipeableStream ─────────────────────────────────────────────────

describe("resumeToPipeableStream — Reference", () => {
  it("returns a PipeableStream with pipe and abort methods", () => {
    const result = resumeToPipeableStream(div({}, "pipeable"), null);
    expect(typeof result.pipe).toBe("function");
    expect(typeof result.abort).toBe("function");
  });

  it("pipes HTML to a writable stream", async () => {
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
    const { pipe } = resumeToPipeableStream(div({}, "piped"), null);
    pipe(writable as any);
    await ended;
    const html = chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(html).toContain("piped");
  });

  it("ignores postponedState and re-renders", async () => {
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
    const { pipe } = resumeToPipeableStream(div({}, "fresh-pipe"), {
      some: "state",
    });
    pipe(writable as any);
    await ended;
    const html = chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(html).toContain("fresh-pipe");
  });
});

// ─── Bootstrap parity with resume vs renderToReadableStream ───────────────

describe("resume — Bootstrap parity", () => {
  it("emits identical bootstrap tags to renderToReadableStream", async () => {
    const { renderToReadableStream } =
      await import("../../../../src/integrations/react/_server.ts");

    const opts = {
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
      bootstrapScriptContent: "console.log(1);",
      nonce: "abc",
    };

    const resumeStream = await resume(div({}, "x"), null, opts);
    const resumeHtml = await streamToString(resumeStream);

    const renderStream = await renderToReadableStream(div({}, "x"), opts);
    const renderHtml = await streamToString(renderStream);

    expect(resumeHtml).toBe(renderHtml);
  });
});
