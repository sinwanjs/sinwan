/**
 * Comprehensive tests for `createRoot`.
 *
 * Tests mirror the React `createRoot` documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../../../../src/component/create.ts";
import { createRoot } from "../../../../src/integrations/react/create-root.ts";
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

describe("createRoot — Reference", () => {
  it("accepts a DOM element and returns a Root", () => {
    const root = createRoot(container);
    expect(root).toBeDefined();
    expect(typeof root.render).toBe("function");
    expect(typeof root.unmount).toBe("function");
  });

  it("throws when called on the server", () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      expect(() => createRoot(container)).toThrow(
        /createRoot cannot run on the server/,
      );
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });

  it("throws when container is not a DOM element", () => {
    expect(() => createRoot(null as any)).toThrow(
      /Target container is not a DOM element/,
    );
    expect(() => createRoot("#root" as any)).toThrow(
      /Target container is not a DOM element/,
    );
  });
});

// ─── root.render ────────────────────────────────────────────────────────────

describe("createRoot — root.render", () => {
  it("renders a component into the container", () => {
    const App = cc(() => el("div", {}, "hello"));
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).toContain("hello");
    root.unmount();
  });

  it("renders a JSX element into the container", () => {
    const root = createRoot(container);
    root.render(el("span", {}, "jsx"));
    expect(container.textContent).toContain("jsx");
    root.unmount();
  });

  it("clears existing HTML content on first render", () => {
    container.innerHTML = "<p>old content</p>";
    const App = cc(() => el("div", {}, "new"));
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).not.toContain("old content");
    expect(container.textContent).toContain("new");
    root.unmount();
  });

  it("returns undefined", () => {
    const App = cc(() => el("div"));
    const root = createRoot(container);
    expect(root.render(App)).toBeUndefined();
    root.unmount();
  });

  it("accepts options without breaking", () => {
    const root = createRoot(container, {
      identifierPrefix: "app-",
      onUncaughtError: () => {},
      onCaughtError: () => {},
      onRecoverableError: () => {},
    });
    expect(root.render).toBeDefined();
    root.unmount();
  });
});

// ─── root.unmount ───────────────────────────────────────────────────────────

describe("createRoot — root.unmount", () => {
  it("removes the rendered tree from the DOM", () => {
    const App = cc(() => el("div", {}, "mounted"));
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).toContain("mounted");
    root.unmount();
    expect(container.textContent).toBe("");
  });

  it("returns undefined", () => {
    const App = cc(() => el("div"));
    const root = createRoot(container);
    root.render(App);
    expect(root.unmount()).toBeUndefined();
  });

  it("is safe to call multiple times", () => {
    const App = cc(() => el("div"));
    const root = createRoot(container);
    root.render(App);
    root.unmount();
    expect(() => root.unmount()).not.toThrow();
  });

  it("prevents render from being called again", () => {
    const App = cc(() => el("div"));
    const root = createRoot(container);
    root.render(App);
    root.unmount();
    expect(() => root.render(App)).toThrow(/Cannot update an unmounted root/);
  });
});

// ─── Usage / Rendering an app fully built with React ────────────────────────

describe("createRoot — Usage / Rendering a full app", () => {
  it("creates a single root for the entire app", () => {
    const App = cc(() => el("main", {}, el("h1", {}, "Hello, world!")));
    const root = createRoot(container);
    root.render(App);
    expect(container.querySelector("main")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Hello, world!");
    root.unmount();
  });
});

// ─── Usage / Rendering a page partially built with React ────────────────────

describe("createRoot — Usage / Partial page rendering", () => {
  it("supports multiple separate roots on the same page", () => {
    const navContainer = document.createElement("nav");
    const mainContainer = document.createElement("section");
    document.body.appendChild(navContainer as unknown as Node);
    document.body.appendChild(mainContainer as unknown as Node);

    const Navigation = cc(() => el("ul", {}, el("li", {}, "Home")));
    const Comments = cc(() => el("p", {}, "comment"));

    const navRoot = createRoot(navContainer);
    const mainRoot = createRoot(mainContainer);

    navRoot.render(Navigation);
    mainRoot.render(Comments);

    expect(navContainer.textContent).toContain("Home");
    expect(mainContainer.textContent).toContain("comment");

    navRoot.unmount();
    mainRoot.unmount();
  });
});

// ─── Usage / Updating a root component ────────────────────────────────────────

describe("createRoot — Usage / Updating a root component", () => {
  it("calling render again replaces the previous tree", () => {
    const First = cc(() => el("div", { id: "first" }, "A"));
    const Second = cc(() => el("div", { id: "second" }, "B"));

    const root = createRoot(container);
    root.render(First);
    expect(container.querySelector("#first")).toBeTruthy();

    root.render(Second);
    expect(container.querySelector("#first")).toBeFalsy();
    expect(container.querySelector("#second")).toBeTruthy();

    root.unmount();
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("createRoot — Caveats", () => {
  it("throws on server even with a valid container mock", () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      expect(() => createRoot({} as any)).toThrow(
        /createRoot cannot run on the server/,
      );
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("createRoot — Edge cases", () => {
  it("renders into an empty container", () => {
    const App = cc(() => el("span", {}, "empty"));
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).toBe("empty");
    root.unmount();
  });

  it("renders null content gracefully", () => {
    const App = cc(() => null as any);
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).toBe("");
    root.unmount();
  });

  it("identifierPrefix option is accepted", () => {
    const root = createRoot(container, { identifierPrefix: "my-app" });
    expect(typeof root.render).toBe("function");
    root.unmount();
  });
});
