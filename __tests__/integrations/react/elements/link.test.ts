/**
 * Comprehensive tests for `<Link>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Link,
  _resetLinkRegistry,
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
  _resetLinkRegistry();
  // Clean up any link elements left in head from previous tests
  const headLinks = win.document.head.querySelectorAll("link");
  for (const l of Array.from(headLinks)) {
    l.parentNode?.removeChild(l);
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

describe("Link — Reference", () => {
  it("renders a native <link> element", () => {
    const App = cc(() => Link({ rel: "icon", href: "/favicon.ico" }));
    mount(App, container);
    const link = win.document.head.querySelector(
      'link[rel="icon"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.tagName.toLowerCase()).toBe("link");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Link({ rel: "icon", href: "/favicon.ico", id: "my-icon" }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      'link[id="my-icon"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("id")).toBe("my-icon");
  });

  it("returns a valid SinwanElement when called outside a component", () => {
    const result = Link({ rel: "icon", href: "/favicon.ico" });
    expect(result.tag).toBe("link");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Link — Props", () => {
  it("sets rel and href attributes", () => {
    const App = cc(() =>
      Link({ rel: "canonical", href: "https://example.com/page" }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      'link[rel="canonical"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("https://example.com/page");
  });

  it("sets crossOrigin attribute", () => {
    const App = cc(() =>
      Link({
        rel: "preload",
        href: "/font.woff2",
        as: "font",
        crossOrigin: "anonymous",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("crossorigin")).toBe("anonymous");
  });

  it("sets integrity attribute", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/safe.css",
        precedence: "default",
        integrity: "sha384-abc",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("integrity")).toBe("sha384-abc");
  });

  it("sets type attribute", () => {
    const App = cc(() =>
      Link({
        rel: "preload",
        href: "/style.css",
        as: "style",
        type: "text/css",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("type")).toBe("text/css");
  });

  it("sets sizes attribute for icon links", () => {
    const App = cc(() =>
      Link({ rel: "icon", href: "/icon.png", sizes: "32x32" }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("sizes")).toBe("32x32");
  });

  it("sets as attribute for preload links", () => {
    const App = cc(() =>
      Link({ rel: "preload", href: "/image.png", as: "image" }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("as")).toBe("image");
  });

  it("sets imageSrcSet and imageSizes for image preloads", () => {
    const App = cc(() =>
      Link({
        rel: "preload",
        href: "/img.jpg",
        as: "image",
        imageSrcSet: "/img-1x.jpg 1x, /img-2x.jpg 2x",
        imageSizes: "100vw",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("imagesrcset")).toBe(
      "/img-1x.jpg 1x, /img-2x.jpg 2x",
    );
    expect(link.getAttribute("imagesizes")).toBe("100vw");
  });

  it("sets media attribute for stylesheets", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/print.css",
        precedence: "default",
        media: "print",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("media")).toBe("print");
  });

  it("sets title attribute for alternative stylesheets", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/alt.css",
        precedence: "default",
        title: "High contrast",
      }),
    );
    mount(App, container);
    const link = win.document.head.querySelector(
      "link",
    ) as unknown as HTMLLinkElement;
    expect(link.getAttribute("title")).toBe("High contrast");
  });
});

// ─── Special rendering behavior ──────────────────────────────────────────

describe("Link — Special rendering behavior", () => {
  it("places the link element in document.head when rendered in body", () => {
    const App = cc(() => Link({ rel: "icon", href: "/favicon.ico" }));
    mount(App, container);

    expect(container.querySelector("link")).toBeFalsy();
    const link = win.document.head.querySelector(
      'link[rel="icon"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/favicon.ico");
  });

  it("places multiple link elements in document.head", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "icon", href: "/favicon.ico" }),
        Link({ rel: "canonical", href: "https://example.com" }),
        Link({ rel: "pingback", href: "https://example.com/xmlrpc.php" }),
      ),
    );
    mount(App, container);

    expect(container.querySelectorAll("link").length).toBe(0);
    expect(win.document.head.querySelectorAll("link").length).toBe(3);
  });

  it("does not move to head when itemProp is present", () => {
    const App = cc(() =>
      el(
        "section",
        { itemScope: true },
        Link({ itemProp: "author", href: "https://example.com/" }),
      ),
    );
    mount(App, container);

    const linkInContainer = container.querySelector("link");
    expect(linkInContainer).toBeTruthy();
    expect(linkInContainer!.getAttribute("itemprop")).toBe("author");

    const linkInHead = win.document.head.querySelector(
      'link[itemprop="author"]',
    );
    expect(linkInHead).toBeFalsy();
  });

  it("does not move to head when onLoad is present", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/style.css",
        precedence: "default",
        onLoad: () => {},
      }),
    );
    mount(App, container);

    expect(container.querySelector('link[href="/style.css"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/style.css"]'),
    ).toBeFalsy();
  });

  it("does not move to head when onError is present", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/style.css",
        precedence: "default",
        onError: () => {},
      }),
    );
    mount(App, container);

    expect(container.querySelector('link[href="/style.css"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/style.css"]'),
    ).toBeFalsy();
  });

  it("does not move stylesheet to head when disabled is present", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/style.css",
        precedence: "default",
        disabled: true,
      }),
    );
    mount(App, container);

    expect(container.querySelector('link[href="/style.css"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/style.css"]'),
    ).toBeFalsy();
  });

  it("does not move stylesheet to head when precedence is omitted", () => {
    const App = cc(() => Link({ rel: "stylesheet", href: "/style.css" }));
    mount(App, container);

    expect(container.querySelector('link[href="/style.css"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/style.css"]'),
    ).toBeFalsy();
  });

  it("removes normal link from head on unmount", () => {
    const App = cc(() => Link({ rel: "icon", href: "/favicon.ico" }));
    const app = mount(App, container);

    expect(win.document.head.querySelector('link[rel="icon"]')).toBeTruthy();

    app.unmount();

    expect(win.document.head.querySelector('link[rel="icon"]')).toBeFalsy();
  });

  it("removes multiple normal links from head on unmount", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "icon", href: "/favicon.ico" }),
        Link({ rel: "canonical", href: "https://example.com" }),
      ),
    );
    const app = mount(App, container);
    expect(win.document.head.querySelectorAll("link").length).toBe(2);

    app.unmount();
    expect(win.document.head.querySelectorAll("link").length).toBe(0);
  });
});

// ─── Special behavior for stylesheets ────────────────────────────────────

describe("Link — Special behavior for stylesheets", () => {
  it("moves stylesheet with precedence to document.head", () => {
    const App = cc(() =>
      Link({
        rel: "stylesheet",
        href: "/sitemap.css",
        precedence: "medium",
      }),
    );
    mount(App, container);

    expect(container.querySelector("link")).toBeFalsy();
    const link = win.document.head.querySelector(
      'link[rel="stylesheet"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/sitemap.css");
  });

  it("de-duplicates stylesheets with the same href", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "stylesheet", href: "/styles.css", precedence: "medium" }),
        Link({ rel: "stylesheet", href: "/styles.css", precedence: "medium" }),
      ),
    );
    mount(App, container);

    const links = win.document.head.querySelectorAll(
      'link[href="/styles.css"]',
    );
    expect(links.length).toBe(1);
  });

  it("de-duplicates across different components", () => {
    const A = cc(() =>
      Link({ rel: "stylesheet", href: "/shared.css", precedence: "medium" }),
    );
    const B = cc(() =>
      Link({ rel: "stylesheet", href: "/shared.css", precedence: "medium" }),
    );

    mount(A, container);
    mount(B, container);

    const links = win.document.head.querySelectorAll(
      'link[href="/shared.css"]',
    );
    expect(links.length).toBe(1);
  });

  it("leaves stylesheet in head on unmount", () => {
    const App = cc(() =>
      Link({ rel: "stylesheet", href: "/stay.css", precedence: "medium" }),
    );
    const app = mount(App, container);

    expect(
      win.document.head.querySelector('link[href="/stay.css"]'),
    ).toBeTruthy();

    app.unmount();

    expect(
      win.document.head.querySelector('link[href="/stay.css"]'),
    ).toBeTruthy();
  });

  it("orders stylesheets by precedence (lower first, higher later)", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "stylesheet", href: "/first.css", precedence: "first" }),
        Link({ rel: "stylesheet", href: "/second.css", precedence: "second" }),
        Link({ rel: "stylesheet", href: "/third.css", precedence: "first" }),
      ),
    );
    mount(App, container);

    const links = Array.from(
      win.document.head.querySelectorAll('link[rel="stylesheet"]'),
    );
    expect(links.length).toBe(3);
    expect(links[0].getAttribute("href")).toBe("/first.css");
    expect(links[1].getAttribute("href")).toBe("/third.css");
    expect(links[2].getAttribute("href")).toBe("/second.css");
  });

  it("places higher precedence after lower precedence discovered earlier", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "stylesheet", href: "/medium.css", precedence: "medium" }),
        Link({ rel: "stylesheet", href: "/high.css", precedence: "high" }),
        Link({ rel: "stylesheet", href: "/low.css", precedence: "low" }),
      ),
    );
    mount(App, container);

    const links = Array.from(
      win.document.head.querySelectorAll('link[rel="stylesheet"]'),
    );
    expect(links.length).toBe(3);
    expect(links[0].getAttribute("href")).toBe("/medium.css");
    expect(links[1].getAttribute("href")).toBe("/high.css");
    expect(links[2].getAttribute("href")).toBe("/low.css");
  });

  it("does not treat stylesheet without precedence specially (renders inline)", () => {
    const App = cc(() => Link({ rel: "stylesheet", href: "/nostyle.css" }));
    mount(App, container);

    expect(container.querySelector('link[href="/nostyle.css"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/nostyle.css"]'),
    ).toBeFalsy();
  });

  it("does not treat stylesheet with empty href specially (renders inline)", () => {
    const App = cc(() =>
      Link({ rel: "stylesheet", href: "", precedence: "medium" }),
    );
    mount(App, container);

    expect(container.querySelector("link")).toBeTruthy();
    expect(win.document.head.querySelector("link")).toBeFalsy();
  });
});

// ─── Usage / Linking to related resources ────────────────────────────────

describe("Link — Usage / Linking to related resources", () => {
  it("renders icon and pingback links in head from nested component", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "icon", href: "/favicon.ico" }),
        Link({ rel: "pingback", href: "http://www.example.com/xmlrpc.php" }),
        el("h1", {}, "My Blog"),
        el("p", {}, "..."),
      ),
    );
    mount(App, container);

    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("link")).toBeFalsy();
    expect(win.document.head.querySelector('link[rel="icon"]')).toBeTruthy();
    expect(
      win.document.head.querySelector('link[rel="pingback"]'),
    ).toBeTruthy();
  });
});

// ─── Usage / Linking to a stylesheet ─────────────────────────────────────

describe("Link — Usage / Linking to a stylesheet", () => {
  it("renders stylesheet link in head with precedence", () => {
    const App = cc(() =>
      Link({ rel: "stylesheet", href: "/page.css", precedence: "default" }),
    );
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="stylesheet"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/page.css");
    expect(link.getAttribute("data-sinwan-precedence")).toBe("default");
  });
});

// ─── Usage / Annotating specific items within the document ───────────────

describe("Link — Usage / Annotating specific items within the document", () => {
  it("renders itemProp link inline without moving to head", () => {
    const App = cc(() =>
      el(
        "section",
        { itemScope: true },
        el("h3", {}, "Annotating specific items"),
        Link({ itemProp: "author", href: "http://example.com/" }),
        el("p", {}, "..."),
      ),
    );
    mount(App, container);

    const section = container.querySelector("section")!;
    const link = section.querySelector("link");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("itemprop")).toBe("author");
    expect(
      win.document.head.querySelector('link[itemprop="author"]'),
    ).toBeFalsy();
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Link — Caveats", () => {
  it("does not leave orphaned link tags in the original container", () => {
    const App = cc(() => Link({ rel: "icon", href: "/favicon.ico" }));
    mount(App, container);
    expect(container.querySelector("link")).toBeFalsy();
  });

  it("calls the user ref with the element after moving to head", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Link({
        rel: "icon",
        href: "/favicon.ico",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("link");
    expect(refEl!.parentNode as any).toBe(win.document.head);
  });

  it("calls the user ref with null on unmount for normal links", () => {
    let refEl: Element | null = "initial" as any;
    const App = cc(() =>
      Link({
        rel: "icon",
        href: "/favicon.ico",
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

  it("ignores prop changes after first render (component runs once)", () => {
    const App = cc(() => Link({ rel: "icon", href: "/static.ico" }));
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[href="/static.ico"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/static.ico");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Link — Edge cases", () => {
  it("handles rapid mount/unmount cycles for normal links", () => {
    const App = cc(() => Link({ rel: "icon", href: "/cycle.ico" }));
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);
    app2.unmount();
    const app3 = mount(App, container);

    expect(
      win.document.head.querySelectorAll('link[href="/cycle.ico"]').length,
    ).toBe(1);
    app3.unmount();
    expect(
      win.document.head.querySelector('link[href="/cycle.ico"]'),
    ).toBeFalsy();
  });

  it("handles rapid mount/unmount cycles for stylesheets (leaves in DOM)", () => {
    const App = cc(() =>
      Link({ rel: "stylesheet", href: "/cycle.css", precedence: "medium" }),
    );
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);

    expect(
      win.document.head.querySelectorAll('link[href="/cycle.css"]').length,
    ).toBe(1);
    app2.unmount();
    expect(
      win.document.head.querySelector('link[href="/cycle.css"]'),
    ).toBeTruthy();
  });

  it("handles link with no identifying props", () => {
    const App = cc(() => Link({}));
    expect(() => mount(App, container)).not.toThrow();
    expect(win.document.head.querySelector("link")).toBeTruthy();
  });

  it("handles link rendered at the root level", () => {
    const App = cc(() => Link({ rel: "icon", href: "/root.ico" }));
    mount(App, container);
    expect(
      win.document.head.querySelector('link[href="/root.ico"]'),
    ).toBeTruthy();
    expect(container.querySelector("link")).toBeFalsy();
  });

  it("does not interfere with other head elements", () => {
    const existingMeta = win.document.createElement("meta");
    existingMeta.setAttribute("name", "viewport");
    win.document.head.appendChild(existingMeta);

    const App = cc(() => Link({ rel: "icon", href: "/new.ico" }));
    mount(App, container);

    expect(win.document.head.querySelector("meta")).toBeTruthy();
    expect(
      win.document.head.querySelector('link[href="/new.ico"]'),
    ).toBeTruthy();
  });

  it("does not throw if document.head is missing (defensive)", () => {
    const App = cc(() => Link({ rel: "icon", href: "/safe.ico" }));
    expect(() => mount(App, container)).not.toThrow();
  });

  it("renders preload links in head", () => {
    const App = cc(() =>
      Link({ rel: "preload", href: "/font.woff2", as: "font" }),
    );
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/font.woff2");
  });

  it("renders modulepreload links in head", () => {
    const App = cc(() => Link({ rel: "modulepreload", href: "/module.js" }));
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="modulepreload"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/module.js");
  });

  it("renders apple-touch-icon links in head", () => {
    const App = cc(() =>
      Link({
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      }),
    );
    mount(App, container);

    const link = win.document.head.querySelector(
      'link[rel="apple-touch-icon"]',
    ) as unknown as HTMLLinkElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("sizes")).toBe("180x180");
  });

  it("does not deduplicate non-stylesheet links with same href", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Link({ rel: "preload", href: "/dup.woff2", as: "font" }),
        Link({ rel: "preload", href: "/dup.woff2", as: "font" }),
      ),
    );
    mount(App, container);

    const links = win.document.head.querySelectorAll('link[href="/dup.woff2"]');
    expect(links.length).toBe(2);
  });

  it("handles stylesheet with null href by rendering inline", () => {
    const App = cc(() =>
      Link({ rel: "stylesheet", href: null as any, precedence: "medium" }),
    );
    mount(App, container);

    expect(container.querySelector("link")).toBeTruthy();
    expect(win.document.head.querySelector("link")).toBeFalsy();
  });
});
