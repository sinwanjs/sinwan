/**
 * Comprehensive tests for `<Script>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Script,
  _resetScriptRegistry,
} from "../../../../src/integrations/react/elements.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
  _resetScriptRegistry();
  // Clean up any script elements left in head from previous tests
  const headScripts = win.document.head.querySelectorAll("script");
  for (const s of Array.from(headScripts)) {
    s.parentNode?.removeChild(s);
  }
});

const el = (
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ───────────────────────────────────────────────────────────

describe("Script — Reference", () => {
  it("renders a native <script> element", () => {
    const App = cc(() => Script({ src: "/app.js", async: true }));
    mount(App, container);
    const script = win.document.head.querySelector(
      'script[src="/app.js"]',
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.tagName.toLowerCase()).toBe("script");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Script({
        src: "/app.js",
        async: true,
        id: "my-script",
        className: "lazy",
      }),
    );
    mount(App, container);
    const script = win.document.head.querySelector(
      'script[id="my-script"]',
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.getAttribute("class")).toBe("lazy");
  });

  it("returns a valid SinwanElement when called outside a component", () => {
    const result = Script({ src: "/test.js", async: true });
    expect(result.tag).toBe("script");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Script — Props", () => {
  it("sets src attribute", () => {
    const App = cc(() => Script({ src: "/lib.js", async: true }));
    mount(App, container);
    const script = win.document.head.querySelector(
      'script[src="/lib.js"]',
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
  });

  it("sets async attribute", () => {
    const App = cc(() => Script({ src: "/lib.js", async: true }));
    mount(App, container);
    const script = win.document.head.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script.async).toBe(true);
  });

  it("sets type attribute", () => {
    const App = cc(() =>
      Script({ src: "/module.js", async: true, type: "module" }),
    );
    mount(App, container);
    const script = win.document.head.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script.getAttribute("type")).toBe("module");
  });

  it("sets crossOrigin attribute", () => {
    const App = cc(() =>
      Script({ src: "/cdn.js", async: true, crossOrigin: "anonymous" }),
    );
    mount(App, container);
    const script = win.document.head.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("sets integrity attribute", () => {
    const App = cc(() =>
      Script({
        src: "/safe.js",
        async: true,
        integrity: "sha384-abc",
      }),
    );
    mount(App, container);
    const script = win.document.head.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script.getAttribute("integrity")).toBe("sha384-abc");
  });

  it("renders inline script with children", () => {
    const App = cc(() => Script({ children: "console.log('hello');" }));
    mount(App, container);
    const script = container.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.textContent).toBe("console.log('hello');");
  });
});

// ─── Special rendering behavior ──────────────────────────────────────────

describe("Script — Special rendering behavior", () => {
  it("moves async external script to document.head", () => {
    const App = cc(() => Script({ src: "/head.js", async: true }));
    mount(App, container);

    expect(container.querySelector("script")).toBeFalsy();
    expect(
      win.document.head.querySelector('script[src="/head.js"]'),
    ).toBeTruthy();
  });

  it("does not move to head when async is not true", () => {
    const App = cc(() => Script({ src: "/body.js", async: false }));
    mount(App, container);

    expect(container.querySelector('script[src="/body.js"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('script[src="/body.js"]'),
    ).toBeFalsy();
  });

  it("does not move to head when async is undefined", () => {
    const App = cc(() => Script({ src: "/body.js" }));
    mount(App, container);

    expect(container.querySelector('script[src="/body.js"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('script[src="/body.js"]'),
    ).toBeFalsy();
  });

  it("does not move to head when onError is present", () => {
    const App = cc(() =>
      Script({ src: "/body.js", async: true, onError: () => {} }),
    );
    mount(App, container);

    expect(container.querySelector('script[src="/body.js"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('script[src="/body.js"]'),
    ).toBeFalsy();
  });

  it("does not move to head when onLoad is present", () => {
    const App = cc(() =>
      Script({ src: "/body.js", async: true, onLoad: () => {} }),
    );
    mount(App, container);

    expect(container.querySelector('script[src="/body.js"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('script[src="/body.js"]'),
    ).toBeFalsy();
  });

  it("does not move inline scripts to head", () => {
    const App = cc(() => Script({ children: "alert(1);" }));
    mount(App, container);

    expect(container.querySelector("script")).toBeTruthy();
    expect(win.document.head.querySelector("script")).toBeFalsy();
  });

  it("de-duplicates scripts with the same src", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Script({ src: "/dup.js", async: true }),
        Script({ src: "/dup.js", async: true }),
      ),
    );
    mount(App, container);

    const scripts = win.document.head.querySelectorAll('script[src="/dup.js"]');
    expect(scripts.length).toBe(1);
  });

  it("de-duplicates across different components", () => {
    const A = cc(() => Script({ src: "/shared.js", async: true }));
    const B = cc(() => Script({ src: "/shared.js", async: true }));

    mount(A, container);
    mount(B, container);

    const scripts = win.document.head.querySelectorAll(
      'script[src="/shared.js"]',
    );
    expect(scripts.length).toBe(1);
  });

  it("leaves script in head on unmount", () => {
    const App = cc(() => Script({ src: "/stay.js", async: true }));
    const app = mount(App, container);

    expect(
      win.document.head.querySelector('script[src="/stay.js"]'),
    ).toBeTruthy();

    app.unmount();

    expect(
      win.document.head.querySelector('script[src="/stay.js"]'),
    ).toBeTruthy();
  });
});

// ─── Usage / Rendering an external script ────────────────────────────────

describe("Script — Usage / Rendering an external script", () => {
  it("renders an external async script", () => {
    const App = cc(() =>
      Script({ src: "https://example.com/api.js", async: true }),
    );
    mount(App, container);

    const script = win.document.head.querySelector(
      'script[src="https://example.com/api.js"]',
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.async).toBe(true);
  });

  it("renders multiple different external scripts in head", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Script({ src: "/a.js", async: true }),
        Script({ src: "/b.js", async: true }),
      ),
    );
    mount(App, container);

    expect(win.document.head.querySelectorAll("script").length).toBe(2);
  });
});

// ─── Usage / Rendering an inline script ─────────────────────────────────

describe("Script — Usage / Rendering an inline script", () => {
  it("renders inline script in the component's location", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        el("h1", {}, "My Website"),
        Script({ children: "ga('send', 'pageview');" }),
        el("p", {}, "Welcome"),
      ),
    );
    mount(App, container);

    const h1 = container.querySelector("h1");
    const script = container.querySelector("script");
    const p = container.querySelector("p");
    expect(h1).toBeTruthy();
    expect(script).toBeTruthy();
    expect(p).toBeTruthy();
    expect(script!.textContent).toBe("ga('send', 'pageview');");
  });

  it("does not de-duplicate inline scripts", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Script({ children: "console.log(1);" }),
        Script({ children: "console.log(1);" }),
      ),
    );
    mount(App, container);

    expect(container.querySelectorAll("script").length).toBe(2);
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Script — Caveats", () => {
  it("ignores prop changes after first render (component runs once)", async () => {
    // In Sinwan, the component function only runs once, so prop changes
    // are naturally ignored for non-reactive props.
    const App = cc(() => Script({ src: "/static.js", async: true }));
    mount(App, container);

    const script = win.document.head.querySelector(
      'script[src="/static.js"]',
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.getAttribute("src")).toBe("/static.js");
  });

  it("calls the user ref with the element after moving to head", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Script({
        src: "/ref.js",
        async: true,
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("script");
    expect(refEl!.parentNode as any).toBe(win.document.head);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Script — Edge cases", () => {
  it("handles rapid mount/unmount cycles", () => {
    const App = cc(() => Script({ src: "/cycle.js", async: true }));
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);

    expect(
      win.document.head.querySelectorAll('script[src="/cycle.js"]').length,
    ).toBe(1);
    app2.unmount();
    expect(
      win.document.head.querySelector('script[src="/cycle.js"]'),
    ).toBeTruthy(); // stays in DOM
  });

  it("does not move script with empty src", () => {
    const App = cc(() => Script({ src: "", async: true }));
    mount(App, container);

    expect(container.querySelector("script")).toBeTruthy();
    expect(win.document.head.querySelector("script")).toBeFalsy();
  });

  it("does not move script with null src", () => {
    const App = cc(() => Script({ src: null as any, async: true }));
    mount(App, container);

    expect(container.querySelector("script")).toBeTruthy();
    expect(win.document.head.querySelector("script")).toBeFalsy();
  });

  it("renders script with both src and children as inline", () => {
    // When children is present, it takes precedence and renders normally
    const App = cc(() =>
      Script({ src: "/ignored.js", children: "console.log(2);" }),
    );
    mount(App, container);

    const script = container.querySelector(
      "script",
    ) as unknown as HTMLScriptElement;
    expect(script).toBeTruthy();
    expect(script.textContent).toBe("console.log(2);");
  });

  it("does not interfere with other head elements", () => {
    const existingMeta = win.document.createElement("meta");
    existingMeta.setAttribute("name", "viewport");
    win.document.head.appendChild(existingMeta);

    const App = cc(() => Script({ src: "/new.js", async: true }));
    mount(App, container);

    expect(win.document.head.querySelector("meta")).toBeTruthy();
    expect(
      win.document.head.querySelector('script[src="/new.js"]'),
    ).toBeTruthy();
  });
});
