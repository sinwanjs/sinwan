/**
 * preloadModule — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  preloadModule,
  _resetResourceHints,
} from "../../../../src/integrations/react/resource-hints.ts";

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

describe("preloadModule — Reference", () => {
  it("accepts a string href and options and returns nothing", () => {
    const result = preloadModule("https://example.com/module.js", {
      as: "script",
    });
    expect(result).toBeUndefined();
  });

  it("accepts optional crossOrigin, integrity, and nonce options", () => {
    preloadModule("https://example.com/module.js", {
      as: "script",
      crossOrigin: "anonymous",
      integrity: "sha384-abc",
      nonce: "random-nonce",
    });

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
    expect(link?.getAttribute("integrity")).toBe("sha384-abc");
    expect(link?.getAttribute("nonce")).toBe("random-nonce");
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("preloadModule — Usage", () => {
  it("adds a <link rel=modulepreload> to document.head when called during rendering", () => {
    const App = cc(() => {
      preloadModule("https://example.com/module.js", { as: "script" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://example.com/module.js");
  });

  it("adds a <link rel=modulepreload> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preloadModule("https://example.com/wizard-module.js", {
          as: "script",
        });
      };
      return el("button", { onClick }, "Start Wizard");
    });
    mount(App, container);

    expect(
      win.document.head.querySelector('link[rel="modulepreload"]'),
    ).toBeNull();

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLElement | null;
    (button as any)?.click();

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://example.com/wizard-module.js");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("preloadModule — Caveats", () => {
  it("deduplicates multiple calls with the same href and options", () => {
    preloadModule("https://example.com/module.js", { as: "script" });
    preloadModule("https://example.com/module.js", { as: "script" });
    preloadModule("https://example.com/module.js", { as: "script" });

    const links = win.document.head.querySelectorAll(
      'link[rel="modulepreload"]',
    );
    expect(links.length).toBe(1);
  });

  it("does not deduplicate calls with different options", () => {
    preloadModule("https://example.com/module.js", { as: "script" });
    preloadModule("https://example.com/module.js", {
      as: "script",
      crossOrigin: "anonymous",
    });

    const links = win.document.head.querySelectorAll(
      'link[rel="modulepreload"]',
    );
    expect(links.length).toBe(2);
  });

  it("is a no-op on the server (no document global)", () => {
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    expect(() =>
      preloadModule("https://example.com/module.js", { as: "script" }),
    ).not.toThrow();

    (globalThis as any).document = savedDoc;
  });

  it("allows preloading different modules independently", () => {
    preloadModule("https://example.com/a.js", { as: "script" });
    preloadModule("https://example.com/b.js", { as: "script" });

    const links = win.document.head.querySelectorAll(
      'link[rel="modulepreload"]',
    );
    expect(links.length).toBe(2);
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("preloadModule — Edge cases", () => {
  it("sets crossOrigin, integrity, and nonce attributes", () => {
    preloadModule("https://example.com/module.js", {
      as: "script",
      crossOrigin: "anonymous",
      integrity: "sha384-abc",
      nonce: "random-nonce",
    });

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
    expect(link?.getAttribute("integrity")).toBe("sha384-abc");
    expect(link?.getAttribute("nonce")).toBe("random-nonce");
  });

  it("works when called without options", () => {
    preloadModule("https://example.com/module.js");

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://example.com/module.js");
  });

  it("resets dedup cache between test runs", () => {
    preloadModule("https://example.com/module.js", { as: "script" });
    _resetResourceHints();
    preloadModule("https://example.com/module.js", { as: "script" });

    const links = win.document.head.querySelectorAll(
      'link[rel="modulepreload"]',
    );
    expect(links.length).toBe(2);
  });
});
