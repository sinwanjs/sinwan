/**
 * SinwanJS Client Renderer — Unit Tests
 *
 * Tests the DOM renderer using happy-dom for DOM simulation.
 * Run with: bun test src/client/renderer/__tests__/renderer.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  signal,
  computed,
  effect,
  nextTick,
  batch,
} from "../src/reactivity/index.ts";
import { mount, render, unmountNode } from "../src/renderer/mount.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import { renderElementToDOM } from "../src/renderer/render-element.ts";
import { removeMountedNode } from "../src/renderer/unmount.ts";
import { isEventProp, toEventName } from "../src/renderer/events.ts";
import type { SinwanElement, SinwanComponent } from "../src/types.ts";
import { cc } from "../src/component/create.ts";

// ─── DOM setup ─────────────────────────────────────────────

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;

  // Patch globals so domOps uses happy-dom
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;

  container = doc.createElement("div");
  container.setAttribute("id", "root");
  doc.body.appendChild(container);
});

// ─── Helpers ───────────────────────────────────────────────

function el(
  tag: string,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

/** Get the first child element of a node. */
function firstEl(node: Node): HTMLElement {
  return node.childNodes[0] as unknown as HTMLElement;
}

/** Get child elements by tag name. */
function byTag(parent: Node, tag: string): HTMLElement[] {
  return Array.from(
    (parent as HTMLElement).getElementsByTagName(tag),
  ) as unknown as HTMLElement[];
}

// ─── Event helpers ─────────────────────────────────────────

describe("event helpers", () => {
  it("isEventProp detects on* props", () => {
    expect(isEventProp("onClick")).toBe(true);
    expect(isEventProp("onMouseEnter")).toBe(true);
    expect(isEventProp("on")).toBe(false);
    expect(isEventProp("onclick")).toBe(true); // Supported for stress tests
    expect(isEventProp("class")).toBe(false);
  });

  it("toEventName converts prop to event name", () => {
    expect(toEventName("onClick")).toBe("click");
    expect(toEventName("onMouseEnter")).toBe("mouseenter");
  });
});

// ─── renderNodeToDOM ───────────────────────────────────────

describe("renderNodeToDOM", () => {
  it("renders strings as text nodes", () => {
    const mounted = renderNodeToDOM("Hello", container);
    expect(mounted.type).toBe("text");
    expect(container.textContent).toBe("Hello");
  });

  it("renders numbers as text nodes", () => {
    renderNodeToDOM(42, container);
    expect(container.textContent).toBe("42");
  });

  it("renders null/undefined/boolean as empty text", () => {
    renderNodeToDOM(null, container);
    renderNodeToDOM(undefined, container);
    renderNodeToDOM(true, container);
    expect(container.textContent).toBe("");
  });

  it("renders signals as reactive text nodes", async () => {
    const count = signal(0);
    const mounted = renderNodeToDOM(count as any, container);
    expect(mounted.type).toBe("reactive-block");
    expect(container.textContent).toBe("0");

    count.value = 5;
    await nextTick();
    expect(container.textContent).toBe("5");
  });

  it("renders computed as reactive text nodes", async () => {
    const count = signal(3);
    const doubled = computed(() => count.value * 2);

    renderNodeToDOM(doubled as any, container);
    expect(container.textContent).toBe("6");

    count.value = 10;
    await nextTick();
    expect(container.textContent).toBe("20");
  });

  it("renders arrays as fragments", () => {
    renderNodeToDOM(["Hello", " ", "World"], container);
    expect(container.textContent).toBe("Hello World");
  });

  it("renders a resolved promise as an async node", async () => {
    const promise = Promise.resolve("async text");
    const mounted = renderNodeToDOM(promise as any, container);
    expect(mounted.type).toBe("async");
    expect(container.textContent).toBe("");

    await new Promise((r) => queueMicrotask(r));
    expect(container.textContent).toBe("async text");
  });

  it("renders a resolved promise to an element", async () => {
    const promise = Promise.resolve(el("span", {}, "async span"));
    const mounted = renderNodeToDOM(promise as any, container);
    expect(mounted.type).toBe("async");

    await new Promise((r) => queueMicrotask(r));
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span!.textContent).toBe("async span");
  });

  it("renders a resolved promise to a fragment", async () => {
    const promise = Promise.resolve(["a", "b", "c"]);
    const mounted = renderNodeToDOM(promise as any, container);
    expect(mounted.type).toBe("async");

    await new Promise((r) => queueMicrotask(r));
    expect(container.textContent).toBe("abc");
  });

  it("unmounts async node before resolution safely", async () => {
    let resolve!: (v: string) => void;
    const promise = new Promise<string>((r) => {
      resolve = r;
    });
    const mounted = renderNodeToDOM(promise as any, container);
    expect(mounted.type).toBe("async");

    removeMountedNode(mounted);
    expect(container.innerHTML).toBe("");

    resolve("should not appear");
    await new Promise((r) => queueMicrotask(r));
    expect(container.textContent).toBe("");
  });

  it("unmounts async node after resolution safely", async () => {
    const promise = Promise.resolve(el("div", {}, "resolved"));
    const mounted = renderNodeToDOM(promise as any, container);
    await new Promise((r) => queueMicrotask(r));

    expect(container.textContent).toBe("resolved");
    removeMountedNode(mounted);
    expect(container.innerHTML).toBe("");
  });
});

