/**
 * SinwanJS Shell — Unit Tests
 *
 * Verifies that `renderShell` / `streamShell`:
 *   • Produce a complete `<!doctype html>` document with hydration markers
 *   • Auto-inject the client `<script>` and an inline `hydrate()` boot snippet
 *   • Embed serialised props for the client to read
 *   • Honour shell options (title, head, scripts, container id, html attrs…)
 *   • Survive end-to-end hydration when the emitted HTML is loaded into a DOM
 *
 * These tests exercise the fix for v1's "no automatic shell hydration"
 * limitation — once the consumer points the boot script at their client
 * bundle, the shell renders, mounts and hydrates without manual `<script>`
 * wiring.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/index.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { cc } from "../src/component/create.ts";
import { renderShell, streamShell } from "../src/server/shell.ts";
import type { SinwanElement } from "../src/types.ts";

// ─── Helpers ───────────────────────────────────────────────

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

// ─── DOM bootstrap ─────────────────────────────────────────

let win: InstanceType<typeof Window>;
let doc: Document;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
});

// ─── renderShell ───────────────────────────────────────────

describe("renderShell", () => {
  it("emits a complete HTML document with hydration markers", async () => {
    const App = cc(() => el("h1", {}, "hello"));

    const html = await renderShell({
      component: App,
      title: "Home",
      scripts: ["/client.js"],
    });

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain("<title>Home</title>");
    expect(html).toContain('<div id="app" data-sinwan-root="">');
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("hello");
    expect(html).toContain('<script src="/client.js" type="module"></script>');
    expect(html.endsWith("</body></html>")).toBe(true);
  });

  it("escapes title content", async () => {
    const App = cc(() => el("p", {}, "ok"));
    const html = await renderShell({
      component: App,
      title: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(
      "<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>",
    );
  });

  it("respects custom container tag and id", async () => {
    const App = cc(() => el("span", {}, "x"));
    const html = await renderShell({
      component: App,
      containerTag: "main",
      containerId: "root",
    });
    expect(html).toContain('<main id="root" data-sinwan-root="">');
    expect(html).toContain("</main>");
  });

  it("embeds serialised props as JSON safely", async () => {
    const App = cc<{ name: string }>(({ name }) =>
      el("p", {}, `Hello ${name}`),
    );

    const html = await renderShell({
      component: App,
      props: { name: "</script><script>alert(1)//" },
    });

    // The literal `</script>` must be neutralised inside the JSON block.
    expect(html).not.toMatch(/<script>alert\(1\)\/\//);
    expect(html).toContain(
      '<script type="application/json" data-sinwan-props>',
    );
  });

  it("can disable props embedding", async () => {
    const App = cc(() => el("div", {}, "x"));
    const html = await renderShell({
      component: App,
      props: { secret: "shh" },
      embedProps: false,
    });
    expect(html).not.toContain("data-sinwan-props");
  });

  it("emits an inline hydrate boot snippet when given a module URL", async () => {
    const App = cc(() => el("div", {}, "boot"));
    const html = await renderShell({
      component: App,
      bootScript: { module: "/dist/app.client.js" },
    });

    // Boot script imports the module, reads props JSON and calls hydrate().
    expect(html).toContain('<script type="module">');
    expect(html).toContain('import("/dist/app.client.js")');
    expect(html).toContain(
      'document.querySelector("script[data-sinwan-props]")',
    );
    expect(html).toContain("#app");
  });

  it("supports a custom verbatim boot snippet", async () => {
    const App = cc(() => el("div", {}, "x"));
    const html = await renderShell({
      component: App,
      bootScript: 'console.log("boot");',
    });
    expect(html).toContain(
      '<script type="module">console.log("boot");</script>',
    );
  });

  it("does not emit a boot snippet when disabled", async () => {
    const App = cc(() => el("div", {}, "x"));
    const html = await renderShell({ component: App, bootScript: false });
    expect(html).not.toContain('<script type="module">');
  });

  it("forwards extra head HTML and stylesheets", async () => {
    const App = cc(() => el("p", {}, "x"));
    const html = await renderShell({
      component: App,
      head: '<meta name="theme-color" content="#fff">',
      stylesheets: [{ href: "/styles.css" }],
    });
    expect(html).toContain('<meta name="theme-color" content="#fff">');
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">');
  });

  it("places head-positioned scripts inside <head>", async () => {
    const App = cc(() => el("p", {}, "x"));
    const html = await renderShell({
      component: App,
      scripts: [
        { src: "/early.js", placement: "head", module: false, defer: true },
      ],
    });
    const headEnd = html.indexOf("</head>");
    const earlyAt = html.indexOf("/early.js");
    expect(earlyAt).toBeGreaterThan(0);
    expect(earlyAt).toBeLessThan(headEnd);
  });

  it("applies html and body attributes", async () => {
    const App = cc(() => el("p", {}, "x"));
    const html = await renderShell({
      component: App,
      lang: "fr",
      htmlAttrs: { dir: "rtl" },
      bodyAttrs: { className: "dark" },
    });
    expect(html).toContain('<html lang="fr" dir="rtl">');
    expect(html).toContain('<body class="dark">');
  });
});

// ─── streamShell ───────────────────────────────────────────

describe("streamShell", () => {
  it("streams a complete document with hydration markers", async () => {
    const App = cc(() => {
      const count = signal(7);
      return el("p", {}, "n=", count as any);
    });

    const html = await collectStream(
      streamShell({
        component: App,
        title: "Stream",
        scripts: ["/client.js"],
      }),
    );

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Stream</title>");
    expect(html).toContain('<div id="app" data-sinwan-root="">');
    expect(html).toContain("<!--sinwan-t:0-->7<!--/sinwan-t-->");
    expect(html).toContain('<script src="/client.js" type="module"></script>');
    expect(html.endsWith("</body></html>")).toBe(true);
  });
});

// ─── End-to-end: render → hydrate ──────────────────────────

describe("renderShell → hydrate", () => {
  it("produces HTML the runtime can hydrate", async () => {
    const Counter = cc<{ initial: number }>(({ initial }) => {
      const count = signal(initial);
      return el("button", { onClick: () => count.value++ }, "n=", count as any);
    });

    const html = await renderShell({
      component: Counter,
      props: { initial: 3 },
      bootScript: false,
    });

    // Strip the document chrome and load the body contents into happy-dom.
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    expect(bodyMatch).not.toBeNull();
    doc.body.innerHTML = bodyMatch![1];
    const container = doc.getElementById("app")!;

    // Read embedded props JSON the same way the auto boot snippet would.
    const propsScript = Array.from(
      doc.body.getElementsByTagName("script"),
    ).find((s) => (s as Element).hasAttribute("data-sinwan-props"));
    const props = JSON.parse(propsScript?.textContent ?? "{}");

    const app = hydrate(Counter, container, props);
    const button = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    expect(button.textContent).toBe("n=3");

    // Reactivity is wired up.
    button.click();
    await Promise.resolve();
    expect(button.textContent).toBe("n=4");

    app.unmount();
  });
});
