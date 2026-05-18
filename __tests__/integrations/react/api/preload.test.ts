/**
 * preload — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { preload } from "../../../../src/integrations/react/resource-hints.ts";
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

describe("preload — Reference", () => {
  it("accepts a string href and options and returns nothing", () => {
    const result = preload("https://example.com/font.woff2", { as: "font" });
    expect(result).toBeUndefined();
  });

  it("accepts all documented options", () => {
    preload("/banner.png", {
      as: "image",
      crossOrigin: "anonymous",
      referrerPolicy: "no-referrer",
      integrity: "sha384-abc",
      type: "image/png",
      nonce: "random-nonce",
      fetchPriority: "high",
      imageSrcSet: "/banner512.png 512w, /banner1024.png 1024w",
      imageSizes: "(max-width: 512px) 512px, 1024px",
    });

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("as")).toBe("image");
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
    expect(link?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(link?.getAttribute("integrity")).toBe("sha384-abc");
    expect(link?.getAttribute("type")).toBe("image/png");
    expect(link?.getAttribute("nonce")).toBe("random-nonce");
    expect(link?.getAttribute("fetchpriority")).toBe("high");
    expect(link?.getAttribute("imagesrcset")).toBe(
      "/banner512.png 512w, /banner1024.png 1024w",
    );
    expect(link?.getAttribute("imagesizes")).toBe(
      "(max-width: 512px) 512px, 1024px",
    );
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("preload — Usage", () => {
  it("adds a <link rel=preload> to document.head when called during rendering (script)", () => {
    const App = cc(() => {
      preload("https://example.com/script.js", { as: "script" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://example.com/script.js");
    expect(link?.getAttribute("as")).toBe("script");
  });

  it("adds a <link rel=preload> to document.head when called during rendering (style)", () => {
    const App = cc(() => {
      preload("https://example.com/style.css", { as: "style" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("as")).toBe("style");
  });

  it("adds a <link rel=preload> to document.head when called during rendering (font)", () => {
    const App = cc(() => {
      preload("https://example.com/font.woff2", { as: "font" });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("as")).toBe("font");
  });

  it("adds a <link rel=preload> with imageSrcSet and imageSizes for responsive images", () => {
    const App = cc(() => {
      preload("/banner.png", {
        as: "image",
        imageSrcSet: "/banner512.png 512w, /banner1024.png 1024w",
        imageSizes: "(max-width: 512px) 512px, 1024px",
      });
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("imagesrcset")).toBe(
      "/banner512.png 512w, /banner1024.png 1024w",
    );
    expect(link?.getAttribute("imagesizes")).toBe(
      "(max-width: 512px) 512px, 1024px",
    );
  });

  it("adds a <link rel=preload> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preload("https://example.com/wizardStyles.css", { as: "style" });
      };
      return el("button", { onClick }, "Start Wizard");
    });
    mount(App, container);

    expect(win.document.head.querySelector('link[rel="preload"]')).toBeNull();

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLElement | null;
    (button as any)?.click();

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("as")).toBe("style");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("preload — Caveats", () => {
  it("deduplicates multiple calls with the same href and options", () => {
    preload("https://example.com/font.woff2", { as: "font" });
    preload("https://example.com/font.woff2", { as: "font" });
    preload("https://example.com/font.woff2", { as: "font" });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(1);
  });

  it("does not deduplicate calls with different href", () => {
    preload("https://example.com/a.woff2", { as: "font" });
    preload("https://example.com/b.woff2", { as: "font" });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(2);
  });

  it("does not deduplicate calls with different options (non-image)", () => {
    preload("https://example.com/script.js", { as: "script" });
    preload("https://example.com/script.js", {
      as: "script",
      crossOrigin: "anonymous",
    });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(2);
  });

  it("for images, deduplicates based on href + imageSrcSet + imageSizes", () => {
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/a.png 1x",
      imageSizes: "100px",
    });
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/a.png 1x",
      imageSizes: "100px",
    });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(1);
  });

  it("for images, does not deduplicate when imageSrcSet differs", () => {
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/a.png 1x",
      imageSizes: "100px",
    });
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/b.png 2x",
      imageSizes: "100px",
    });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(2);
  });

  it("for images, does not deduplicate when imageSizes differs", () => {
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/a.png 1x",
      imageSizes: "100px",
    });
    preload("/banner.png", {
      as: "image",
      imageSrcSet: "/a.png 1x",
      imageSizes: "200px",
    });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(2);
  });

  it("is a no-op on the server (no document global)", () => {
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    expect(() =>
      preload("https://example.com/font.woff2", { as: "font" }),
    ).not.toThrow();

    (globalThis as any).document = savedDoc;
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("preload — Edge cases", () => {
  it("allows preloading different resource types independently", () => {
    preload("https://example.com/script.js", { as: "script" });
    preload("https://example.com/style.css", { as: "style" });
    preload("https://example.com/font.woff2", { as: "font" });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(3);
  });

  it("sets all supported attributes on the link element", () => {
    preload("https://example.com/font.woff2", {
      as: "font",
      crossOrigin: "anonymous",
      referrerPolicy: "origin",
      integrity: "sha384-abc",
      type: "font/woff2",
      nonce: "random-nonce",
      fetchPriority: "low",
    });

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
    expect(link?.getAttribute("referrerpolicy")).toBe("origin");
    expect(link?.getAttribute("integrity")).toBe("sha384-abc");
    expect(link?.getAttribute("type")).toBe("font/woff2");
    expect(link?.getAttribute("nonce")).toBe("random-nonce");
    expect(link?.getAttribute("fetchpriority")).toBe("low");
  });

  it("resets dedup cache between test runs", () => {
    preload("https://example.com/font.woff2", { as: "font" });
    _resetResourceHints();
    preload("https://example.com/font.woff2", { as: "font" });

    const links = win.document.head.querySelectorAll('link[rel="preload"]');
    expect(links.length).toBe(2);
  });
});
