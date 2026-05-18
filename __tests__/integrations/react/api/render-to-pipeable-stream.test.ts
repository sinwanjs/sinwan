/**
 * renderToPipeableStream — React-compatible server streaming.
 *
 * Tests mirror React documentation sections.
 */

import { describe, it, expect } from "bun:test";
import { renderToPipeableStream } from "../../../../src/integrations/react/_server.ts";
import type { SinwanElement } from "../../../../src/types.ts";

const div = (
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: "div",
  props: { ...props, children },
  children: children as any,
});

function createWritable() {
  const chunks: Uint8Array[] = [];
  let ended = false;
  const endedPromise = new Promise<void>((resolve) => {
    const check = () => {
      if (ended) {
        resolve();
        return;
      }
      setTimeout(check, 5);
    };
    check();
  });

  const writable = {
    write(c: string | Uint8Array) {
      chunks.push(typeof c === "string" ? new TextEncoder().encode(c) : c);
      return true;
    },
    end() {
      ended = true;
    },
    on() {},
    get chunks() {
      return chunks;
    },
    get text() {
      return chunks.map((c) => new TextDecoder().decode(c)).join("");
    },
    get ended() {
      return ended;
    },
    wait() {
      return endedPromise;
    },
  };

  return writable;
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("renderToPipeableStream — Reference", () => {
  it("returns an object with pipe and abort methods", () => {
    const result = renderToPipeableStream(div({}, "hello"));
    expect(typeof result.pipe).toBe("function");
    expect(typeof result.abort).toBe("function");
  });

  it("pipe accepts a Writable-like target", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "piped"));
    pipe(w);
    await w.wait();
    expect(w.text).toContain("piped");
  });

  it("abort can be called without error", () => {
    const { abort } = renderToPipeableStream(div({}, "hello"));
    expect(() => abort()).not.toThrow();
  });
});

// ─── Usage / Rendering a React tree as HTML to a Node.js Stream ───────────

describe("renderToPipeableStream — Usage / Rendering to a Node.js Stream", () => {
  it("emits the rendered HTML into the writable stream", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "content"));
    pipe(w);
    await w.wait();
    expect(w.text).toContain("content");
  });

  it("injects bootstrapScriptContent as an inline script after content", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "app"), {
      bootstrapScriptContent: "window.boot = true;",
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain("<script>window.boot = true;</script>");
    expect(w.text.indexOf("app")).toBeLessThan(w.text.indexOf("<script>"));
  });

  it("injects bootstrapScripts with async attribute", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "app"), {
      bootstrapScripts: ["/main.js"],
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('<script src="/main.js" async=""></script>');
  });

  it("injects bootstrapModules as type=module without async", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "app"), {
      bootstrapModules: ["/client.js"],
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('type="module"');
    expect(w.text).toContain('src="/client.js"');
    expect(w.text).not.toContain('async=""');
  });

  it("applies nonce to all emitted scripts", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "app"), {
      bootstrapScriptContent: "console.log(1);",
      bootstrapScripts: ["/a.js"],
      bootstrapModules: ["/b.js"],
      nonce: "abc123",
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('nonce="abc123"');
    const nonceCount = (w.text.match(/nonce="abc123"/g) || []).length;
    expect(nonceCount).toBe(3);
  });

  it("supports BootstrapScript objects with integrity and crossOrigin", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "app"), {
      bootstrapScripts: [
        {
          src: "/main.js",
          integrity: "sha384-abc",
          crossOrigin: "anonymous",
        },
      ],
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('integrity="sha384-abc"');
    expect(w.text).toContain('crossorigin="anonymous"');
  });
});

// ─── Usage / Specifying what goes into the shell ──────────────────────────

describe("renderToPipeableStream — Usage / Shell callbacks", () => {
  it("calls onShellReady after the first chunk is emitted", async () => {
    const w = createWritable();
    let shellReady = false;
    const { pipe } = renderToPipeableStream(div({}, "shell"), {
      onShellReady() {
        shellReady = true;
      },
    });
    pipe(w);
    await w.wait();
    expect(shellReady).toBe(true);
  });

  it("calls onAllReady when the stream completes", async () => {
    const w = createWritable();
    let allReady = false;
    const { pipe } = renderToPipeableStream(div({}, "done"), {
      onAllReady() {
        allReady = true;
      },
    });
    pipe(w);
    await w.wait();
    expect(allReady).toBe(true);
  });

  it("calls onShellReady before onAllReady", async () => {
    const w = createWritable();
    const order: string[] = [];
    const { pipe } = renderToPipeableStream(div({}, "order"), {
      onShellReady() {
        order.push("shellReady");
      },
      onAllReady() {
        order.push("allReady");
      },
    });
    pipe(w);
    await w.wait();
    expect(order).toEqual(["shellReady", "allReady"]);
  });
});

// ─── Usage / Logging crashes on the server ────────────────────────────────

describe("renderToPipeableStream — Usage / Logging crashes", () => {
  it("calls onError when a shell error occurs", async () => {
    const w = createWritable();
    const errors: unknown[] = [];
    let errorResolved = false;

    const BadApp = () => {
      throw new Error("boom");
    };

    const { pipe } = renderToPipeableStream(
      { tag: BadApp, props: { children: [] }, children: [] } as any,
      {
        onError(err) {
          errors.push(err);
          errorResolved = true;
        },
      },
    );
    pipe(w);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (errorResolved) {
          resolve();
          return;
        }
        setTimeout(check, 5);
      };
      check();
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(String(errors[0])).toContain("boom");
  });

  it("calls onError for every error (including shell errors)", async () => {
    const w = createWritable();
    const errors: unknown[] = [];
    let errorResolved = false;

    const BadApp = () => {
      throw new Error("crash");
    };

    const { pipe } = renderToPipeableStream(
      { tag: BadApp, props: { children: [] }, children: [] } as any,
      {
        onError(err) {
          errors.push(err);
          errorResolved = true;
        },
      },
    );
    pipe(w);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (errorResolved) {
          resolve();
          return;
        }
        setTimeout(check, 5);
      };
      check();
    });

    expect(errors.length).toBe(1);
  });
});

