/**
 * SinwanJS Islands — Unit Tests
 *
 * Verifies the partial-hydration story end-to-end:
 *   • `island(Component)` produces a wrapper element the renderers detect.
 *   • All four server renderers (static `renderToString`/`streamPage` and
 *     hydratable `renderToHydratableString`/`streamHydratablePage`) emit a
 *     `<wrapper data-sinwan-island="name" data-sinwan-island-props="...">`
 *     tag with hydration markers inside.
 *   • Each island has an independent marker counter (so two islands don't
 *     fight over `c0` / `t0`).
 *   • `hydrateIslands(registry)` walks the DOM, hydrates every island, and
 *     leaves non-island content untouched.
 *   • The React integration re-export accepts the same components.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/index.ts";
import { cc } from "../src/component/create.ts";
import { island } from "../src/component/island.ts";
import { hydrateIslands } from "../src/hydration/islands.ts";
import { renderToString } from "../src/server/renderer.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { streamPage, streamHydratablePage } from "../src/server/stream.ts";
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

let win: InstanceType<typeof Window>;
let doc: Document;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
});

// ─── island() factory ──────────────────────────────────────

describe("island()", () => {
  it("auto-derives a name from the component's function name", () => {
    function Counter() {
      return el("button", {}, "x");
    }
    const Island = island(Counter);
    const node = (Island as any)({});
    expect(node.props.__island.name).toBe("Counter");
    expect(node.props.__island.tag).toBe("div");
  });

  it("accepts an explicit name and tag", () => {
    const Inner = cc(() => el("p", {}, "x"));
    const Island = island(Inner, { name: "widget", tag: "section" });
    const node = (Island as any)({});
    expect(node.props.__island.name).toBe("widget");
    expect(node.props.__island.tag).toBe("section");
  });

  it("rejects non-function input", () => {
    expect(() => island(null as any)).toThrow();
    expect(() => island(42 as any)).toThrow();
  });
});

// ─── Static renderers wrap islands with markers inside ─────

describe("renderToString + island()", () => {
  it("emits a static wrapper with hydration markers inside", async () => {
    const Counter = cc<{ initial: number }>(({ initial }) => {
      const count = signal(initial);
      return el("button", { onClick: () => count.value++ }, "n=", count as any);
    });

    const App = cc(() => {
      const Island = island(Counter, { name: "counter" });
      return el(
        "main",
        {},
        el("h1", {}, "Static heading"),
        el(Island as any, { initial: 5 }),
      );
    });

    const html = await renderToString(el(App, {}));

    // Outer markup is plain (no hydration markers around the heading).
    expect(html).toContain("<main>");
    expect(html).toContain("<h1>Static heading</h1>");

    // Inner island carries markers + the props payload.
    expect(html).toContain('data-sinwan-island="counter"');
    expect(html).toContain(
      'data-sinwan-island-props="{&quot;initial&quot;:5}"',
    );
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain('data-sinwan-ev="click:0"');
    expect(html).toContain("<!--sinwan-t:0-->5<!--/sinwan-t-->");

    // No hydration markers leaked outside the island.
    const islandStart = html.indexOf('data-sinwan-island="counter"');
    const before = html.slice(0, islandStart);
    expect(before).not.toContain("data-sinwan-id=");
    expect(before).not.toContain("<!--sinwan-t:");
  });

  it("escapes potentially-dangerous prop values", async () => {
    const Inner = cc<{ name: string }>(({ name }) => el("p", {}, name));
    const Island = island(Inner, { name: "greeting" });
    const html = await renderToString(
      el(Island as any, { name: "</script><b>bad</b>" }),
    );

    // The wrapper attribute does not contain a literal `</script>` or `<b>`.
    expect(html).not.toMatch(/data-sinwan-island-props="[^"]*<\/script>/);
    expect(html).not.toMatch(/data-sinwan-island-props="[^"]*<b>/);
    expect(html).toContain("&lt;/script&gt;");
  });
});

describe("streamPage + island()", () => {
  it("streams a static page with embedded hydration islands", async () => {
    const Widget = cc<{ label: string }>(({ label }) => {
      const open = signal(false);
      return el(
        "button",
        { onClick: () => (open.value = !open.value) },
        label,
        " ",
        open as any,
      );
    });

    const Island = island(Widget, { name: "widget" });
    const Page = (data: { title: string }) =>
      el(
        "main",
        {},
        el("h1", {}, data.title),
        el(Island as any, { label: "toggle" }),
      );

    const html = await collectStream(streamPage(Page, { title: "Hello" }));

    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain('data-sinwan-island="widget"');
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain(
      'data-sinwan-island-props="{&quot;label&quot;:&quot;toggle&quot;}"',
    );
  });
});

// ─── Multiple islands get independent counters ─────────────

describe("multiple islands", () => {
  it("restart marker counters per island", async () => {
    const A = cc(() => {
      const v = signal(1);
      return el("span", {}, v as any);
    });
    const B = cc(() => {
      const v = signal(2);
      return el("span", {}, v as any);
    });

    const IslandA = island(A, { name: "a" });
    const IslandB = island(B, { name: "b" });

    const html = await renderToString(
      el("div", {}, el(IslandA as any, {}), el(IslandB as any, {})),
    );

    // Both islands should start their text marker counter at 0.
    const aStart = html.indexOf('data-sinwan-island="a"');
    const bStart = html.indexOf('data-sinwan-island="b"');
    expect(aStart).toBeGreaterThan(-1);
    expect(bStart).toBeGreaterThan(aStart);

    const aChunk = html.slice(aStart, bStart);
    const bChunk = html.slice(bStart);
    expect(aChunk).toContain("<!--sinwan-t:0-->1<!--/sinwan-t-->");
    expect(bChunk).toContain("<!--sinwan-t:0-->2<!--/sinwan-t-->");
  });
});

// ─── Hydratable renderers also support islands ─────────────

describe("renderToHydratableString + island()", () => {
  it("treats islands as boundaries even within a fully hydratable doc", async () => {
    const Inner = cc(() => el("span", {}, "isle"));
    const Island = island(Inner, { name: "iso" });

    const App = cc(() => el("div", {}, el(Island as any, {})));

    const html = await renderToHydratableString(App);
    expect(html).toContain('data-sinwan-island="iso"');
    expect(html).toContain('data-sinwan-id="c0"'); // outer App component id
  });
});

describe("streamHydratablePage + island()", () => {
  it("streams hydratable docs with island boundaries", async () => {
    const Inner = cc(() => el("span", {}, "isle"));
    const Island = island(Inner, { name: "iso" });
    const App = cc(() => el("div", {}, el(Island as any, {})));

    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain('data-sinwan-island="iso"');
  });
});

// ─── Client: hydrateIslands ────────────────────────────────

describe("hydrateIslands()", () => {
  it("hydrates only the registered islands", async () => {
    const Counter = cc<{ initial: number }>(({ initial }) => {
      const count = signal(initial);
      return el("button", { onClick: () => count.value++ }, "n=", count as any);
    });
    const CounterIsland = island(Counter, { name: "counter" });

    const App = cc(() =>
      el(
        "main",
        {},
        el("h1", {}, "Static"),
        el(CounterIsland as any, { initial: 9 }),
      ),
    );

    const container = doc.createElement("div");
    container.setAttribute("id", "app");
    doc.body.appendChild(container);
    container.innerHTML = await renderToString(el(App, {}));

    const hydrated = hydrateIslands({ counter: Counter });
    expect(hydrated.length).toBe(1);
    expect(hydrated[0].name).toBe("counter");

    const button = container.getElementsByTagName(
      "button",
    )[0] as HTMLButtonElement;
    expect(button.textContent).toBe("n=9");

    button.click();
    await Promise.resolve();
    expect(button.textContent).toBe("n=10");

    hydrated[0].instance.unmount();
  });

  it("skips islands without a matching registry entry", async () => {
    const Inner = cc(() => el("p", {}, "x"));
    const Anon = island(Inner, { name: "anon" });

    const container = doc.createElement("div");
    doc.body.appendChild(container);
    container.innerHTML = await renderToString(el(Anon as any, {}));

    const calls: string[] = [];
    const hydrated = hydrateIslands({}, doc, {
      onMissing: (name) => calls.push(name),
    });
    expect(hydrated.length).toBe(0);
    expect(calls).toEqual(["anon"]);
  });

  it("scopes hydration to a custom root", async () => {
    const Inner = cc(() => el("p", {}, "x"));
    const I = island(Inner, { name: "a" });

    const outsideHost = doc.createElement("div");
    doc.body.appendChild(outsideHost);
    outsideHost.innerHTML = await renderToString(el(I as any, {}));

    const insideHost = doc.createElement("div");
    doc.body.appendChild(insideHost);
    insideHost.innerHTML = await renderToString(el(I as any, {}));

    const hydrated = hydrateIslands({ a: Inner }, insideHost);
    expect(hydrated.length).toBe(1);
    expect(insideHost.contains(hydrated[0].element)).toBe(true);
  });

  it("recovers from malformed props JSON via onError", async () => {
    const Inner = cc(() => el("p", {}, "x"));
    const container = doc.createElement("div");
    container.innerHTML =
      '<div data-sinwan-island="bad" data-sinwan-island-props="not-json">' +
      '<p data-sinwan-id="c0">x</p></div>';
    doc.body.appendChild(container);

    const errors: { name: string; err: unknown }[] = [];
    const hydrated = hydrateIslands({ bad: Inner }, container, {
      onError: (name, err) => errors.push({ name, err }),
    });
    expect(hydrated.length).toBe(0);
    expect(errors.length).toBe(1);
    expect(errors[0].name).toBe("bad");
  });

  it("throws when root is null", () => {
    expect(() => hydrateIslands({}, null as any)).toThrow(
      "a DOM root is required",
    );
  });

  it("warns with default onMissing when island is not registered", async () => {
    const Inner = cc(() => el("p", {}, "x"));
    const Anon = island(Inner, { name: "missing" });

    const container = doc.createElement("div");
    doc.body.appendChild(container);
    container.innerHTML = await renderToString(el(Anon as any, {}));

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    const hydrated = hydrateIslands({}, container);
    expect(hydrated.length).toBe(0);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("missing");

    console.warn = originalWarn;
  });

  it("errors with default onError when props JSON is malformed", async () => {
    const Inner = cc(() => el("p", {}, "x"));
    const container = doc.createElement("div");
    container.innerHTML =
      '<div data-sinwan-island="bad" data-sinwan-island-props="not-json">' +
      "<p>x</p></div>";
    doc.body.appendChild(container);

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(" "));

    const hydrated = hydrateIslands({ bad: Inner }, container);
    expect(hydrated.length).toBe(0);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("bad");

    console.error = originalError;
  });
});

// ─── React integration verification ────────────────────────

describe("React integration re-exports", () => {
  it("exposes island() and hydrateIslands() through the React adapters", async () => {
    const reactServer = await import("../src/integrations/react/_server.ts");
    const reactClient = await import("../src/integrations/react/_client.ts");

    expect(typeof reactServer.island).toBe("function");
    expect(typeof reactClient.hydrateIslands).toBe("function");

    // Functional verification: round-trip through the React entry points.
    const Inner = cc<{ msg: string }>(({ msg }) => el("span", {}, msg));
    const Island = reactServer.island(Inner, { name: "msg" });
    const html = await renderToString(el(Island as any, { msg: "hi" }));
    expect(html).toContain('data-sinwan-island="msg"');

    const container = doc.createElement("div");
    doc.body.appendChild(container);
    container.innerHTML = html;
    const hydrated = reactClient.hydrateIslands({ msg: Inner }, container);
    expect(hydrated.length).toBe(1);
    expect(hydrated[0].name).toBe("msg");
  });
});
