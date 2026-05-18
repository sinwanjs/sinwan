/**
 * prefetchDNS — React-compatible resource hint.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { prefetchDNS } from "../../../../src/integrations/react/resource-hints.ts";
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

describe("prefetchDNS — Reference", () => {
  it("accepts a string href and returns nothing", () => {
    const result = prefetchDNS("https://example.com");
    expect(result).toBeUndefined();
  });
});

// ─── Usage ─────────────────────────────────────────────────

describe("prefetchDNS — Usage", () => {
  it("adds a <link rel=dns-prefetch> to document.head when called during rendering", () => {
    const App = cc(() => {
      prefetchDNS("https://fonts.googleapis.com");
      return el("div", {}, "app");
    });
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="dns-prefetch"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://fonts.googleapis.com/");
  });

  it("adds a <link rel=dns-prefetch> when called in an event handler", () => {
    const App = cc(() => {
      const onClick = () => {
        prefetchDNS("https://api.example.com");
      };
      return el("button", { onClick }, "click me");
    });
    mount(App, container);

    // Before click: no link yet
    expect(
      win.document.head.querySelector('link[rel="dns-prefetch"]'),
    ).toBeNull();

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLElement | null;
    (button as any)?.click();

    const link = win.document.head.querySelector(
      'link[rel="dns-prefetch"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
    expect(link?.href).toBe("https://api.example.com/");
  });
});

// ─── Caveats ───────────────────────────────────────────────

describe("prefetchDNS — Caveats", () => {
  it("deduplicates multiple calls with the same href", () => {
    prefetchDNS("https://example.com");
    prefetchDNS("https://example.com");
    prefetchDNS("https://example.com");

    const links = win.document.head.querySelectorAll(
      'link[rel="dns-prefetch"]',
    );
    expect(links.length).toBe(1);
  });

  it("is a no-op on the server (no document global)", () => {
    // Remove document to simulate SSR
    const savedDoc = (globalThis as any).document;
    delete (globalThis as any).document;

    // Should not throw
    expect(() => prefetchDNS("https://example.com")).not.toThrow();

    (globalThis as any).document = savedDoc;
  });

  it("allows prefetching DNS for different hosts independently", () => {
    prefetchDNS("https://cdn.a.com");
    prefetchDNS("https://cdn.b.com");

    const links = win.document.head.querySelectorAll(
      'link[rel="dns-prefetch"]',
    );
    expect(links.length).toBe(2);
  });
});

// ─── Edge cases ────────────────────────────────────────────

describe("prefetchDNS — Edge cases", () => {
  it("prefetches DNS even for the same origin as the page (no special blocking)", () => {
    // React docs note there's no *benefit*, but the call itself is allowed
    prefetchDNS("http://localhost");
    const link = win.document.head.querySelector(
      'link[rel="dns-prefetch"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link).toBeTruthy();
  });

  it("handles hrefs with paths gracefully", () => {
    prefetchDNS("https://example.com/assets");
    const link = win.document.head.querySelector(
      'link[rel="dns-prefetch"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link?.href).toBe("https://example.com/assets");
  });

  it("resets dedup cache between test runs", () => {
    prefetchDNS("https://example.com");
    _resetResourceHints();
    prefetchDNS("https://example.com");

    const links = win.document.head.querySelectorAll(
      'link[rel="dns-prefetch"]',
    );
    expect(links.length).toBe(2);
  });
});
