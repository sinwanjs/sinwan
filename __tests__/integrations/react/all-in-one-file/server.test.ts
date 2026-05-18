/**
 * Phase 4 — SERVER React-compatible API tests.
 *
 * Verified against Sinwan's renderer + Bun's native ReadableStream.
 * No `react` / `react-dom` import.
 */

import { describe, it, expect } from "bun:test";
import {
  renderToString,
  renderToStaticMarkup,
  renderToReadableStream,
  renderToPipeableStream,
  resume,
  resumeToPipeableStream,
  renderShell,
  streamShell,
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

describe("renderToString", () => {
  it("renders a Sinwan element to HTML with hydration markers", async () => {
    const html = await renderToString(div({}, "hello"));
    expect(html).toContain("hello");
  });
});

describe("renderToStaticMarkup", () => {
  it("renders without hydration markers", async () => {
    const html = await renderToStaticMarkup(div({}, "static"));
    expect(html).toContain("static");
    // No comment-based markers in static output
    expect(html).not.toContain("<!--$");
  });
});

describe("renderToReadableStream", () => {
  it("returns a ReadableStream that produces the rendered HTML", async () => {
    const stream = await renderToReadableStream(div({}, "stream"));
    const html = await streamToString(stream);
    expect(html).toContain("stream");
  });

  it("appends bootstrapScriptContent at the end", async () => {
    const stream = await renderToReadableStream(div({}, "boot"), {
      bootstrapScriptContent: "console.log('hi')",
    });
    const html = await streamToString(stream);
    expect(html).toContain("<script>console.log('hi')</script>");
  });

  it("appends bootstrapModules as <script type=module>", async () => {
    const stream = await renderToReadableStream(div({}, "m"), {
      bootstrapModules: ["/client.js"],
    });
    const html = await streamToString(stream);
    expect(html).toContain('type="module"');
    expect(html).toContain("/client.js");
  });

  it("exposes an `allReady` promise", async () => {
    const stream = await renderToReadableStream(div({}, "ready"));
    expect(stream.allReady).toBeInstanceOf(Promise);
    await streamToString(stream);
    await stream.allReady;
  });
});

describe("renderToPipeableStream", () => {
  it("pipes into a Writable-like target and fires onShellReady", async () => {
    const chunks: Uint8Array[] = [];
    let shellReady = false;
    let allReady = false;

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
      writable.end = () => {
        orig();
        resolve();
      };
    });

    const { pipe } = renderToPipeableStream(div({}, "pipe"), {
      onShellReady: () => {
        shellReady = true;
      },
      onAllReady: () => {
        allReady = true;
      },
    });
    pipe(writable);
    await ended;

    const out = chunks.map((c) => new TextDecoder().decode(c)).join("");
    expect(out).toContain("pipe");
    expect(shellReady).toBe(true);
    expect(allReady).toBe(true);
  });
});

describe("resume / resumeToPipeableStream", () => {
  it("resume() falls back to a fresh render when no postponed state exists", async () => {
    const stream = await resume(div({}, "resumed"), null);
    const html = await streamToString(stream);
    expect(html).toContain("resumed");
  });

  it("resumeToPipeableStream() returns a PipeableStream", () => {
    const handle = resumeToPipeableStream(div({}, "x"), null);
    expect(typeof handle.pipe).toBe("function");
    expect(typeof handle.abort).toBe("function");
  });
});

describe("renderShell / streamShell (re-exported from sinwan/react-server)", () => {
  // Function components authored against `sinwan/jsx-runtime` are valid React
  // components from the user's perspective. The shell helpers accept them
  // directly without a separate React-only entry point.
  const App = (props: { name: string }) => div({}, `Hello ${props.name}`);

  it("renderShell wraps a React-style component in a hydratable HTML document", async () => {
    const html = await renderShell({
      component: App as any,
      props: { name: "React" },
      title: "React App",
      bootScript: { module: "/dist/client.js" },
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>React App</title>");
    expect(html).toContain("Hello React");
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain(
      '<script type="application/json" data-sinwan-props>',
    );
    expect(html).toContain('import("/dist/client.js")');
  });

  it("streamShell streams a complete document for React-style components", async () => {
    const html = await streamToString(
      streamShell({
        component: App as any,
        props: { name: "Stream" },
        title: "Streamed",
      }),
    );
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Hello Stream");
    expect(html.endsWith("</body></html>")).toBe(true);
  });
});
