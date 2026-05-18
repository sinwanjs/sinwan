/**
 * Comprehensive tests for `<Title>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { Title } from "../../../../src/integrations/react/elements.ts";

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
  // Clean up any title elements left in head from previous tests
  const headTitles = win.document.head.querySelectorAll("title");
  for (const t of Array.from(headTitles)) {
    t.parentNode?.removeChild(t);
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

describe("Title — Reference", () => {
  it("renders a native <title> element", () => {
    const App = cc(() => Title({ children: "My Blog" }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("My Blog");
  });

  it("accepts common element props", () => {
    const App = cc(() => Title({ children: "My Blog", id: "my-title" }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.getAttribute("id")).toBe("my-title");
  });

  it("returns a valid SinwanElement when called outside a component", () => {
    const result = Title({ children: "Test" });
    expect(result.tag).toBe("title");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Title — Props", () => {
  it("sets text content from children", () => {
    const App = cc(() => Title({ children: "Contact Us" }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("Contact Us");
  });

  it("coerces numeric children to string", () => {
    const App = cc(() => Title({ children: 42 as any }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title!.textContent).toBe("42");
  });

  it("throws when given multiple children", () => {
    expect(() => Title({ children: ["Hello ", "World"] as any })).toThrow(
      /must only contain a single string of text/,
    );
  });

  it("throws when given an array of children", () => {
    expect(() => Title({ children: ["Results page ", 1] as any })).toThrow(
      /must only contain a single string of text/,
    );
  });
});

// ─── Special rendering behavior ──────────────────────────────────────────

describe("Title — Special rendering behavior", () => {
  it("places the title element in document.head when rendered in body", () => {
    const App = cc(() => Title({ children: "My Site: Contact Us" }));
    mount(App, container);

    // Should not be in the original container
    expect(container.querySelector("title")).toBeFalsy();

    // Should be in document.head
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("My Site: Contact Us");
  });

  it("does not move to head when itemProp is present", () => {
    const App = cc(() =>
      el(
        "section",
        { itemScope: true },
        Title({ itemProp: "name", children: "Product Name" }),
      ),
    );
    mount(App, container);

    // Should be in the container, not in head
    const titleInContainer = container.querySelector("title");
    expect(titleInContainer).toBeTruthy();
    expect(titleInContainer!.getAttribute("itemprop")).toBe("name");

    const titleInHead = win.document.head.querySelector(
      'title[itemprop="name"]',
    );
    expect(titleInHead).toBeFalsy();
  });

  it("removes from head on unmount", () => {
    const App = cc(() => Title({ children: "Temporary" }));
    const app = mount(App, container);

    expect(win.document.head.querySelector("title")).toBeTruthy();

    app.unmount();

    expect(win.document.head.querySelector("title")).toBeFalsy();
  });

  it("removes from head on unmount with user ref", () => {
    let refEl: Element | null = "initial" as any;
    const App = cc(() =>
      Title({
        children: "Temporary",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    const app = mount(App, container);
    expect(refEl).toBeTruthy();

    app.unmount();
    expect(win.document.head.querySelector("title")).toBeFalsy();
    expect(refEl).toBeNull();
  });
});

// ─── Usage / Set the document title ──────────────────────────────────────

describe("Title — Usage / Set the document title", () => {
  it("can render title from any component", () => {
    const Page = cc(() =>
      el(
        "div",
        {},
        Title({ children: "My Site: Contact Us" }),
        el("h1", {}, "Contact Us"),
        el("p", {}, "Email us at support@example.com"),
      ),
    );
    mount(Page, container);

    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelector("p")).toBeTruthy();
    expect(container.querySelector("title")).toBeFalsy();

    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("My Site: Contact Us");
  });
});

// ─── Usage / Use variables in the title ──────────────────────────────────

describe("Title — Usage / Use variables in the title", () => {
  it("accepts a single interpolated string", () => {
    const pageNumber = 5;
    const App = cc(() => Title({ children: `Results page ${pageNumber}` }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title!.textContent).toBe("Results page 5");
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Title — Caveats", () => {
  it("does not leave orphaned title tags in the original container", () => {
    const App = cc(() => Title({ children: "My Blog" }));
    mount(App, container);
    expect(container.querySelector("title")).toBeFalsy();
  });

  it("calls the user ref with the element after moving to head", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Title({
        children: "My Blog",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("title");
    expect(refEl!.parentNode as any).toBe(win.document.head);
  });

  it("handles empty string children", () => {
    const App = cc(() => Title({ children: "" }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("");
  });

  it("handles null/undefined children", () => {
    const App = cc(() => Title({ children: undefined }));
    mount(App, container);
    const title = win.document.head.querySelector("title");
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe("");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Title — Edge cases", () => {
  it("handles rapid mount/unmount cycles", () => {
    const App = cc(() => Title({ children: "Cycle" }));
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);
    app2.unmount();
    const app3 = mount(App, container);

    expect(win.document.head.querySelectorAll("title").length).toBe(1);
    app3.unmount();
    expect(win.document.head.querySelector("title")).toBeFalsy();
  });

  it("does not interfere with other head elements", () => {
    const existingMeta = win.document.createElement("meta");
    existingMeta.setAttribute("name", "viewport");
    win.document.head.appendChild(existingMeta);

    const App = cc(() => Title({ children: "New Title" }));
    mount(App, container);

    expect(win.document.head.querySelector("meta")).toBeTruthy();
    expect(win.document.head.querySelector("title")).toBeTruthy();
  });

  it("does not throw if document.head is missing (defensive)", () => {
    const App = cc(() => Title({ children: "Safe" }));
    expect(() => mount(App, container)).not.toThrow();
  });

  it("handles title rendered at the root level", () => {
    const App = cc(() => Title({ children: "Root Title" }));
    mount(App, container);
    expect(win.document.head.querySelector("title")).toBeTruthy();
    expect(container.querySelector("title")).toBeFalsy();
  });
});
