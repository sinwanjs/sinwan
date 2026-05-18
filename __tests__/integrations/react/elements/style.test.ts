/**
 * Comprehensive tests for `<Style>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Style,
  _resetStyleRegistry,
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
  _resetStyleRegistry();
  // Clean up any style elements left in head from previous tests
  const headStyles = win.document.head.querySelectorAll("style");
  for (const s of Array.from(headStyles)) {
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

describe("Style — Reference", () => {
  it("renders a native <style> element", () => {
    const App = cc(() => Style({ children: "p { color: red; }" }));
    mount(App, container);
    const style = container.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.tagName.toLowerCase()).toBe("style");
  });

  it("accepts common element props when rendering inline", () => {
    const App = cc(() =>
      Style({ children: "p { color: red; }", id: "my-style" }),
    );
    mount(App, container);
    const style = container.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("id")).toBe("my-style");
  });

  it("returns a valid SinwanElement when called outside a component", () => {
    const result = Style({ children: "p { color: red; }" });
    expect(result.tag).toBe("style");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Style — Props", () => {
  it("sets children as text content", () => {
    const App = cc(() => Style({ children: "body { margin: 0; }" }));
    mount(App, container);
    const style = container.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toBe("body { margin: 0; }");
  });

  it("sets media attribute", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/print.css",
        precedence: "default",
        media: "print",
      }),
    );
    mount(App, container);
    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("media")).toBe("print");
  });

  it("sets nonce attribute", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/nonce.css",
        precedence: "default",
        nonce: "abc123",
      }),
    );
    mount(App, container);
    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("nonce")).toBe("abc123");
  });

  it("sets title attribute", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/alt.css",
        precedence: "default",
        title: "High contrast",
      }),
    );
    mount(App, container);
    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("title")).toBe("High contrast");
  });
});

// ─── Special rendering behavior ──────────────────────────────────────────

describe("Style — Special rendering behavior", () => {
  it("places style in document.head when href and precedence are provided", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/styles.css",
        precedence: "medium",
      }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeFalsy();
    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toBe("p { color: red; }");
  });

  it("does not move to head when precedence is omitted", () => {
    const App = cc(() =>
      Style({ children: "p { color: red; }", href: "/styles.css" }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeTruthy();
    expect(win.document.head.querySelector("style")).toBeFalsy();
  });

  it("does not move to head when href is omitted", () => {
    const App = cc(() =>
      Style({ children: "p { color: red; }", precedence: "medium" }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeTruthy();
    expect(win.document.head.querySelector("style")).toBeFalsy();
  });

  it("does not move to head when href is empty", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "",
        precedence: "medium",
      }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeTruthy();
    expect(win.document.head.querySelector("style")).toBeFalsy();
  });

  it("does not move to head when precedence is empty", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/styles.css",
        precedence: "",
      }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeTruthy();
    expect(win.document.head.querySelector("style")).toBeFalsy();
  });

  it("de-duplicates styles with the same href", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Style({
          children: "p { color: red; }",
          href: "/shared.css",
          precedence: "medium",
        }),
        Style({
          children: "p { color: blue; }",
          href: "/shared.css",
          precedence: "medium",
        }),
      ),
    );
    mount(App, container);

    const styles = win.document.head.querySelectorAll("style");
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe("p { color: red; }");
  });

  it("de-duplicates across different components", () => {
    const A = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/shared.css",
        precedence: "medium",
      }),
    );
    const B = cc(() =>
      Style({
        children: "p { color: blue; }",
        href: "/shared.css",
        precedence: "medium",
      }),
    );

    mount(A, container);
    mount(B, container);

    const styles = win.document.head.querySelectorAll("style");
    expect(styles.length).toBe(1);
    expect(styles[0].textContent).toBe("p { color: red; }");
  });

  it("orders styles by precedence (lower first, higher later)", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Style({
          children: "/* first */",
          href: "/first.css",
          precedence: "first",
        }),
        Style({
          children: "/* second */",
          href: "/second.css",
          precedence: "second",
        }),
        Style({
          children: "/* third */",
          href: "/third.css",
          precedence: "first",
        }),
      ),
    );
    mount(App, container);

    const styles = Array.from(win.document.head.querySelectorAll("style"));
    expect(styles.length).toBe(3);
    expect(styles[0].getAttribute("data-sinwan-href")).toBe("/first.css");
    expect(styles[1].getAttribute("data-sinwan-href")).toBe("/third.css");
    expect(styles[2].getAttribute("data-sinwan-href")).toBe("/second.css");
  });

  it("places higher precedence after lower precedence discovered earlier", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Style({
          children: "/* medium */",
          href: "/medium.css",
          precedence: "medium",
        }),
        Style({
          children: "/* high */",
          href: "/high.css",
          precedence: "high",
        }),
        Style({
          children: "/* low */",
          href: "/low.css",
          precedence: "low",
        }),
      ),
    );
    mount(App, container);

    const styles = Array.from(win.document.head.querySelectorAll("style"));
    expect(styles.length).toBe(3);
    expect(styles[0].getAttribute("data-sinwan-href")).toBe("/medium.css");
    expect(styles[1].getAttribute("data-sinwan-href")).toBe("/high.css");
    expect(styles[2].getAttribute("data-sinwan-href")).toBe("/low.css");
  });

  it("leaves style in head on unmount", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/stay.css",
        precedence: "medium",
      }),
    );
    const app = mount(App, container);

    expect(
      win.document.head.querySelector('style[data-sinwan-href="/stay.css"]'),
    ).toBeTruthy();

    app.unmount();

    expect(
      win.document.head.querySelector('style[data-sinwan-href="/stay.css"]'),
    ).toBeTruthy();
  });

  it("drops extraneous props when using precedence", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/styles.css",
        precedence: "medium",
        id: "should-not-exist",
        className: "should-not-exist",
      }),
    );
    mount(App, container);

    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("id")).toBeFalsy();
    expect(style!.getAttribute("class")).toBeFalsy();
  });
});

