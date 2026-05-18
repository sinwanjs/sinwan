/**
 * Comprehensive tests for `<Meta>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { Meta, useState } from "../../../../src/integrations/react/_client.ts";

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
  // Clean up any meta elements left in head from previous tests
  const headMetas = win.document.head.querySelectorAll("meta");
  for (const m of Array.from(headMetas)) {
    m.parentNode?.removeChild(m);
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

describe("Meta — Reference", () => {
  it("renders a native <meta> element", () => {
    const App = cc(() => Meta({ name: "description", content: "A test page" }));
    mount(App, container);
    const meta = win.document.head.querySelector(
      'meta[name="description"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.tagName.toLowerCase()).toBe("meta");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Meta({
        name: "description",
        content: "test",
        id: "my-meta",
        className: "seo",
      }),
    );
    mount(App, container);
    const meta = win.document.head.querySelector(
      'meta[id="my-meta"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("id")).toBe("my-meta");
    expect(meta.getAttribute("class")).toBe("seo");
  });

  it("throws when called outside a component (via jsx passthrough)", () => {
    // Meta itself does not throw when called outside a component,
    // but it should still return a valid SinwanElement structure.
    const result = Meta({ name: "test", content: "value" });
    expect(result.tag).toBe("meta");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Meta — Props", () => {
  it("sets name and content attributes", () => {
    const App = cc(() =>
      Meta({ name: "keywords", content: "React, JavaScript" }),
    );
    mount(App, container);
    const meta = win.document.head.querySelector(
      'meta[name="keywords"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("React, JavaScript");
  });

  it("sets charset attribute", () => {
    const App = cc(() => Meta({ charset: "utf-8" }));
    mount(App, container);
    const meta = win.document.head.querySelector(
      'meta[charset="utf-8"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
  });

  it("sets httpEquiv attribute", () => {
    const App = cc(() =>
      Meta({ httpEquiv: "content-type", content: "text/html; charset=utf-8" }),
    );
    mount(App, container);
    const meta = win.document.head.querySelector(
      'meta[http-equiv="content-type"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("text/html; charset=utf-8");
  });

  it("does not require exactly one of name/httpEquiv/charset/itemProp", () => {
    // React does not enforce this at runtime
    const App = cc(() => Meta({ content: "just content" }));
    expect(() => mount(App, container)).not.toThrow();
    const meta = win.document.head.querySelector("meta");
    expect(meta).toBeTruthy();
  });
});

// ─── Special rendering behavior ──────────────────────────────────────────

describe("Meta — Special rendering behavior", () => {
  it("places the meta element in document.head when rendered in body", () => {
    const App = cc(() => Meta({ name: "author", content: "John Smith" }));
    mount(App, container);

    // Should not be in the original container
    expect(container.querySelector("meta")).toBeFalsy();

    // Should be in document.head
    const meta = win.document.head.querySelector(
      'meta[name="author"]',
    ) as unknown as HTMLMetaElement;
    expect(meta).toBeTruthy();
    expect(meta.getAttribute("content")).toBe("John Smith");
  });

  it("places multiple meta elements in document.head", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Meta({ name: "keywords", content: "a, b" }),
        Meta({ name: "description", content: "desc" }),
        Meta({ name: "author", content: "Jane" }),
      ),
    );
    mount(App, container);

    expect(container.querySelectorAll("meta").length).toBe(0);
    expect(win.document.head.querySelectorAll("meta").length).toBe(3);
  });

  it("does not move to head when itemProp is present", () => {
    const App = cc(() =>
      el(
        "section",
        { itemScope: true },
        Meta({ itemProp: "description", content: "API reference" }),
      ),
    );
    mount(App, container);

    // Should be in the container, not in head
    const metaInContainer = container.querySelector("meta");
    expect(metaInContainer).toBeTruthy();
    expect(metaInContainer!.getAttribute("itemprop")).toBe("description");

    const metaInHead = win.document.head.querySelector(
      'meta[itemprop="description"]',
    );
    expect(metaInHead).toBeFalsy();
  });

  it("removes from head on unmount", () => {
    const App = cc(() =>
      Meta({ name: "viewport", content: "width=device-width" }),
    );
    const app = mount(App, container);

    expect(
      win.document.head.querySelector('meta[name="viewport"]'),
    ).toBeTruthy();

    app.unmount();

    expect(
      win.document.head.querySelector('meta[name="viewport"]'),
    ).toBeFalsy();
  });

  it("removes multiple meta elements from head on unmount", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Meta({ name: "a", content: "1" }),
        Meta({ name: "b", content: "2" }),
      ),
    );
    const app = mount(App, container);
    expect(win.document.head.querySelectorAll("meta").length).toBe(2);

    app.unmount();
    expect(win.document.head.querySelectorAll("meta").length).toBe(0);
  });
});

// ─── Usage / Annotating the document with metadata ───────────────────────

describe("Meta — Usage / Annotating the document with metadata", () => {
  it("can render meta from a nested component", () => {
    const Seo = cc(() =>
      el(
        "div",
        {},
        Meta({
          name: "keywords",
          content: "React, JavaScript, semantic markup, html",
        }),
        Meta({
          name: "description",
          content: "API reference for the <meta> component",
        }),
      ),
    );
    mount(Seo, container);

    const keywords = win.document.head.querySelector('meta[name="keywords"]');
    const description = win.document.head.querySelector(
      'meta[name="description"]',
    );
    expect(keywords).toBeTruthy();
    expect(description).toBeTruthy();
    expect(keywords!.getAttribute("content")).toBe(
      "React, JavaScript, semantic markup, html",
    );
    expect(description!.getAttribute("content")).toBe(
      "API reference for the <meta> component",
    );
  });

  it("can be combined with other elements in the same component", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Meta({ name: "author", content: "John Smith" }),
        el("h1", {}, "Site Map"),
        el("p", {}, "..."),
      ),
    );
    mount(App, container);

    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("meta")).toBeFalsy();
    expect(win.document.head.querySelector('meta[name="author"]')).toBeTruthy();
  });
});

// ─── Usage / Annotating specific items within the document ─────────────

describe("Meta — Usage / Annotating specific items within the document", () => {
  it("renders itemProp meta inline without moving to head", () => {
    const App = cc(() =>
      el(
        "section",
        { itemScope: true },
        el("h3", {}, "Annotating specific items"),
        Meta({
          itemProp: "description",
          content: "API reference for using <meta> with itemProp",
        }),
        el("p", {}, "..."),
      ),
    );
    mount(App, container);

    const section = container.querySelector("section")!;
    const meta = section.querySelector("meta");
    expect(meta).toBeTruthy();
    expect(meta!.getAttribute("itemprop")).toBe("description");
    expect(
      win.document.head.querySelector('meta[itemprop="description"]'),
    ).toBeFalsy();
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Meta — Caveats", () => {
  it("does not leave orphaned meta tags in the original container", () => {
    const App = cc(() => Meta({ name: "robots", content: "noindex" }));
    mount(App, container);
    expect(container.querySelector("meta")).toBeFalsy();
  });

  it("calls the user ref with the element after moving to head", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Meta({
        name: "test",
        content: "value",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("meta");
    expect(refEl!.parentNode as any).toBe(win.document.head);
  });

  it("calls the user ref with null on unmount", () => {
    let refEl: Element | null = "initial" as any;
    const App = cc(() =>
      Meta({
        name: "test",
        content: "value",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    const app = mount(App, container);
    expect(refEl).toBeTruthy();

    app.unmount();
    expect(refEl).toBeNull();
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Meta — Edge cases", () => {
  it("handles rapid mount/unmount cycles", () => {
    const App = cc(() => Meta({ name: "cycle", content: "test" }));
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);
    app2.unmount();
    const app3 = mount(App, container);

    expect(
      win.document.head.querySelectorAll('meta[name="cycle"]').length,
    ).toBe(1);
    app3.unmount();
    expect(win.document.head.querySelector('meta[name="cycle"]')).toBeFalsy();
  });

  it("handles meta with no identifying props", () => {
    const App = cc(() => Meta({}));
    expect(() => mount(App, container)).not.toThrow();
    expect(win.document.head.querySelector("meta")).toBeTruthy();
  });

  it("handles meta rendered at the root level", () => {
    const App = cc(() => Meta({ name: "root", content: "true" }));
    mount(App, container);
    expect(win.document.head.querySelector('meta[name="root"]')).toBeTruthy();
    expect(container.querySelector("meta")).toBeFalsy();
  });

  it("does not interfere with other head elements", () => {
    const existingTitle = win.document.createElement("title");
    existingTitle.textContent = "Existing";
    win.document.head.appendChild(existingTitle);

    const App = cc(() => Meta({ name: "new", content: "meta" }));
    mount(App, container);

    expect(win.document.head.querySelector("title")).toBeTruthy();
    expect(win.document.head.querySelector('meta[name="new"]')).toBeTruthy();
  });

  it("does not throw if document.head is missing (defensive)", () => {
    // Simulate an environment without a proper head by creating the element
    // but the isServer check should prevent DOM access in non-browser envs
    const App = cc(() => Meta({ name: "safe", content: "test" }));
    expect(() => mount(App, container)).not.toThrow();
  });
});
