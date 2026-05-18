/**
 * preconnect — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { preconnect } from "../../../../src/integrations/react/resource-hints.ts";
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

describe("preconnect — Reference", () => {
  it("accepts a string href and returns nothing", () => {
    const result = preconnect("https://cdn.example.com");
    expect(result).toBeUndefined();
  });

  it("accepts an optional crossOrigin option", () => {
    preconnect("https://cdn.example.com", { crossOrigin: "anonymous" });
    const link = win.document.head.querySelector('link[rel="preconnect"]') as unknown as HTMLLinkElement | null;
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("preconnect — Usage", () => {
  it("adds a <link rel=preconnect> to document.head when called during rendering", () => {
    const App = cc(() => {
      preconnect("https://fonts.googleapis.com");
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector('link[rel="preconnect"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://fonts.googleapis.com/");
  });

  it("adds a <link rel=preconnect> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        preconnect("https://api.example.com");
      };
      return el("button", { onClick }, "click me");
    });
    mount(App, container);

    // Before click: no link yet
    expect(win.document.head.querySelector('link[rel="preconnect"]')).toBeNull();

    const button = container.querySelector("button") as unknown as HTMLElement | null;
    (button as any)?.click();

    const link = win.document.head.querySelector('link[rel="preconnect"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://api.example.com/");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("preconnect — Caveats", () => {
  it("deduplicates multiple calls with the same href", () => {
    preconnect("https://cdn.example.com");
    preconnect("https://cdn.example.com");
    preconnect("https://cdn.example.com");

    const links = win.document.head.querySelectorAll('link[rel="preconnect"]');
    expect(links.length).toBe(1);
  });

  it("does not deduplicate calls with different crossOrigin values", () => {
    preconnect("https://cdn.example.com");
    preconnect("https://cdn.example.com", { crossOrigin: "anonymous" });
    preconnect("https://cdn.example.com", { crossOrigin: "use-credentials" });

    const links = win.document.head.querySelectorAll('link[rel="preconnect"]');
    expect(links.length).toBe(3);
  });

  it("is a no-op on the server (no document global)", () => {
    // Remove document to simulate SSR
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    // Should not throw
    expect(() => preconnect("https://cdn.example.com")).not.toThrow();

    (globalThis as any).document = savedDoc;
  });

  it("allows preconnecting to different hosts independently", () => {
    preconnect("https://cdn.a.com");
    preconnect("https://cdn.b.com");

    const links = win.document.head.querySelectorAll('link[rel="preconnect"]');
    expect(links.length).toBe(2);
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("preconnect — Edge cases", () => {
  it("preconnects even to the same origin as the page (no special blocking)", () => {
    // React docs note there's no *benefit*, but the call itself is allowed
    preconnect("http://localhost");
    const link = win.document.head.querySelector('link[rel="preconnect"]') as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
  });

  it("handles hrefs with paths gracefully", () => {
    preconnect("https://cdn.example.com/assets");
    const link = win.document.head.querySelector('link[rel="preconnect"]') as unknown as HTMLLinkElement | null;
    expect(link?.href).toBe("https://cdn.example.com/assets");
  });

  it("resets dedup cache between test runs", () => {
    preconnect("https://cdn.example.com");
    _resetResourceHints();
    preconnect("https://cdn.example.com");

    const links = win.document.head.querySelectorAll('link[rel="preconnect"]');
    expect(links.length).toBe(2);
  });
});
