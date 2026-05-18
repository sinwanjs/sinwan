/**
 * SinwanJS ErrorBoundary — Unit Tests
 *
 * Tests DOM rendering, reactive reset, and server-side rendering.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { nextTick } from "../src/reactivity/scheduler.ts";
import { mount, render } from "../src/renderer/mount.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import type {
  SinwanElement,
  SinwanComponent,
  SinwanNode,
} from "../src/types.ts";
import { cc } from "../src/component/create.ts";
import { ErrorBoundary } from "../src/component/control-flow.ts";
import { streamPage, streamHydratablePage } from "../src/server/stream.ts";
import { renderToString } from "../src/server/renderer.ts";

// ─── DOM setup ─────────────────────────────────────────────

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;

  container = doc.createElement("div");
  container.setAttribute("id", "root");
  doc.body.appendChild(container);
});

// ─── Helpers ───────────────────────────────────────────────

function el(
  tag: string | SinwanComponent<any>,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(new TextDecoder().decode(value));
  }
  return chunks.join("");
}

// ─── DOM rendering ─────────────────────────────────────────

describe("ErrorBoundary DOM", () => {
  it("renders children when no error occurs", () => {
    const App = cc(() =>
      ErrorBoundary({
        fallback: "error",
        children: el("span", {}, "ok"),
      }),
    );

    const app = mount(App, container);
    expect(container.textContent).toContain("ok");
    expect(container.textContent).not.toContain("error");
    app.unmount();
  });

  it("catches child component errors and renders fallback", () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    const App = cc(() =>
      ErrorBoundary({
        fallback: el("span", {}, "caught"),
        children: el(Bad, {}),
      }),
    );

    const app = mount(App, container);
    expect(container.textContent).toContain("caught");
    expect(container.textContent).not.toContain("boom");
    app.unmount();
  });

  it("passes error and reset to function fallback", async () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    let receivedError: Error | null = null;
    let receivedReset: (() => void) | null = null;

    const App = cc(() =>
      ErrorBoundary({
        fallback: (err, reset) => {
          receivedError = err;
          receivedReset = reset;
          return el("button", {}, "retry");
        },
        children: el(Bad, {}),
      }),
    );

    const app = mount(App, container);
    expect(container.textContent).toContain("retry");
    expect(receivedError).not.toBeNull();
    expect(receivedError!.message).toBe("boom");
    expect(receivedReset).not.toBeNull();
    app.unmount();
  });

  it("reset re-renders children after error", async () => {
    let shouldThrow = true;

    const SometimesBad = cc(() => {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return el("span", {}, "recovered");
    });

    let resetFn: (() => void) | null = null;

    const App = cc(() =>
      ErrorBoundary({
        fallback: (_err, reset) => {
          resetFn = reset;
          return el("span", {}, "fallback");
        },
        children: el(SometimesBad, {}),
      }),
    );

    const app = mount(App, container);
    expect(container.textContent).toContain("fallback");

    shouldThrow = false;
    resetFn!();
    await nextTick();

    expect(container.textContent).toContain("recovered");
    expect(container.textContent).not.toContain("fallback");
    app.unmount();
  });

  it("does not catch errors outside rendering (e.g. event handlers)", async () => {
    const App = cc(() =>
      ErrorBoundary({
        fallback: el("span", {}, "caught"),
        children: el("button", {}, "click me"),
      }),
    );

    const app = mount(App, container);
    expect(container.textContent).toContain("click me");
    expect(container.querySelector("button")).not.toBeNull();
    app.unmount();
  });
});

// ─── Server rendering ──────────────────────────────────────

describe("ErrorBoundary server rendering", () => {
  it("renders children when no error (stream)", async () => {
    const html = await collectStream(
      streamPage(
        () =>
          ErrorBoundary({
            fallback: "error",
            children: el("span", {}, "ok"),
          }),
        {},
      ),
    );
    expect(html).toContain("ok");
    expect(html).not.toContain("error");
  });

  it("renders fallback on child error (stream)", async () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    const html = await collectStream(
      streamPage(
        () =>
          ErrorBoundary({
            fallback: el("span", {}, "caught"),
            children: el(Bad, {}),
          }),
        {},
      ),
    );
    expect(html).toContain("caught");
  });

  it("renders function fallback on error (stream)", async () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    const html = await collectStream(
      streamPage(
        () =>
          ErrorBoundary({
            fallback: (err) => el("span", {}, err.message),
            children: el(Bad, {}),
          }),
        {},
      ),
    );
    expect(html).toContain("boom");
  });

  it("renders children when no error (hydratable stream)", async () => {
    const App = cc(() =>
      ErrorBoundary({
        fallback: "error",
        children: el("span", {}, "ok"),
      }),
    );

    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain("ok");
    expect(html).not.toContain("error");
  });

  it("renders fallback on child error (hydratable stream)", async () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    const App = cc(() =>
      ErrorBoundary({
        fallback: el("span", {}, "caught"),
        children: el(Bad, {}),
      }),
    );

    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain("caught");
  });

  it("renders fallback on child error (string render)", async () => {
    const Bad = cc(() => {
      throw new Error("boom");
    });

    const html = await renderToString(
      ErrorBoundary({
        fallback: el("span", {}, "caught"),
        children: el(Bad, {}),
      }) as any,
    );
    expect(html).toContain("caught");
  });

  it("renders children when no error (string render)", async () => {
    const html = await renderToString(
      ErrorBoundary({
        fallback: "error",
        children: el("span", {}, "ok"),
      }) as any,
    );
    expect(html).toContain("ok");
    expect(html).not.toContain("error");
  });
});
