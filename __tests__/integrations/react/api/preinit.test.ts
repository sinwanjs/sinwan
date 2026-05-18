/**
 * preinit — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { preinit } from "../../../../src/integrations/react/resource-hints.ts";
import { _resetResourceHints } from "../../../../src/integrations/react/resource-hints.ts";

let win: InstanceType<typeof Window>;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(container as unknown as Node);
  _resetResourceHints();
});

const el = (tag: string, props: Record<string, unknown> = {}, ...children: unknown[]) => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ─────────────────────────────────────────────

describe("preinit — Reference", () => {
  it("accepts a string href and options and returns nothing", () => {
    const result = preinit("https://example.com/script.js", { as: "script" });
    expect(result).toBeUndefined();
  });

  it("accepts options with as: 'style' and precedence", () => {
    const result = preinit("https://example.com/style.css", { as: "style", precedence: "medium" });
    expect(result).toBeUndefined();
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("preinit — Usage", () => {
  it("adds a <script> to document.head when called during rendering (as: script)", () => {
    const App = cc(() => {
      preinit("https://example.com/script.js", { as: "script" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const script = win.document.head.querySelector('script[src="https://example.com/script.js"]') as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.async).toBe(true);
  });

  it("adds a <link rel=stylesheet> to document.head when called during rendering (as: style)", () => {
    const App = cc(() => {
      preinit("https://example.com/style.css", { as: "style", precedence: "medium" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector('link[rel="stylesheet"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://example.com/style.css");
    expect(link?.getAttribute("data-precedence")).toBe("medium");
  });

  it("adds a <script> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preinit("https://example.com/wizard.js", { as: "script" });
      };
      return el("button", { onClick }, "click me");
    });
    mount(App, container);

    expect(win.document.head.querySelector('script[src="https://example.com/wizard.js"]')).toBeNull();

    const button = container.querySelector("button") as unknown as HTMLElement | null;
    (button as any)?.click();

    const script = win.document.head.querySelector('script[src="https://example.com/wizard.js"]') as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
  });

  it("adds a <link rel=stylesheet> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preinit("https://example.com/wizard.css", { as: "style", precedence: "low" });
      };
      return el("button", { onClick }, "click me");
    });
    mount(App, container);

    expect(win.document.head.querySelector('link[rel="stylesheet"]')).toBeNull();

    const button = container.querySelector("button") as unknown as HTMLElement | null;
    (button as any)?.click();

    const link = win.document.head.querySelector('link[rel="stylesheet"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("data-precedence")).toBe("low");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("preinit — Caveats", () => {
  it("deduplicates multiple calls with the same href and options", () => {
    preinit("https://example.com/script.js", { as: "script" });
    preinit("https://example.com/script.js", { as: "script" });
    preinit("https://example.com/script.js", { as: "script" });

    const scripts = win.document.head.querySelectorAll('script[src="https://example.com/script.js"]');
    expect(scripts.length).toBe(1);
  });

  it("does not deduplicate calls with different options", () => {
    preinit("https://example.com/script.js", { as: "script" });
    preinit("https://example.com/script.js", { as: "script", crossOrigin: "anonymous" });

    const scripts = win.document.head.querySelectorAll('script');
    expect(scripts.length).toBe(2);
  });

  it("is a no-op on the server (no document global)", () => {
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    expect(() => preinit("https://example.com/script.js", { as: "script" })).not.toThrow();

    (globalThis as any).document = savedDoc;
  });

  it("allows preiniting different resources independently", () => {
    preinit("https://example.com/a.js", { as: "script" });
    preinit("https://example.com/b.css", { as: "style", precedence: "high" });

    const scripts = win.document.head.querySelectorAll('script');
    const links = win.document.head.querySelectorAll('link[rel="stylesheet"]');
    expect(scripts.length).toBe(1);
    expect(links.length).toBe(1);
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("preinit — Edge cases", () => {
  it("sets crossOrigin, integrity, nonce, and fetchPriority on scripts", () => {
    preinit("https://example.com/script.js", {
      as: "script",
      crossOrigin: "anonymous",
      integrity: "sha384-abc",
      nonce: "random-nonce",
      fetchPriority: "high",
    });

    const script = win.document.head.querySelector('script') as unknown as HTMLScriptElement | null;
    expect(script).toBeTruthy();
    expect(script?.crossOrigin).toBe("anonymous");
    expect(script?.integrity).toBe("sha384-abc");
    expect(script?.nonce).toBe("random-nonce");
    expect(script?.getAttribute("fetchpriority")).toBe("high");
  });

  it("sets crossOrigin and integrity on stylesheets", () => {
    preinit("https://example.com/style.css", {
      as: "style",
      precedence: "medium",
      crossOrigin: "anonymous",
      integrity: "sha384-def",
    });

    const link = win.document.head.querySelector('link[rel="stylesheet"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.crossOrigin).toBe("anonymous");
    expect(link?.integrity).toBe("sha384-def");
  });

  it("resets dedup cache between test runs", () => {
    preinit("https://example.com/script.js", { as: "script" });
    _resetResourceHints();
    preinit("https://example.com/script.js", { as: "script" });

    const scripts = win.document.head.querySelectorAll('script[src="https://example.com/script.js"]');
    expect(scripts.length).toBe(2);
  });
});
