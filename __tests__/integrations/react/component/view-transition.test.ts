/**
 * Comprehensive tests for `<ViewTransition>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  ViewTransition,
  unstable_ViewTransition,
  unstable_startViewTransition,
} from "../../../../src/integrations/react/_client.ts";
import { REACT_VIEW_TRANSITION_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";

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

// ─── Reference ──────────────────────────────────────────────────────────────

describe("ViewTransition — Reference", () => {
  it("accepts name and children props", () => {
    const App = cc(() =>
      ViewTransition({ name: "page", children: el("span", {}, "hi") }),
    );
    mount(App, container);
    expect(container.textContent).toContain("hi");
  });

  it("has REACT_VIEW_TRANSITION_TYPE as $$typeof", () => {
    expect((ViewTransition as any).$$typeof).toBe(REACT_VIEW_TRANSITION_TYPE);
  });

  it("has _SinwanComponent marker", () => {
    expect((ViewTransition as any)._SinwanComponent).toBe(true);
  });

  it("unstable_ViewTransition is aliased to ViewTransition", () => {
    expect(unstable_ViewTransition).toBe(ViewTransition);
  });

  it("renders without name as transparent passthrough", () => {
    const App = cc(() =>
      ViewTransition({ children: el("p", {}, "passthrough") }),
    );
    mount(App, container);
    const p = container.querySelector("p");
    expect(p).toBeTruthy();
    expect(p?.textContent).toBe("passthrough");
  });
});

// ─── Usage / Animating an element on enter/exit ─────────────────────────────

describe("ViewTransition — Usage / Enter and Exit", () => {
  it("wraps children in a div with view-transition-name when name is provided", () => {
    const App = cc(() =>
      ViewTransition({
        name: "my-transition",
        children: el("span", {}, "wrapped"),
      }),
    );
    mount(App, container);

    const wrapper = container.querySelector("div");
    expect(wrapper).toBeTruthy();
    const styleAttr = wrapper?.getAttribute("style") ?? "";
    expect(styleAttr).toContain("view-transition-name");
    expect(styleAttr).toContain("my-transition");
    expect(wrapper?.textContent).toBe("wrapped");
  });

  it("supports enter and exit class props", () => {
    const App = cc(() =>
      ViewTransition({
        name: "item",
        enter: "slide-up",
        exit: "slide-down",
        children: el("div", {}, "animated"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("animated");
  });

  it("supports default class prop", () => {
    const App = cc(() =>
      ViewTransition({
        name: "item",
        default: "none",
        children: el("div", {}, "default-none"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("default-none");
  });
});

// ─── Usage / Customizing animations with types ──────────────────────────────

describe("ViewTransition — Usage / Typed classes", () => {
  it("accepts object values for enter with transition types", () => {
    const App = cc(() =>
      ViewTransition({
        name: "nav",
        enter: {
          forward: "slide-left",
          default: "auto",
        },
        children: el("div", {}, "typed"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("typed");
  });

  it("accepts object values for default with transition types", () => {
    const App = cc(() =>
      ViewTransition({
        name: "nav",
        default: {
          "navigation-back": "slide-right",
          "navigation-forward": "slide-left",
        },
        children: el("div", {}, "typed-default"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("typed-default");
  });
});

// ─── Usage / Animating with JavaScript ───────────────────────────────────────

describe("ViewTransition — Usage / JavaScript events", () => {
  it("accepts onEnter callback", () => {
    const onEnter = (_instance: any, _types: string[]) => {};
    const App = cc(() =>
      ViewTransition({
        name: "item",
        onEnter,
        children: el("div", {}, "enter"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("enter");
  });

  it("accepts onExit callback", () => {
    const onExit = (_instance: any, _types: string[]) => {};
    const App = cc(() =>
      ViewTransition({
        name: "item",
        onExit,
        children: el("div", {}, "exit"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("exit");
  });

  it("accepts onUpdate callback", () => {
    const onUpdate = (_instance: any, _types: string[]) => {};
    const App = cc(() =>
      ViewTransition({
        name: "item",
        onUpdate,
        children: el("div", {}, "update"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("update");
  });

  it("accepts onShare callback", () => {
    const onShare = (_instance: any, _types: string[]) => {};
    const App = cc(() =>
      ViewTransition({
        name: "item",
        onShare,
        children: el("div", {}, "share"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("share");
  });

  it("accepts all event callbacks together", () => {
    const App = cc(() =>
      ViewTransition({
        name: "item",
        onEnter: () => {},
        onExit: () => {},
        onUpdate: () => {},
        onShare: () => {},
        children: el("div", {}, "all-events"),
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("all-events");
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────────

describe("ViewTransition — Caveats", () => {
  it("only top-level ViewTransition animates on exit/enter — nested DOM breaks", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        ViewTransition({
          name: "broken",
          children: el("span", {}, "nested"),
        }),
      ),
    );
    mount(App, container);
    expect(container.textContent).toContain("nested");
  });

  it("multiple siblings inside ViewTransition share the same conceptual boundary", () => {
    const App = cc(() =>
      ViewTransition({
        name: "list",
        children: [
          el("span", { key: "a" }, "a"),
          el("span", { key: "b" }, "b"),
        ],
      }),
    );
    mount(App, container);
    expect(container.textContent).toContain("a");
    expect(container.textContent).toContain("b");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("ViewTransition — Edge cases", () => {
  it("handles empty children", () => {
    const App = cc(() => ViewTransition({ name: "empty" }));
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("handles null children", () => {
    const App = cc(() => ViewTransition({ name: "null", children: null }));
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("handles undefined children", () => {
    const App = cc(() =>
      ViewTransition({ name: "undefined", children: undefined }),
    );
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("preserves child component structure when name is provided", () => {
    const Child = cc(() => {
      return el("span", { "data-testid": "child" }, "child content");
    });

    const App = cc(() =>
      ViewTransition({
        name: "parent",
        children: el(Child as any, {}),
      }),
    );

    mount(App, container);
    const wrapper = container.querySelector("div");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.querySelector("[data-testid='child']")).toBeTruthy();
    expect(wrapper?.textContent).toBe("child content");
  });

  it("renders multiple nested components without name as passthrough", () => {
    const Child = cc(() => el("span", {}, "child"));
    const App = cc(() =>
      ViewTransition({
        children: el(Child as any, {}),
      }),
    );
    mount(App, container);
    expect(container.querySelector("span")?.textContent).toBe("child");
  });
});

// ─── unstable_startViewTransition ─────────────────────────────────────────────

describe("unstable_startViewTransition", () => {
  it("falls back to running the callback when the API is missing", async () => {
    let ran = false;
    const t = unstable_startViewTransition(() => {
      ran = true;
    });
    await t.finished;
    expect(ran).toBe(true);
  });

  it("delegates to document.startViewTransition when available", async () => {
    let started = false;
    (document as any).startViewTransition = (cb: () => void) => {
      started = true;
      cb();
      return { finished: Promise.resolve() };
    };
    const t = unstable_startViewTransition(() => {});
    await t.finished;
    expect(started).toBe(true);
    delete (document as any).startViewTransition;
  });

  it("runs callback synchronously on the server", async () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      let ran = false;
      const t = unstable_startViewTransition(() => {
        ran = true;
      });
      await t.finished;
      expect(ran).toBe(true);
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });
});