// ─── renderElementToDOM ────────────────────────────────────

describe("renderElementToDOM", () => {
  it("renders intrinsic element", () => {
    const element = el("div", { class: "test" }, "Hello");
    renderElementToDOM(element, container);

    const div = firstEl(container);
    expect(div.tagName).toBe("DIV");
    expect(div.getAttribute("class")).toBe("test");
    expect(div.textContent).toBe("Hello");
  });

  it("renders nested elements", () => {
    const element = el(
      "div",
      {},
      el("h1", {}, "Title"),
      el("p", {}, "Content"),
    );
    renderElementToDOM(element, container);

    const h1s = byTag(container, "h1");
    const ps = byTag(container, "p");
    expect(h1s.length).toBe(1);
    expect(h1s[0]!.textContent).toBe("Title");
    expect(ps.length).toBe(1);
    expect(ps[0]!.textContent).toBe("Content");
  });

  it("renders void elements without children", () => {
    const element = el("input", { type: "text", placeholder: "Name" });
    renderElementToDOM(element, container);

    const inputs = byTag(container, "input");
    expect(inputs.length).toBe(1);
    expect(inputs[0]!.getAttribute("type")).toBe("text");
    expect(inputs[0]!.getAttribute("placeholder")).toBe("Name");
  });

  it("handles className → class alias", () => {
    const element = el("div", { className: "foo bar" });
    renderElementToDOM(element, container);

    const div = firstEl(container);
    expect(div.getAttribute("class")).toBe("foo bar");
  });

  it("handles boolean attributes", () => {
    const element = el("input", { disabled: true });
    renderElementToDOM(element, container);

    const input = byTag(container, "input")[0]!;
    expect(input.hasAttribute("disabled")).toBe(true);
  });

  it("renders fragments (empty tag)", () => {
    const fragment: SinwanElement = {
      tag: "",
      props: {},
      children: ["A", "B", "C"],
    };
    renderElementToDOM(fragment, container);

    expect(container.textContent).toContain("ABC");
  });
});

// ─── Reactive attributes ──────────────────────────────────

describe("reactive attributes", () => {
  it("updates attribute when signal changes", async () => {
    const cls = signal("red");
    const element = el("div", { class: cls as any });
    renderElementToDOM(element, container);

    const div = firstEl(container);
    expect(div.getAttribute("class")).toBe("red");

    cls.value = "blue";
    await nextTick();
    expect(div.getAttribute("class")).toBe("blue");
  });

  it("replaces reactive style objects and removes obsolete keys", async () => {
    const styles = signal<Record<string, string>>({
      color: "red",
      backgroundColor: "black",
    });
    const element = el("div", { style: styles as any });
    renderElementToDOM(element, container);

    const div = firstEl(container) as HTMLDivElement;
    expect(div.style.color).toBe("red");
    expect(div.style.backgroundColor).toBe("black");

    styles.value = { color: "blue" };
    await nextTick();
    expect(div.style.color).toBe("blue");
    expect(div.style.backgroundColor).toBe("");
  });
});

// ─── Event binding ─────────────────────────────────────────

describe("event binding", () => {
  it("binds onClick handlers", () => {
    let clicked = false;
    const element = el(
      "button",
      {
        onClick: () => {
          clicked = true;
        },
      },
      "Click me",
    );
    renderElementToDOM(element, container);

    const button = byTag(container, "button")[0]!;
    button.click();
    expect(clicked).toBe(true);
  });
});

// ─── Reactive children (signals in JSX) ───────────────────

describe("reactive children", () => {
  it("signal in children updates text", async () => {
    const name = signal("World");
    const element = el("p", {}, "Hello ", name as any, "!");
    renderElementToDOM(element, container);

    const p = byTag(container, "p")[0]!;
    expect(p.textContent).toBe("Hello World!");

    name.value = "Sinwan";
    await nextTick();
    expect(p.textContent).toBe("Hello Sinwan!");
  });

  it("computed in children updates text", async () => {
    const count = signal(2);
    const doubled = computed(() => count.value * 2);
    const element = el("span", {}, "Result: ", doubled as any);
    renderElementToDOM(element, container);

    const span = byTag(container, "span")[0]!;
    expect(span.textContent).toBe("Result: 4");

    count.value = 5;
    await nextTick();
    expect(span.textContent).toBe("Result: 10");
  });
});

// ─── mount() ───────────────────────────────────────────────