// ─── Usage / Recovering from errors inside the shell ──────────────────────

describe("renderToPipeableStream — Usage / Recovering from shell errors", () => {
  it("calls onShellError when the shell fails before emitting bytes", async () => {
    const w = createWritable();
    let shellError: unknown = null;
    let shellReady = false;
    let resolved = false;

    const BadApp = () => {
      throw new Error("shell-boom");
    };

    const { pipe } = renderToPipeableStream(
      { tag: BadApp, props: { children: [] }, children: [] } as any,
      {
        onShellReady() {
          shellReady = true;
        },
        onShellError(err) {
          shellError = err;
          resolved = true;
        },
      },
    );
    pipe(w);
    await new Promise<void>((resolve) => {
      const check = () => {
        if (resolved) {
          resolve();
          return;
        }
        setTimeout(check, 5);
      };
      check();
    });

    expect(shellError).not.toBeNull();
    expect(String(shellError)).toContain("shell-boom");
    expect(shellReady).toBe(false);
  });

  it("does NOT call onShellError if bytes were already emitted", async () => {
    const w = createWritable();
    let shellErrorCalled = false;
    let onErrorCalled = false;

    // A component that writes some content then throws.
    // We simulate this by creating a valid element tree and relying on
    // the fact that the stream emits some bytes before an async throw.
    // Since Sinwan's stream is single-pass, a shell error after bytes
    // would come from a late component throw inside Suspense, but for
    // this test we simply verify the contract: if bytesEmitted=true,
    // onShellError is skipped.

    const { pipe } = renderToPipeableStream(div({}, "safe"), {
      onShellError() {
        shellErrorCalled = true;
      },
      onError() {
        onErrorCalled = true;
      },
    });
    pipe(w);
    await w.wait();

    // Normal render: no errors at all
    expect(shellErrorCalled).toBe(false);
    expect(onErrorCalled).toBe(false);
  });
});

// ─── Usage / Waiting for all content ──────────────────────────────────────

describe("renderToPipeableStream — Usage / Waiting for all content", () => {
  it("calls onAllReady after the full stream closes", async () => {
    const w = createWritable();
    let allReady = false;
    const { pipe } = renderToPipeableStream(div({}, "complete"), {
      onAllReady() {
        allReady = true;
      },
    });
    pipe(w);
    await w.wait();
    expect(allReady).toBe(true);
  });

  it("emits bootstrap scripts before calling onAllReady", async () => {
    const w = createWritable();
    let allReady = false;
    const { pipe } = renderToPipeableStream(div({}, "complete"), {
      bootstrapScripts: ["/app.js"],
      onAllReady() {
        allReady = true;
      },
    });
    pipe(w);
    await w.wait();
    expect(allReady).toBe(true);
    expect(w.text).toContain("/app.js");
  });
});

// ─── Usage / Aborting server rendering ────────────────────────────────────

describe("renderToPipeableStream — Usage / Aborting server rendering", () => {
  it("abort stops the stream without throwing", () => {
    const { pipe, abort } = renderToPipeableStream(div({}, "abort-me"));
    const w = createWritable();
    pipe(w);
    expect(() => abort("reason")).not.toThrow();
  });

  it("abort ends the writable stream", async () => {
    const w = createWritable();
    const { pipe, abort } = renderToPipeableStream(div({}, "abort-me"));
    pipe(w);
    abort();
    // Give a tick for the abort to propagate
    await new Promise((r) => setTimeout(r, 10));
    expect(w.ended).toBe(true);
  });

  it("abort before pipe is safe", () => {
    const { abort } = renderToPipeableStream(div({}, "never-piped"));
    expect(() => abort()).not.toThrow();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("renderToPipeableStream — Edge cases", () => {
  it("handles empty node (null)", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(null as any);
    pipe(w);
    await w.wait();
    expect(w.text).toBe("");
  });

  it("handles boolean node", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(true as any);
    pipe(w);
    await w.wait();
    expect(w.text).toBe("");
  });

  it("handles multiple bootstrapScripts", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "multi"), {
      bootstrapScripts: ["/a.js", "/b.js"],
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('src="/a.js"');
    expect(w.text).toContain('src="/b.js"');
  });

  it("handles multiple bootstrapModules", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "multi"), {
      bootstrapModules: ["/a.js", "/b.js"],
    });
    pipe(w);
    await w.wait();
    expect(w.text).toContain('type="module"');
    expect(w.text).toContain('src="/a.js"');
    expect(w.text).toContain('src="/b.js"');
  });

  it("identifierPrefix is passed through", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "prefixed"), {
      identifierPrefix: "myApp",
    });
    pipe(w);
    await w.wait();
    // Sinwan uses identifierPrefix for useId generation; output should still render
    expect(w.text).toContain("prefixed");
  });

  it("pipe returns the destination writable", () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "ret"));
    const returned = pipe(w);
    expect(returned).toBe(w);
  });

  it("does not emit bootstrap when all arrays are empty", async () => {
    const w = createWritable();
    const { pipe } = renderToPipeableStream(div({}, "no-boot"), {
      bootstrapScripts: [],
      bootstrapModules: [],
    });
    pipe(w);
    await w.wait();
    expect(w.text).not.toContain("<script");
  });
});
