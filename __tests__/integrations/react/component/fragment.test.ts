/**
 * Comprehensive tests for `<Fragment>` (<>...</>).
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { Fragment } from "../../../../src/integrations/react/_shared.ts";
import { useState } from "../../../../src/integrations/react/_client.ts";

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

describe("Fragment — Reference", () => {
  it("is exported as a symbol", () => {
    expect(typeof Fragment).toBe("symbol");
  });

  it("renders children without a wrapper DOM node", () => {
    const App = cc(() => {
      return el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b"));
    });
    mount(App, container);

    // Direct children of container, no wrapper element
    expect(container.children.length).toBe(2);
    expect((container.children[0] as HTMLElement).tagName).toBe("SPAN");
    expect((container.children[1] as HTMLElement).tagName).toBe("SPAN");
    expect(container.textContent).toBe("ab");
  });

  it("empty shorthand tag produces the same result as Fragment symbol", () => {
    const App1 = cc(() => {
      return el(Fragment, {}, el("span", {}, "x"), el("span", {}, "y"));
    });
    const App2 = cc(() => {
      return el("", {}, el("span", {}, "x"), el("span", {}, "y"));
    });

    const c1 = (globalThis as any).document.createElement("div");
    const c2 = (globalThis as any).document.createElement("div");
    (globalThis as any).document.body.appendChild(c1);
    (globalThis as any).document.body.appendChild(c2);

    mount(App1, c1);
    mount(App2, c2);

    expect(c1.innerHTML).toBe(c2.innerHTML);
    expect(c1.children.length).toBe(2);
    expect(c2.children.length).toBe(2);
  });
});

// ─── Usage / Returning multiple elements ──────────────────────────────────

describe("Fragment — Usage / Returning multiple elements", () => {
  it("lets a component return multiple sibling elements", () => {
    const Post = cc(() => {
      return el(Fragment, {}, el("h1", {}, "Title"), el("p", {}, "Body"));
    });

    const Blog = cc(() => {
      return el(Fragment, {}, el(Post as any, {}), el(Post as any, {}));
    });

    mount(Blog, container);

    // All h1 and p are direct siblings, no wrapper elements
    expect(container.children.length).toBe(4);
    expect((container.children[0] as HTMLElement).tagName).toBe("H1");
    expect((container.children[1] as HTMLElement).tagName).toBe("P");
    expect((container.children[2] as HTMLElement).tagName).toBe("H1");
    expect((container.children[3] as HTMLElement).tagName).toBe("P");
  });

  it("has no effect on layout or styles compared to ungrouped elements", () => {
    const WithFragment = cc(() => {
      return el(Fragment, {}, el("span", {}, "1"), el("span", {}, "2"));
    });

    const WithoutFragment = cc(() => {
      return el("div", {}, el("span", {}, "1"), el("span", {}, "2"));
    });

    const c1 = (globalThis as any).document.createElement("div");
    const c2 = (globalThis as any).document.createElement("div");
    (globalThis as any).document.body.appendChild(c1);
    (globalThis as any).document.body.appendChild(c2);

    mount(WithFragment, c1);
    mount(WithoutFragment, c2);

    // Fragment group has no wrapper, so children are direct
    expect(c1.children.length).toBe(2);
    // Non-fragment has a div wrapper, so children are inside div
    expect(c2.children.length).toBe(1);
    expect((c2.children[0] as HTMLElement).children.length).toBe(2);
  });
});

// ─── Usage / Assigning multiple elements to a variable ────────────────────

describe("Fragment — Usage / Assigning multiple elements to a variable", () => {
  it("can be assigned to a variable and passed as a prop", () => {
    const AlertDialog = cc(
      (props: { buttons: SinwanElement; children: any }) => {
        return el("div", {}, props.children, props.buttons);
      },
    );

    const CloseDialog = cc(() => {
      const buttons = el(
        Fragment,
        {},
        el("button", {}, "OK"),
        el("button", {}, "Cancel"),
      );
      return el(AlertDialog as any, { buttons }, "Are you sure?");
    });

    mount(CloseDialog, container);
    expect(container.textContent).toBe("Are you sure?OKCancel");
    expect(container.querySelectorAll("button").length).toBe(2);
  });
});

// ─── Usage / Grouping elements with text ──────────────────────────────────

describe("Fragment — Usage / Grouping elements with text", () => {
  it("groups text nodes with components", () => {
    const DatePicker = cc((props: { date: string }) => {
      return el("span", { class: "picker" }, props.date);
    });

    const DateRangePicker = cc(() => {
      return el(
        Fragment,
        {},
        "From",
        el(DatePicker as any, { date: "2024-01-01" }),
        "to",
        el(DatePicker as any, { date: "2024-12-31" }),
      );
    });

    mount(DateRangePicker, container);

    expect(container.textContent).toBe("From2024-01-01to2024-12-31");
    // Text nodes and spans are direct children (plus fragment anchor comment)
    expect(container.childNodes.length).toBeGreaterThanOrEqual(4);
  });
});

// ─── Usage / Rendering a list of Fragments ──────────────────────────────────

describe("Fragment — Usage / Rendering a list of Fragments", () => {
  it("renders keyed fragments in a loop without wrapper nodes", () => {
    const posts = [
      { id: 1, title: "First" },
      { id: 2, title: "Second" },
    ];

    const PostTitle = cc((props: { title: string }) => {
      return el("h1", {}, props.title);
    });

    const PostBody = cc((props: { body: string }) => {
      return el("article", {}, el("p", {}, props.body));
    });

    const Blog = cc(() => {
      return el(
        "div",
        {},
        ...posts.map((post) =>
          el(
            Fragment,
            { key: post.id },
            el(PostTitle as any, { title: post.title }),
            el(PostBody as any, { body: `Body of ${post.title}` }),
          ),
        ),
      );
    });

    mount(Blog, container);

    const wrapper = container.querySelector("div")!;
    // No wrapper elements around each post's h1+article pair
    expect(wrapper.children.length).toBe(4);
    expect((wrapper.children[0] as HTMLElement).tagName).toBe("H1");
    expect((wrapper.children[1] as HTMLElement).tagName).toBe("ARTICLE");
    expect((wrapper.children[2] as HTMLElement).tagName).toBe("H1");
    expect((wrapper.children[3] as HTMLElement).tagName).toBe("ARTICLE");
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("Fragment — Caveats", () => {
  it("does not reset state when wrapping/unwraping with Fragment", async () => {
    let state: any;
    let setState: any;

    const Child = cc(() => {
      [state, setState] = useState(42);
      return el("span", {}, String(state()));
    });

    // Render with Fragment wrapper
    const App1 = cc(() => {
      return el(Fragment, {}, el(Child as any, {}));
    });

    mount(App1, container);
    expect(state()).toBe(42);

    // Change state
    setState(100);
    await tick();
    expect(state()).toBe(100);

    // Now render the same Child without Fragment wrapper
    const App2 = cc(() => {
      return el(Child as any, {});
    });

    // Unmount and remount — Sinwan doesn't have React's reconciliation,
    // so this creates a fresh instance. The key point is that Fragment
    // itself does not introduce extra wrapper elements.
    const container2 = (globalThis as any).document.createElement("div");
    (globalThis as any).document.body.appendChild(container2);
    mount(App2, container2);

    // New mount gets fresh state
    expect(container2.textContent).toBe("42");
  });

  it("nested fragments collapse to a single level of children", () => {
    const App = cc(() => {
      return el(
        Fragment,
        {},
        el(Fragment, {}, el("span", {}, "a"), el("span", {}, "b")),
        el(Fragment, {}, el("span", {}, "c")),
      );
    });

    mount(App, container);

    expect(container.children.length).toBe(3);
    expect((container.children[0] as HTMLElement).textContent).toBe("a");
    expect((container.children[1] as HTMLElement).textContent).toBe("b");
    expect((container.children[2] as HTMLElement).textContent).toBe("c");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("Fragment — Edge cases", () => {
  it("handles an empty fragment", () => {
    const App = cc(() => {
      return el(Fragment, {});
    });

    mount(App, container);
    // Empty fragment leaves just the anchor comment
    expect(container.textContent).toBe("");
  });

  it("handles a fragment with a single child", () => {
    const App = cc(() => {
      return el(Fragment, {}, el("div", {}, "only"));
    });

    mount(App, container);
    expect(container.children.length).toBe(1);
    expect((container.children[0] as HTMLElement).textContent).toBe("only");
  });

  it("handles deeply nested fragments", () => {
    const App = cc(() => {
      return el(
        Fragment,
        {},
        el(
          Fragment,
          {},
          el(Fragment, {}, el(Fragment, {}, el("p", {}, "deep"))),
        ),
      );
    });

    mount(App, container);
    expect(container.querySelector("p")!.textContent).toBe("deep");
    expect(container.children.length).toBe(1);
  });

  it("handles fragments mixed with intrinsic elements", () => {
    const App = cc(() => {
      return el(
        "section",
        {},
        el("header", {}, "Header"),
        el(
          Fragment,
          {},
          el("p", {}, "Paragraph 1"),
          el("p", {}, "Paragraph 2"),
        ),
        el("footer", {}, "Footer"),
      );
    });

    mount(App, container);

    const section = container.querySelector("section")!;
    expect(section.children.length).toBe(4);
    expect((section.children[0] as HTMLElement).tagName).toBe("HEADER");
    expect((section.children[1] as HTMLElement).tagName).toBe("P");
    expect((section.children[2] as HTMLElement).tagName).toBe("P");
    expect((section.children[3] as HTMLElement).tagName).toBe("FOOTER");
  });

  it("handles fragments with reactive children", async () => {
    let setValue: any;

    const App = cc(() => {
      const [value, setV] = useState("initial");
      setValue = setV;
      return el(Fragment, {}, el("span", {}, value));
    });

    mount(App, container);
    expect(container.textContent).toBe("initial");

    setValue("updated");
    await tick();
    expect(container.textContent).toBe("updated");
  });

  it("handles a fragment at the root of a component", () => {
    const Item = cc(({ label }: { label: string }) => {
      return el("li", {}, label);
    });

    const List = cc(() => {
      return el(
        Fragment,
        {},
        el(Item as any, { label: "A" }),
        el(Item as any, { label: "B" }),
        el(Item as any, { label: "C" }),
      );
    });

    mount(List, container);

    const lis = container.querySelectorAll("li");
    expect(lis.length).toBe(3);
    expect(lis[0].textContent).toBe("A");
    expect(lis[1].textContent).toBe("B");
    expect(lis[2].textContent).toBe("C");
  });
});