// ─── Usage / Rendering an inline CSS stylesheet ──────────────────────────

describe("Style — Usage / Rendering an inline CSS stylesheet", () => {
  it("renders an inline stylesheet within the component", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        el("h1", {}, "Hello"),
        Style({ children: "h1 { font-size: 2rem; }" }),
        el("p", {}, "World"),
      ),
    );
    mount(App, container);

    const h1 = container.querySelector("h1");
    const style = container.querySelector("style");
    const p = container.querySelector("p");
    expect(h1).toBeTruthy();
    expect(style).toBeTruthy();
    expect(p).toBeTruthy();
    expect(style!.textContent).toBe("h1 { font-size: 2rem; }");
  });

  it("renders an inline stylesheet in head with href and precedence", () => {
    const App = cc(() =>
      Style({
        children: ".btn { color: red; }",
        href: "Button-styles",
        precedence: "medium",
      }),
    );
    mount(App, container);

    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toBe(".btn { color: red; }");
    expect(style!.getAttribute("data-sinwan-href")).toBe("Button-styles");
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Style — Caveats", () => {
  it("does not leave orphaned style tags in the original container when moved to head", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/styles.css",
        precedence: "medium",
      }),
    );
    mount(App, container);
    expect(container.querySelector("style")).toBeFalsy();
  });

  it("calls the user ref with the element after moving to head", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/styles.css",
        precedence: "medium",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("style");
    expect(refEl!.parentNode as any).toBe(win.document.head);
  });

  it("ignores prop changes after first render (component runs once)", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/static.css",
        precedence: "medium",
      }),
    );
    mount(App, container);

    const style = win.document.head.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.getAttribute("data-sinwan-href")).toBe("/static.css");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Style — Edge cases", () => {
  it("handles rapid mount/unmount cycles (leaves in DOM)", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/cycle.css",
        precedence: "medium",
      }),
    );
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);

    expect(
      win.document.head.querySelectorAll('style[data-sinwan-href="/cycle.css"]')
        .length,
    ).toBe(1);
    app2.unmount();
    expect(
      win.document.head.querySelector('style[data-sinwan-href="/cycle.css"]'),
    ).toBeTruthy();
  });

  it("handles style with null href by rendering inline", () => {
    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: null as any,
        precedence: "medium",
      }),
    );
    mount(App, container);

    expect(container.querySelector("style")).toBeTruthy();
    expect(win.document.head.querySelector("style")).toBeFalsy();
  });

  it("handles style with no identifying props (renders inline)", () => {
    const App = cc(() => Style({ children: "p { color: red; }" }));
    mount(App, container);

    const style = container.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toBe("p { color: red; }");
  });

  it("does not interfere with other head elements", () => {
    const existingMeta = win.document.createElement("meta");
    existingMeta.setAttribute("name", "viewport");
    win.document.head.appendChild(existingMeta);

    const App = cc(() =>
      Style({
        children: "p { color: red; }",
        href: "/new.css",
        precedence: "medium",
      }),
    );
    mount(App, container);

    expect(win.document.head.querySelector("meta")).toBeTruthy();
    expect(
      win.document.head.querySelector('style[data-sinwan-href="/new.css"]'),
    ).toBeTruthy();
  });

  it("renders inline style without children as empty", () => {
    const App = cc(() => Style({}));
    mount(App, container);

    const style = container.querySelector("style");
    expect(style).toBeTruthy();
    expect(style!.textContent).toBe("");
  });

  it("does not deduplicate inline styles (no href)", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Style({ children: "p { color: red; }" }),
        Style({ children: "p { color: red; }" }),
      ),
    );
    mount(App, container);

    expect(container.querySelectorAll("style").length).toBe(2);
  });
});
