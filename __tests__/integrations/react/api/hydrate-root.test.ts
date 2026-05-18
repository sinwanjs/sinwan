/**
 * Comprehensive tests for `hydrateRoot`.
 *
 * Tests mirror the React `hydrateRoot` documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../../../../src/component/create.ts";
import { hydrateRoot } from "../../../../src/integrations/react/hydrate-root.ts";
import { renderToHydratableString } from "../../../../src/server/hydration-markers.ts";
import { signal, nextTick } from "../../../../src/reactivity/index.ts";
import type { SinwanElement } from "../../../../src/types.ts";

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

// ─── Reference ──────────────────────────────────────────────────────────────

describe("hydrateRoot — Reference", () => {
  it("accepts a DOM element and React node and returns a Root", async () => {
    const App = cc(() => el("div", {}, "hello"));
    container.innerHTML = "<div>hello</div>";
    const root = hydrateRoot(container, App);
    expect(root).toBeDefined();
    expect(typeof root.render).toBe("function");
    expect(typeof root.unmount).toBe("function");
    root.unmount();
  });

  it("throws when called on the server", () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      expect(() =>
        hydrateRoot(
          container,
          cc(() => el("div")),
        ),
      ).toThrow(/hydrateRoot cannot run on the server/);
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });

  it("throws when container is not a DOM element", () => {
    expect(() =>
      hydrateRoot(
        null as any,
        cc(() => el("div")),
      ),
    ).toThrow(/Target container is not a DOM element/);
    expect(() =>
      hydrateRoot(
        "#root" as any,
        cc(() => el("div")),
      ),
    ).toThrow(/Target container is not a DOM element/);
  });

  it("accepts options without breaking", async () => {
    const App = cc(() => el("div", {}, "hello"));
    container.innerHTML = "<div>hello</div>";
    const root = hydrateRoot(container, App, {
      identifierPrefix: "app-",
      onUncaughtError: () => {},
      onCaughtError: () => {},
      onRecoverableError: () => {},
    });
    expect(root.render).toBeDefined();
    root.unmount();
  });
});

// ─── root.render ──────────────────────────────────────────────────────────

describe("hydrateRoot — root.render", () => {
  it("renders a component into the container", async () => {
    const App = cc(() => el("div", {}, "hydrated"));
    container.innerHTML = "<div>hydrated</div>";
    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("hydrated");
    root.unmount();
  });

  it("returns undefined", async () => {
    const App = cc(() => el("div"));
    container.innerHTML = "<div></div>";
    const root = hydrateRoot(container, App);
    expect(root.render(cc(() => el("span")))).toBeUndefined();
    root.unmount();
  });

  it("updates a hydrated root with a new component", async () => {
    const First = cc(() => el("div", { id: "first" }, "A"));
    const Second = cc(() => el("div", { id: "second" }, "B"));

    container.innerHTML = '<div id="first">A</div>';
    const root = hydrateRoot(container, First);
    expect(container.querySelector("#first")).toBeTruthy();

    root.render(Second);
    expect(container.querySelector("#first")).toBeFalsy();
    expect(container.querySelector("#second")).toBeTruthy();

    root.unmount();
  });

  it("switches to client rendering after hydration on re-render", async () => {
    const App = cc(() => el("span", {}, "client"));
    container.innerHTML = "<span>server</span>";
    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("server");

    root.render(App);
    // After re-render it should now be a fresh client mount
    expect(container.textContent).toContain("client");

    root.unmount();
  });
});

// ─── root.unmount ───────────────────────────────────────────────────────────

describe("hydrateRoot — root.unmount", () => {
  it("removes the rendered tree from the DOM", async () => {
    const App = cc(() => el("div", {}, "mounted"));
    container.innerHTML = "<div>mounted</div>";
    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("mounted");
    root.unmount();
    expect(container.textContent).toBe("");
  });

  it("returns undefined", async () => {
    const App = cc(() => el("div"));
    container.innerHTML = "<div></div>";
    const root = hydrateRoot(container, App);
    expect(root.unmount()).toBeUndefined();
  });

  it("is safe to call multiple times", async () => {
    const App = cc(() => el("div"));
    container.innerHTML = "<div></div>";
    const root = hydrateRoot(container, App);
    root.unmount();
    expect(() => root.unmount()).not.toThrow();
  });

  it("prevents render from being called again", async () => {
    const App = cc(() => el("div"));
    container.innerHTML = "<div></div>";
    const root = hydrateRoot(container, App);
    root.unmount();
    expect(() => root.render(App)).toThrow(/Cannot update an unmounted root/);
  });
});

// ─── Usage / Hydrating server-rendered HTML ────────────────────────────────

describe("hydrateRoot — Usage / Hydrating server-rendered HTML", () => {
  it("hydrates SSR HTML produced by renderToHydratableString", async () => {
    const App = cc(() => el("div", {}, el("h1", {}, "Hello")));
    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("Hello");
    root.unmount();
  });

  it("attaches event listeners after hydration", async () => {
    let clicked = false;
    const App = cc(() =>
      el(
        "button",
        {
          onClick: () => {
            clicked = true;
          },
        },
        "Click",
      ),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(clicked).toBe(true);
    root.unmount();
  });

  it("reactive text updates after hydration", async () => {
    const App = cc(() => {
      const count = signal(5);
      return el(
        "div",
        {},
        el("span", {}, "Count: ", count as any),
        el(
          "button",
          {
            onClick: () => {
              count.value++;
            },
          },
          "+",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("Count: 5");

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("Count: 6");
    root.unmount();
  });

  it("preserves existing DOM nodes during hydration", async () => {
    const App = cc(() =>
      el("div", { class: "root" }, el("h1", {}, "Title"), el("p", {}, "Body")),
    );

    const html = await renderToHydratableString(App);
    container.innerHTML = html;

    const originalDiv = container.firstElementChild;
    const originalH1 = container.querySelector("h1");

    const root = hydrateRoot(container, App);

    expect(container.firstElementChild).toBe(originalDiv);
    expect(container.querySelector("h1")).toBe(originalH1);
    root.unmount();
  });
});

// ─── Usage / Updating a hydrated root component ───────────────────────────

describe("hydrateRoot — Usage / Updating a hydrated root component", () => {
  it("calling render again replaces the previous tree with a client mount", async () => {
    const First = cc(() => el("div", { id: "first" }, "A"));
    const Second = cc(() => el("div", { id: "second" }, "B"));

    const html = await renderToHydratableString(First);
    container.innerHTML = html;

    const root = hydrateRoot(container, First);
    expect(container.querySelector("#first")).toBeTruthy();

    root.render(Second);
    expect(container.querySelector("#first")).toBeFalsy();
    expect(container.querySelector("#second")).toBeTruthy();

    root.unmount();
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("hydrateRoot — Caveats", () => {
  it("throws on server even with a valid container mock", () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      expect(() =>
        hydrateRoot(
          {} as any,
          cc(() => el("div")),
        ),
      ).toThrow(/hydrateRoot cannot run on the server/);
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("hydrateRoot — Edge cases", () => {
  it("empty container stays empty during hydration mismatch", async () => {
    const App = cc(() => el("span", {}, "empty"));
    // Empty container — hydration has no DOM to reuse, so visible output
    // remains empty (hydrate() attaches to existing nodes, it does not
    // create missing ones).
    const root = hydrateRoot(container, App);
    expect(container.textContent).toBe("");
    root.unmount();
  });

  it("renders null content gracefully", async () => {
    const App = cc(() => null as any);
    container.innerHTML = "";
    const root = hydrateRoot(container, App);
    expect(container.textContent).toBe("");
    root.unmount();
  });

  it("identifierPrefix option is accepted", async () => {
    const App = cc(() => el("div", {}, "hello"));
    container.innerHTML = "<div>hello</div>";
    const root = hydrateRoot(container, App, { identifierPrefix: "my-app" });
    expect(typeof root.render).toBe("function");
    root.unmount();
  });

  it("accepts a plain element instead of a component function", async () => {
    container.innerHTML = "<div>hello</div>";
    const root = hydrateRoot(container, el("div", {}, "hello"));
    expect(container.textContent).toContain("hello");
    root.unmount();
  });
});
