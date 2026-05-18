/**
 * Comprehensive tests for `<StrictMode>`.
 *
 * Tests are organized to mirror the React documentation sections.
 * Sinwan does not implement React's intentional double-invocation;
 * StrictMode is a passive passthrough for source compatibility.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { StrictMode } from "../../../../src/integrations/react/strict-mode.ts";
import { useState } from "../../../../src/integrations/react/_client.ts";
import { REACT_STRICT_MODE_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";
import { Fragment } from "../../../../src/integrations/react/_shared.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("StrictMode — Reference", () => {
  it("is exported as a function", () => {
    expect(typeof StrictMode).toBe("function");
  });

  it("has REACT_STRICT_MODE_TYPE as $$typeof", () => {
    expect((StrictMode as any).$$typeof).toBe(REACT_STRICT_MODE_TYPE);
  });

  it("has _SinwanComponent marker", () => {
    expect((StrictMode as any)._SinwanComponent).toBe(true);
  });

  it("renders children without a wrapper DOM node", () => {
    const App = cc(() => StrictMode({ children: el("div", {}, "hello") }));
    mount(App, container);
    expect(container.children.length).toBe(1);
    expect((container.children[0] as HTMLElement).tagName).toBe("DIV");
    expect(container.textContent).toBe("hello");
  });

  it("accepts no props other than children", () => {
    // StrictModeProps only has optional `children`; any other prop is ignored
    const node = StrictMode({ children: el("span") });
    expect(node.tag).toBe("");
    expect(Object.keys(node.props)).toHaveLength(0);
  });
});

// ─── Usage / Enabling Strict Mode for entire app ────────────────────────────

describe("StrictMode — Usage / Enabling Strict Mode for entire app", () => {
  it("wraps the root component and passes children through", () => {
    const App = cc(() => {
      return StrictMode({
        children: el("main", {}, el("h1", {}, "Title"), el("p", {}, "Body")),
      });
    });

    mount(App, container);

    const main = container.querySelector("main");
    expect(main).toBeTruthy();
    expect(main!.children.length).toBe(2);
    expect((main!.children[0] as HTMLElement).tagName).toBe("H1");
    expect((main!.children[1] as HTMLElement).tagName).toBe("P");
  });

  it("does not affect sibling components outside StrictMode", () => {
    const Header = cc(() => el("header", {}, "Header"));
    const Footer = cc(() => el("footer", {}, "Footer"));

    const App = cc(() => {
      return el(
        Fragment,
        {},
        el(Header as any, {}),
        StrictMode({ children: el("main", {}, "Main") }),
        el(Footer as any, {}),
      );
    });

    mount(App, container);

    expect(container.children.length).toBe(3);
    expect((container.children[0] as HTMLElement).tagName).toBe("HEADER");
    expect((container.children[1] as HTMLElement).tagName).toBe("MAIN");
    expect((container.children[2] as HTMLElement).tagName).toBe("FOOTER");
  });
});

// ─── Usage / Enabling Strict Mode for a part of the app ───────────────────

describe("StrictMode — Usage / Enabling Strict Mode for a part of the app", () => {
  it("wraps a subtree and leaves siblings unaffected", () => {
    const Sidebar = cc(() => el("aside", {}, "Sidebar"));
    const Content = cc(() => el("article", {}, "Content"));
    const Header = cc(() => el("header", {}, "Header"));
    const Footer = cc(() => el("footer", {}, "Footer"));

    const App = cc(() => {
      return el(
        Fragment,
        {},
        el(Header as any, {}),
        StrictMode({
          children: el(
            Fragment,
            {},
            el(Sidebar as any, {}),
            el(Content as any, {}),
          ),
        }),
        el(Footer as any, {}),
      );
    });

    mount(App, container);

    expect(container.children.length).toBe(4);
    expect((container.children[0] as HTMLElement).tagName).toBe("HEADER");
    expect((container.children[1] as HTMLElement).tagName).toBe("ASIDE");
    expect((container.children[2] as HTMLElement).tagName).toBe("ARTICLE");
    expect((container.children[3] as HTMLElement).tagName).toBe("FOOTER");
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("StrictMode — Caveats", () => {
  it("does not introduce extra wrapper elements", () => {
    const Child = cc(() => el("span", {}, "child"));

    const App = cc(() => {
      return StrictMode({ children: el(Child as any, {}) });
    });

    mount(App, container);

    // Only the span should be a direct child; no wrapper from StrictMode
    expect(container.children.length).toBe(1);
    expect((container.children[0] as HTMLElement).tagName).toBe("SPAN");
  });

  it("nested StrictMode still passes through children", () => {
    const App = cc(() => {
      return StrictMode({
        children: StrictMode({
          children: StrictMode({ children: el("div", {}, "deep") }),
        }),
      });
    });

    mount(App, container);

    expect(container.children.length).toBe(1);
    expect((container.children[0] as HTMLElement).textContent).toBe("deep");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("StrictMode — Edge cases", () => {
  it("handles empty children", () => {
    const App = cc(() => StrictMode({}));
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("handles a single child element", () => {
    const App = cc(() => StrictMode({ children: el("p", {}, "only") }));
    mount(App, container);
    expect(container.children.length).toBe(1);
    expect((container.children[0] as HTMLElement).textContent).toBe("only");
  });

  it("handles multiple sibling children", () => {
    const App = cc(() =>
      StrictMode({
        children: el(
          Fragment,
          {},
          el("span", {}, "a"),
          el("span", {}, "b"),
          el("span", {}, "c"),
        ),
      }),
    );
    mount(App, container);
    expect(container.querySelectorAll("span").length).toBe(3);
  });

  it("handles text children", () => {
    const App = cc(() => StrictMode({ children: "plain text" }));
    mount(App, container);
    expect(container.textContent).toBe("plain text");
  });

  it("handles reactive children with useState", async () => {
    let setValue: (v: string) => void;

    const Counter = cc(() => {
      const [value, setV] = useState("initial");
      setValue = setV;
      return el("span", {}, value);
    });

    const App = cc(() => {
      return StrictMode({ children: el(Counter as any, {}) });
    });

    mount(App, container);
    expect(container.textContent).toBe("initial");

    setValue!("updated");
    await tick();
    expect(container.textContent).toBe("updated");
  });

  it("handles a Fragment as a child", () => {
    const App = cc(() =>
      StrictMode({
        children: el(Fragment, {}, el("p", {}, "1"), el("p", {}, "2")),
      }),
    );
    mount(App, container);
    expect(container.querySelectorAll("p").length).toBe(2);
  });

  it("preserves component identity across StrictMode boundaries", async () => {
    let renderCount = 0;

    const Child = cc(() => {
      renderCount++;
      return el("span", {}, "child");
    });

    const App = cc(() => {
      return StrictMode({ children: el(Child as any, {}) });
    });

    mount(App, container);
    expect(renderCount).toBe(1); // Sinwan components run once, not twice
    expect(container.textContent).toBe("child");
  });
});