describe("mount", () => {
  it("mounts a component and renders to DOM", () => {
    const Greeting = cc<{ name: string }>(({ name }) => {
      return el("h1", {}, "Hello ", name, "!");
    });

    const app = mount(Greeting, container, { name: "World" });
    const h1 = byTag(container, "h1")[0]!;
    expect(h1.textContent).toBe("Hello World!");
    expect(app.root).toBeDefined();
  });

  it("unmount cleans the container", () => {
    const Simple = cc(() => el("div", {}, "content"));
    const app = mount(Simple, container);

    expect(byTag(container, "div").length).toBe(1);

    app.unmount();
    expect(container.innerHTML).toBe("");
  });

  it("interactive counter scenario", async () => {
    const Counter = cc<{ initial?: number }>(({ initial = 0 }) => {
      const count = signal(initial as number);
      return el(
        "div",
        {},
        el("span", {}, count as any),
        el(
          "button",
          {
            onClick: () => {
              count.value++;
            },
          },
          "+",
        ),
        el(
          "button",
          {
            onClick: () => {
              count.value--;
            },
          },
          "-",
        ),
      );
    });

    mount(Counter, container, { initial: 5 });

    const span = byTag(container, "span")[0]!;
    const buttons = byTag(container, "button");
    const incBtn = buttons[0]!;
    const decBtn = buttons[1]!;

    expect(span.textContent).toBe("5");

    // Click increment
    incBtn.click();
    await nextTick();
    expect(span.textContent).toBe("6");

    // Click increment again
    incBtn.click();
    await nextTick();
    expect(span.textContent).toBe("7");

    // Click decrement
    decBtn.click();
    await nextTick();
    expect(span.textContent).toBe("6");
  });

  it("computed + signal reactive scenario", async () => {
    const App = cc(() => {
      const price = signal(100);
      const qty = signal(2);
      const total = computed(() => price.value * qty.value);

      return el(
        "div",
        {},
        el("span", {}, "Total: ", total as any),
        el(
          "button",
          {
            onClick: () => {
              qty.value++;
            },
          },
          "Add",
        ),
      );
    });

    mount(App, container);

    const span = byTag(container, "span")[0]!;
    expect(span.textContent).toBe("Total: 200");

    const button = byTag(container, "button")[0]!;
    button.click();
    await nextTick();
    expect(span.textContent).toBe("Total: 300");
  });
});

// ─── mount() edge cases ──────────────────────────────────

describe("mount edge cases", () => {
  it("mounts an async component and swaps placeholder on resolve", async () => {
    const AsyncComp = cc(async () => {
      await Promise.resolve();
      return el("span", {}, "async content");
    });

    const app = mount(AsyncComp, container);
    expect(container.textContent).toBe("");

    await new Promise((r) => queueMicrotask(r));
    expect(container.textContent).toBe("async content");
    expect(container.querySelector("span")).toBeTruthy();

    app.unmount();
    expect(container.innerHTML).toBe("");
  });

  it("handles rejected async components", async () => {
    let consoleErrors: any[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => consoleErrors.push(args);

    const AsyncComp = cc(async () => {
      throw new Error("async boom");
    });

    const app = mount(AsyncComp, container);
    expect(container.textContent).toBe("");

    await new Promise((r) => queueMicrotask(r));
    expect(container.innerHTML).toBe("");

    console.error = originalConsoleError;
    expect(
      consoleErrors.some((args) =>
        args.some(
          (a: any) =>
            (typeof a === "string" && a.includes("async boom")) ||
            (a instanceof Error && a.message.includes("async boom")),
        ),
      ),
    ).toBe(true);

    app.unmount();
  });

  it("handles sync component errors and returns empty root", () => {
    let consoleErrors: any[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => consoleErrors.push(args);

    const ErrorComp = cc(() => {
      throw new Error("sync boom");
    });

    const app = mount(ErrorComp, container);
    expect(container.innerHTML).toBe("");

    console.error = originalConsoleError;
    expect(
      consoleErrors.some((args) =>
        args.some(
          (a: any) =>
            (typeof a === "string" && a.includes("sync boom")) ||
            (a instanceof Error && a.message.includes("sync boom")),
        ),
      ),
    ).toBe(true);

    app.unmount();
    expect(container.innerHTML).toBe("");
  });

  it("supports identifierPrefix option", () => {
    const IdComp = cc(() => {
      return el("div", {}, "hello");
    });

    const app = mount(IdComp, container, {}, { identifierPrefix: "myApp" });
    expect(app.root).toBeDefined();
  });
});

// ─── render() ──────────────────────────────────────────────

describe("render", () => {
  it("renders a raw node tree into a container", () => {
    const app = render(el("p", {}, "raw node"), container);
    expect(container.textContent).toBe("raw node");
    expect(app.root).toBeDefined();
  });

  it("unmount cleans the container", () => {
    const app = render(["a", "b", "c"], container);
    expect(container.textContent).toBe("abc");
    app.unmount();
    expect(container.innerHTML).toBe("");
  });
});

// ─── unmount cleanup ───────────────────────────────────────

describe("unmount cleanup", () => {
  it("disposes reactive text effects on unmount", async () => {
    const count = signal(0);
    let effectRunCount = 0;

    const App = cc(() => {
      const tracked = computed(() => {
        effectRunCount++;
        return count.value;
      });
      return el("div", {}, tracked as any);
    });

    const app = mount(App, container);
    const initialRuns = effectRunCount;

    app.unmount();

    // Changing the signal should NOT trigger effects anymore
    count.value = 99;
    await nextTick();
    expect(effectRunCount).toBe(initialRuns);
  });
});
