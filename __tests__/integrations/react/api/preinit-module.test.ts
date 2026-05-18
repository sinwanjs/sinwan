/**
 * preinitModule — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { preinitModule } from "../../../../src/integrations/react/resource-hints.ts";
import { _resetResourceHints } from "../../../../src/integrations/react/resource-hints.ts";

let win: InstanceType<typeof Window>;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
  _resetResourceHints();
});

const el = (
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
) => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ─────────────────────────────────────────────

describe("preinitModule — Reference", () => {
  it("accepts a string href and options and returns nothing", () => {
    const result = preinitModule("https://example.com/module.js");
    expect(result).toBeUndefined();
  });

  it("accepts optional crossOrigin, integrity, and nonce options", () => {
    preinitModule("https://example.com/module.js", {
      crossOrigin: "anonymous",
      integrity: "sha384-abc",
      nonce: "random-nonce",
    });
    const script = win.document.head.querySelector(
      'script[type="module"]',
    ) as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.crossOrigin).toBe("anonymous");
    expect(script?.integrity).toBe("sha384-abc");
    expect(script?.nonce).toBe("random-nonce");
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("preinitModule — Usage", () => {
  it("adds a <script type=module> to document.head when called during rendering", () => {
    const App = cc(() => {
      preinitModule("https://example.com/module.js");
      return el("div", {}, "app");
    });
    mount(App, container);

    const script = win.document.head.querySelector(
      'script[type="module"]',
    ) as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.src).toBe("https://example.com/module.js");
  });

  it("adds a <script type=module> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preinitModule("https://example.com/wizard-module.js");
      };
      return el("button", { onClick }, "click me");
    });
    mount(App, container);

    expect(win.document.head.querySelector('script[type="module"]')).toBeNull();

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLElement | null;
    (button as any)?.click();

    const script = win.document.head.querySelector(
      'script[type="module"]',
    ) as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.src).toBe("https://example.com/wizard-module.js");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("preinitModule — Caveats", () => {
  it("deduplicates multiple calls with the same href and options", () => {
    preinitModule("https://example.com/module.js");
    preinitModule("https://example.com/module.js");
    preinitModule("https://example.com/module.js");

    const scripts = win.document.head.querySelectorAll('script[type="module"]');
    expect(scripts.length).toBe(1);
  });

  it("does not deduplicate calls with different options", () => {
    preinitModule("https://example.com/module.js");
    preinitModule("https://example.com/module.js", {
      crossOrigin: "anonymous",
    });

    const scripts = win.document.head.querySelectorAll('script[type="module"]');
    expect(scripts.length).toBe(2);
  });

  it("is a no-op on the server (no document global)", () => {
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    expect(() => preinitModule("https://example.com/module.js")).not.toThrow();

    (globalThis as any).document = savedDoc;
  });

  it("allows preiniting different modules independently", () => {
    preinitModule("https://example.com/a.js");
    preinitModule("https://example.com/b.js");

    const scripts = win.document.head.querySelectorAll('script[type="module"]');
    expect(scripts.length).toBe(2);
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("preinitModule — Edge cases", () => {
  it("sets crossOrigin, integrity, and nonce attributes", () => {
    preinitModule("https://example.com/module.js", {
      crossOrigin: "anonymous",
      integrity: "sha384-abc",
      nonce: "random-nonce",
    });

    const script = win.document.head.querySelector(
      'script[type="module"]',
    ) as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.crossOrigin).toBe("anonymous");
    expect(script?.integrity).toBe("sha384-abc");
    expect(script?.nonce).toBe("random-nonce");
  });

  it("resets dedup cache between test runs", () => {
    preinitModule("https://example.com/module.js");
    _resetResourceHints();
    preinitModule("https://example.com/module.js");

    const scripts = win.document.head.querySelectorAll('script[type="module"]');
    expect(scripts.length).toBe(2);
  });
});
