/**
 * SinwanJS Hydration — Unit Tests
 *
 * Tests the full SSR → hydration flow:
 *   1. Server renders with markers (renderToHydratableString)
 *   2. Client hydrates the HTML (hydrate)
 *   3. Reactivity + events work on the existing DOM
 *
 * Run with: bun test src/client/hydration/__tests__/hydration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { computed, nextTick } from "../src/reactivity/index.ts";
import {
  onMounted,
  onUnmounted,
  provide,
  inject,
} from "../src/component/index.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { streamHydratablePage, streamPage } from "../src/server/stream.ts";
import { cc } from "../src/component/create.ts";
import { useFetch } from "../src/hook/index.ts";
import { Visible } from "../src/component/control-flow.ts";
import type { SinwanElement } from "../src/types.ts";
import { getSinwanData } from "../src/hydration/index.ts";
import {
  parseTextOpenMarker,
  isTextCloseMarker,
  parseEventAttr,
  parseCompId,
  eventAttrValue,
} from "../src/hydration/markers.ts";

// ─── DOM setup ─────────────────────────────────────────────

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  container = doc.createElement("div");
  container.setAttribute("id", "app");
  doc.body.appendChild(container);
});

// ─── Helper ────────────────────────────────────────────────

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag: tag as any, props: { ...props, children }, children };
}

function byTag(parent: Node, tag: string): HTMLElement[] {
  return Array.from(
    (parent as HTMLElement).getElementsByTagName(tag),
  ) as unknown as HTMLElement[];
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

// ─── Marker parsing ────────────────────────────────────────

describe("marker helpers", () => {
  it("parseCompId parses component IDs", () => {
    expect(parseCompId("c0")).toBe(0);
    expect(parseCompId("c42")).toBe(42);
  });

  it("parseEventAttr parses event references", () => {
    expect(parseEventAttr("click:0")).toEqual([["click", 0]]);
    expect(parseEventAttr("click:0,input:1")).toEqual([
      ["click", 0],
      ["input", 1],
    ]);
  });

  it("eventAttrValue builds event attribute strings", () => {
    expect(eventAttrValue("click", 0)).toBe("click:0");
    expect(eventAttrValue("input", 3)).toBe("input:3");
  });
});

// ─── renderToHydratableString ──────────────────────────────

describe("renderToHydratableString", () => {
  it("injects component boundary marker", async () => {
    const App = cc(() => el("div", {}, "hello"));
    const html = await renderToHydratableString(App);

    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("hello");
  });

  it("wraps signal values with text markers", async () => {
    const App = cc(() => {
      const count = signal(5);
      return el("p", {}, "Count: ", count as any);
    });

    const html = await renderToHydratableString(App);
    expect(html).toContain("Count: ");
    expect(html).toContain("<!--sinwan-t:0-->5<!--/sinwan-t-->");
  });

  it("adds event markers", async () => {
    const App = cc(() => {
      return el("button", { onClick: () => {} }, "Click");
    });

    const html = await renderToHydratableString(App);
    expect(html).toContain('data-sinwan-ev="click:0"');
  });

  it("handles nested components", async () => {
    const Child = cc(() => el("span", {}, "child"));

    const App = cc(() => {
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    const html = await renderToHydratableString(App);
    // Both parent and child get component IDs
    expect(html).toContain('data-sinwan-id="c0"'); // App's div
    expect(html).toContain('data-sinwan-id="c1"'); // Child's span
  });

  it("renders static + reactive children correctly", async () => {
    const App = cc(() => {
      const name = signal("World");
      return el("h1", {}, "Hello ", name as any, "!");
    });

    const html = await renderToHydratableString(App);
    expect(html).toContain("Hello ");
    expect(html).toContain("<!--sinwan-t:0-->World<!--/sinwan-t-->");
    expect(html).toContain("!");
  });

  it("serializes helper style and class objects for hydration", async () => {
    const App = cc(() => {
      const open = signal(false);
      return el(
        Visible,
        {
          when: open,
          as: "section",
          class: { panel: true, hidden: false },
          style: { backgroundColor: "red" },
        },
        "panel",
      );
    });

    const html = await renderToHydratableString(App);
    expect(html).toContain('class="panel"');
    expect(html).toContain('style="background-color:red;display:none"');
    expect(html).not.toContain("[object Object]");
  });
});

// ─── Full hydration flow ───────────────────────────────────

describe("hydrate", () => {
  it("hydrates static HTML without errors", async () => {
    const App = cc(() => el("div", {}, "Hello"));

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const app = hydrate(App, container);
    expect(app.root).toBeDefined();
    expect(container.textContent).toContain("Hello");
  });

  it("reactive text updates after hydration", async () => {
    const App = cc(() => {
      const count = signal(5);
      return el(
        "div",
        {},
        el("span", {}, "Count: ", count as any),
        el(
          "button",
          {
            onClick: () => {
              count.value++;
            },
          },
          "+",
        ),
      );
    });

    // SSR
    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    expect(container.textContent).toContain("Count: 5");

    // Hydrate
    hydrate(App, container);

    // The DOM should still show the same content
    expect(container.textContent).toContain("Count: 5");

    // Click the button to increment
    const btn = byTag(container, "button")[0]!;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("Count: 6");
  });

  it("computed values update after hydration", async () => {
    const App = cc(() => {
      const price = signal(10);
      const qty = signal(3);
      const total = computed(() => price.value * qty.value);

      return el(
        "div",
        {},
        el("span", {}, "Total: ", total as any),
        el(
          "button",
          {
            onClick: () => {
              qty.value++;
            },
          },
          "Add",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    hydrate(App, container);

    expect(container.textContent).toContain("Total: 30");

    const btn = byTag(container, "button")[0]!;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("Total: 40");
  });

  it("keeps reactive form properties in sync after hydration", async () => {
    const App = cc(() => {
      const text = signal("hello");
      const checked = signal(false);
      const disabled = signal(true);

      return el(
        "form",
        {},
        el("input", {
          id: "name",
          value: text as any,
          disabled: disabled as any,
        }),
        el("input", { id: "flag", type: "checkbox", checked: checked as any }),
        el(
          "button",
          {
            id: "apply",
            type: "button",
            onClick: () => {
              text.value = "world";
              checked.value = true;
              disabled.value = false;
            },
          },
          "Apply",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    hydrate(App, container);

    const inputs = byTag(container, "input") as unknown as HTMLInputElement[];
    const textInput = inputs[0]!;
    const checkbox = inputs[1]!;
    const button = byTag(container, "button")[0]! as HTMLButtonElement;

    expect(textInput.value).toBe("hello");
    expect(checkbox.checked).toBe(false);
    expect(textInput.disabled).toBe(true);

    button.click();
    await nextTick();

    expect(textInput.value).toBe("world");
    expect(checkbox.checked).toBe(true);
    expect(textInput.disabled).toBe(false);
  });

  it("onMounted fires during hydration", async () => {
    let mounted = false;

    const App = cc(() => {
      onMounted(() => {
        mounted = true;
      });
      return el("div", {}, "hello");
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    expect(mounted).toBe(false);
    hydrate(App, container);
    expect(mounted).toBe(true);
  });

  it("onUnmounted fires on app.unmount()", async () => {
    let unmounted = false;

    const App = cc(() => {
      onUnmounted(() => {
        unmounted = true;
      });
      return el("div", {}, "hello");
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const app = hydrate(App, container);
    expect(unmounted).toBe(false);

    app.unmount();
    expect(unmounted).toBe(true);
  });

  it("reuses existing DOM nodes (no recreation)", async () => {
    const App = cc(() => {
      return el(
        "div",
        { class: "root" },
        el("h1", {}, "Title"),
        el("p", {}, "Body"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    // Capture references to existing DOM nodes
    const originalDiv = container.firstElementChild!;
    const originalH1 = byTag(container, "h1")[0]!;

    hydrate(App, container);

    // Same DOM nodes should be reused
    expect(container.firstElementChild).toBe(originalDiv);
    expect(byTag(container, "h1")[0]).toBe(originalH1);
  });

  it("event handlers are attached during hydration", async () => {
    let clicked = false;

    const App = cc(() => {
      return el(
        "button",
        {
          onClick: () => {
            clicked = true;
          },
        },
        "Click me",
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    hydrate(App, container);

    const btn = byTag(container, "button")[0]!;
    btn.click();
    expect(clicked).toBe(true);
  });

  it("handles errors during hydration gracefully", async () => {
    const consoleErrors: any[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => consoleErrors.push(args);

    let callCount = 0;
    const BadApp = cc(() => {
      callCount++;
      if (callCount > 1) {
        throw new Error("hydration boom");
      }
      return el("div", {}, "ok");
    });

    const html = await renderToHydratableString(BadApp);
    container.innerHTML = html;

    const app = hydrate(BadApp, container);
    expect(app.root).toBeDefined();
    app.unmount();

    console.error = originalConsoleError;
    expect(
      consoleErrors.some((args) =>
        args.some(
          (a: any) =>
            (typeof a === "string" && a.includes("hydration boom")) ||
            (a instanceof Error && a.message.includes("hydration boom")),
        ),
      ),
    ).toBe(true);
  });

  it("interactive counter: full SSR → hydrate → click flow", async () => {
    const Counter = cc<{ initial?: number }>(({ initial = 0 }) => {
      const count = signal(initial as number);
      return el(
        "div",
        {},
        el("span", {}, count as any),
        el(
          "button",
          {
            onClick: () => {
              count.value++;
            },
          },
          "+",
        ),
        el(
          "button",
          {
            onClick: () => {
              count.value--;
            },
          },
          "-",
        ),
      );
    });

    // SSR
    const html = await renderToHydratableString(Counter, { initial: 10 });
    container.innerHTML = html;
    expect(container.textContent).toContain("10");

    // Hydrate
    hydrate(Counter, container, { initial: 10 });

    const span = byTag(container, "span")[0]!;
    const buttons = byTag(container, "button");
    const incBtn = buttons[0]!;
    const decBtn = buttons[1]!;

    expect(span.textContent).toBe("10");

    incBtn.click();
    await nextTick();
    expect(span.textContent).toBe("11");

    incBtn.click();
    await nextTick();
    expect(span.textContent).toBe("12");

    decBtn.click();
    await nextTick();
    expect(span.textContent).toBe("11");
  });
});

// ─── Hydratable streaming ──────────────────────────────────

describe("hydratable streaming", () => {
  it("streamHydratablePage emits component, reactive text, and event markers", async () => {
    const App = cc(() => {
      const count = signal(7);
      return el("button", { onClick: () => {} }, "Count ", count as any);
    });

    const html = await collectStream(streamHydratablePage(App));
    expect(html).toContain('data-sinwan-id="c0"');
    expect(html).toContain("<!--sinwan-t:0-->7<!--/sinwan-t-->");
    expect(html).toContain('data-sinwan-ev="click:0"');
  });

  it("streamed hydratable HTML can be inserted and hydrated", async () => {
    const App = cc(() => {
      const count = signal(0);
      return el(
        "button",
        {
          onClick: () => {
            count.value++;
          },
        },
        "Count ",
        count as any,
      );
    });

    container.innerHTML = await collectStream(streamHydratablePage(App));
    hydrate(App, container);

    const button = byTag(container, "button")[0]!;
    button.click();
    await nextTick();
    expect(button.textContent).toBe("Count 1");
  });

  it("streamPage remains non-marker output", async () => {
    const count = signal(3);
    const html = await collectStream(
      streamPage(() => el("button", { onClick: () => {} }, count as any), {}),
    );

    expect(html).toBe("<button>3</button>");
    expect(html).not.toContain("data-sinwan-id");
    expect(html).not.toContain("data-sinwan-ev");
    expect(html).not.toContain("sinwan-t");
  });
});

// ─── getSinwanData ─────────────────────────────────────────

describe("getSinwanData", () => {
  it("returns empty object when script tag is missing", () => {
    expect(getSinwanData()).toEqual({});
  });

  it("returns parsed data when script tag has valid JSON", () => {
    const script = doc.createElement("script");
    script.id = "__SINWAN_DATA__";
    script.type = "application/json";
    script.textContent = JSON.stringify({ key: "value", nested: { a: 1 } });
    doc.head.appendChild(script);
    expect(getSinwanData()).toEqual({ key: "value", nested: { a: 1 } });
    doc.head.removeChild(script);
  });

  it("returns empty object when script tag has invalid JSON", () => {
    const script = doc.createElement("script");
    script.id = "__SINWAN_DATA__";
    script.type = "application/json";
    script.textContent = "{invalid json}";
    doc.head.appendChild(script);
    expect(getSinwanData()).toEqual({});
    doc.head.removeChild(script);
  });

  it("returns empty object when script tag has empty text content", () => {
    const script = doc.createElement("script");
    script.id = "__SINWAN_DATA__";
    script.type = "application/json";
    script.textContent = "";
    doc.head.appendChild(script);
    expect(getSinwanData()).toEqual({});
    doc.head.removeChild(script);
  });
});

describe("renderToHydratableString SSR fetch re-render", () => {
  let originalWindow: unknown;
  let originalDocument: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    originalDocument = (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).document = originalDocument;
  });

  function asFetch(
    fn: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>,
  ) {
    return fn as unknown as typeof globalThis.fetch;
  }

  it("waits for pending fetches and re-renders an element tree", async () => {
    const fetch = asFetch(async (input) => {
      expect(String(input)).toBe("https://api.example.com/message");
      return new Response("hello", { status: 200 });
    });
    const App = cc(() => {
      const fetcher = useFetch("message", {
        fetch,
        immediate: true,
      }).text();
      return el("p", {}, fetcher.data.value ?? "loading");
    });
    const out: { fetchData?: Record<string, unknown> } = {};
    const html = await renderToHydratableString(App, {}, {
      baseUrl: "https://api.example.com",
      out,
    });
    expect(html).toContain("hello");
    expect(out.fetchData).toBeDefined();
    expect(Object.keys(out.fetchData ?? {}).length).toBeGreaterThan(0);
  });

  it("re-renders a non-element result after pending fetches", async () => {
    const fetch = asFetch(async () => new Response("plain", { status: 200 }));
    const App = cc(() => {
      const fetcher = useFetch("/plain", {
        fetch,
        immediate: true,
      }).text();
      return fetcher.data.value ?? "loading";
    });
    const html = await renderToHydratableString(App);
    expect(html).toContain("plain");
  });
});
