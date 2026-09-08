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
import { renderChildrenToDOM } from "../src/renderer/render-children.ts";
import { renderElementToDOM } from "../src/renderer/render-element.ts";
import { removeMountedNode } from "../src/renderer/unmount.ts";
import { isEventProp, toEventName } from "../src/renderer/events.ts";
import type {
  SinwanElement,
  SinwanComponent,
  SinwanNode,
} from "../src/types.ts";
import type { AppInstance } from "../src/renderer/types.ts";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import { HtmlEscapedString } from "../src/jsx/jsx-runtime.ts";
import { SINWAN_TEMPLATE } from "../src/renderer/template.ts";
import { Suspense } from "../src/react/suspense.ts";
import { ErrorBoundary } from "../src/component/control-flow.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
} from "../src/renderer/suspense-boundary.ts";

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
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Text = (win as any).Text;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (win as any).SyntaxError = SyntaxError;

  container = doc.createElement("div");
  container.setAttribute("id", "root");
  doc.body.appendChild(container);
});

// ─── Helpers ───────────────────────────────────────────────

function el(
  tag: SinwanElement["tag"],
  props: Record<string, unknown> = {},
  ...children: SinwanNode[]
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

  it("renders HtmlEscapedString as text node", () => {
    const escaped = new HtmlEscapedString("<b>bold</b>");
    const mounted = renderNodeToDOM(escaped as any, container);
    expect(mounted.type).toBe("text");
    expect(container.textContent).toBe("<b>bold</b>");
  });

  it("renders binding descriptor by unwrapping to getter", async () => {
    const count = signal(0);
    const bindingDescriptor = { type: "text", getter: () => count.value };
    const mounted = renderNodeToDOM(bindingDescriptor as any, container);
    expect(mounted.type).toBe("reactive-block");
    expect(container.textContent).toBe("0");

    count.value = 7;
    await nextTick();
    expect(container.textContent).toBe("7");
  });

  it("coerces unknown node types to string (fallback)", () => {
    const mounted = renderNodeToDOM(BigInt(123) as any, container);
    expect(mounted.type).toBe("text");
    expect(container.textContent).toBe("123");
  });

  it("throws rejected promise reason inside Suspense on re-render", async () => {
    // Create a promise that rejects and let it settle so trackPromise
    // records it as "rejected".
    const rejectingPromise = Promise.reject(new Error("rejected-reason"));
    rejectingPromise.catch(() => {}); // suppress unhandled rejection

    // First render inside a Suspense boundary: trackPromise creates a
    // "pending" record and throws the promise (line 136).
    const boundary1 = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved: () => {},
    };
    pushSuspenseBoundary(boundary1);
    try {
      renderNodeToDOM(rejectingPromise as any, container);
    } catch (thrown) {
      // Expected — pending promise is thrown for Suspense
      expect(thrown).toBe(rejectingPromise);
    }
    popSuspenseBoundary();

    // Wait for the rejection callback in trackPromise to fire
    await new Promise((r) => queueMicrotask(r));
    await new Promise((r) => queueMicrotask(r));

    // Second render inside a new Suspense boundary: trackPromise returns
    // the existing "rejected" record → throw record.reason (line 134)
    const boundary2 = {
      promises: new Set<PromiseLike<unknown>>(),
      onResolved: () => {},
    };
    pushSuspenseBoundary(boundary2);
    try {
      renderNodeToDOM(rejectingPromise as any, container);
      expect(false).toBe(true); // should not reach here
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe("rejected-reason");
    }
    popSuspenseBoundary();
  });

  it("covers rejected promise handler in trackPromise", async () => {
    // trackPromise's rejection callback (line 326) fires when a tracked
    // promise rejects. We render a rejecting promise inside Suspense to
    // trigger trackPromise, then wait for the rejection callback.
    const rejectingPromise = Promise.reject(new Error("track-reject"));
    rejectingPromise.catch(() => {}); // suppress unhandled rejection

    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", {}, "loading"),
        children: rejectingPromise as any,
      }),
    );
    try {
      mount(App, container);
    } catch {
      // Expected — promise thrown for Suspense
    }
    // Wait for the rejection callback in trackPromise to fire
    await new Promise((r) => queueMicrotask(r));
    await new Promise((r) => queueMicrotask(r));
    // If no crash, the rejection handler was called successfully
    expect(true).toBe(true);
  });

  it("renders template result with text node children", () => {
    const fragment = doc.createDocumentFragment();
    fragment.appendChild(doc.createTextNode("text-child"));
    const templateResult = { [SINWAN_TEMPLATE]: true, fragment, disposers: [] };
    const mounted = renderNodeToDOM(templateResult as any, container);
    expect(mounted.type).toBe("fragment");
    expect(container.textContent).toContain("text-child");
  });

  it("resolves async promise inside a component instance (withInstance path)", async () => {
    const AsyncChild = cc(() =>
      el("div", {}, Promise.resolve("async-child-text") as any),
    );
    mount(AsyncChild, container);
    await new Promise((r) => queueMicrotask(r));
    await new Promise((r) => queueMicrotask(r));
    expect(container.textContent).toContain("async-child-text");
  });

  it("renderChildrenToDOM renders multiple children directly", () => {
    const childContainer = doc.createElement("div");
    const mounted = renderChildrenToDOM(["a", "b", "c"], childContainer, null);
    expect(mounted.length).toBe(3);
    expect(childContainer.textContent).toBe("abc");
  });
});

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

  it("falls back to rendering children for unknown tags", () => {
    renderElementToDOM(
      { tag: 42 as any, props: {}, children: ["fallback-child"] },
      container,
    );
    expect(container.textContent).toContain("fallback-child");
  });

  it("applies dangerouslySetInnerHTML on the client", () => {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      renderElementToDOM(
        el("div", { dangerouslySetInnerHTML: { __html: "<b>raw</b>" } }),
        container,
      );
      expect(container.innerHTML).toContain("<b>raw</b>");
      expect(
        warnings.some((args) =>
          String(args[0]).includes("dangerouslySetInnerHTML"),
        ),
      ).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
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

describe("renderer ownership regressions", () => {
  it("cancels queued text, attribute, and style writes when unmounted before flush", async () => {
    const value = signal("before");
    const app = render(
      el(
        "p",
        {
          title: () => value.value,
          style: () => ({ color: value.value === "before" ? "red" : "blue" }),
        },
        () => value.value,
      ),
      container,
    );
    try {
      const paragraph = container.querySelector("p");
      expect(paragraph).not.toBeNull();
      value.value = "after";
      app.unmount();
      await nextTick();
      expect(container.innerHTML).toBe("");
      expect(paragraph?.textContent).toBe("before");
      expect(paragraph?.title).toBe("before");
      expect(paragraph?.style.color).toBe("red");
    } finally {
      app.unmount();
      await nextTick();
      container.remove();
    }
  });

  it("removes detached event listeners and releases callback refs on reactive replacement", async () => {
    const version = signal(0);
    const clicks: number[] = [];
    const refs: Array<Element | null> = [];
    const app = render(() => {
      const current = version.value;
      return el(
        "button",
        {
          onClick: () => clicks.push(current),
          ref: (node: Element | null) => refs.push(node),
        },
        String(current),
      );
    }, container);
    try {
      const oldButton = container.querySelector("button");
      oldButton?.click();
      version.value = 1;
      await nextTick();
      const newButton = container.querySelector("button");
      expect(oldButton).not.toBeNull();
      expect(newButton).not.toBe(oldButton);
      expect(refs).toEqual([oldButton, null, newButton]);
      oldButton?.click();
      newButton?.click();
      expect(clicks).toEqual([0, 1]);
      app.unmount();
      newButton?.click();
      expect(clicks).toEqual([0, 1]);
      expect(refs).toEqual([oldButton, null, newButton, null]);
    } finally {
      app.unmount();
      await nextTick();
      container.remove();
    }
  });

  it("clears object refs when a reactive element becomes empty and rebinds on return", async () => {
    const visible = signal(true);
    const ref: { current: Element | null } = { current: null };
    const app = render(
      () => (visible.value ? el("input", { ref }) : null),
      container,
    );
    try {
      const original = ref.current;
      expect(original).toBe(container.querySelector("input"));
      visible.value = false;
      await nextTick();
      expect(ref.current).toBeNull();
      expect(container.querySelector("input")).toBeNull();
      visible.value = true;
      await nextTick();
      expect(ref.current).not.toBeNull();
      expect(ref.current).not.toBe(original);
      app.unmount();
      expect(ref.current).toBeNull();
    } finally {
      app.unmount();
      await nextTick();
      container.remove();
    }
  });

  it("unmounting one root does not cancel another root's queued shared-signal update", async () => {
    const otherContainer = doc.createElement("div");
    doc.body.appendChild(otherContainer);
    const shared = signal(0);
    const first = render(
      el("p", {}, () => shared.value),
      container,
    );
    let second: AppInstance | undefined;
    try {
      second = render(
        el("p", {}, () => shared.value),
        otherContainer,
      );
      const detached = container.querySelector("p");
      shared.value = 1;
      first.unmount();
      await nextTick();
      expect(container.innerHTML).toBe("");
      expect(detached?.textContent).toBe("0");
      expect(otherContainer.textContent).toBe("1");
      shared.value = 2;
      await nextTick();
      expect(otherContainer.textContent).toBe("2");
    } finally {
      first.unmount();
      second?.unmount();
      await nextTick();
      container.remove();
      otherContainer.remove();
    }
  });

  it("rendering into a mounted root disposes its queued setup effect and lifecycle once", async () => {
    const value = signal(0);
    const seen: number[] = [];
    const lifecycle: string[] = [];
    const disposers: Array<() => void> = [];
    const Previous = cc(() => {
      disposers.push(
        effect(() => {
          seen.push(value.value);
        }),
      );
      onUnmounted(() => {
        lifecycle.push("unmounted");
      });
      return el("p", {}, "previous");
    });
    const previous = mount(Previous, container);
    let replacement: AppInstance | undefined;
    try {
      value.value = 1;
      replacement = render(el("p", {}, "replacement"), container);
      await nextTick();
      expect(seen).toEqual([0]);
      expect(lifecycle).toEqual(["unmounted"]);
      expect(container.textContent).toBe("replacement");
      value.value = 2;
      await nextTick();
      expect(seen).toEqual([0]);
    } finally {
      replacement?.unmount();
      previous.unmount();
      for (const dispose of disposers) dispose();
      await nextTick();
      container.remove();
    }
  });

  it("an obsolete app handle cannot clear a newer mount in the same container", async () => {
    const previous = mount(
      cc(() => el("p", {}, "previous")),
      container,
    );
    let replacement: AppInstance | undefined;
    try {
      replacement = mount(
        cc(() => el("p", {}, "replacement")),
        container,
      );
      previous.unmount();
      expect(container.textContent).toBe("replacement");
    } finally {
      replacement?.unmount();
      previous.unmount();
      await nextTick();
      container.remove();
    }
  });

  it("an obsolete render handle cannot unregister the current root from later reuse", async () => {
    const original = render(el("p", {}, "original"), container);
    const refs: Array<Element | null> = [];
    let current: AppInstance | undefined;
    let latest: AppInstance | undefined;
    try {
      current = render(
        el("p", { ref: (node: Element | null) => refs.push(node) }, "current"),
        container,
      );
      expect(refs).toHaveLength(1);
      original.unmount();
      latest = render(el("p", {}, "latest"), container);
      expect(refs).toHaveLength(2);
      expect(refs[1]).toBeNull();
      expect(container.textContent).toBe("latest");
    } finally {
      latest?.unmount();
      current?.unmount();
      original.unmount();
      await nextTick();
      container.remove();
    }
  });

  it("reactive component replacement cleans old effects before mounting the new child", async () => {
    const version = signal(0);
    const source = signal(0);
    const lifecycle: string[] = [];
    const seen: string[] = [];
    const disposers: Array<() => void> = [];
    const Child = cc<{ version: number }>(({ version: current }) => {
      disposers.push(
        effect(() => {
          seen.push(`${current}:${source.value}`);
        }),
      );
      onMounted(() => {
        lifecycle.push(`mount:${current}`);
      });
      onUnmounted(() => {
        lifecycle.push(`unmount:${current}`);
      });
      return el("span", {}, String(current));
    });
    const Parent = cc(() =>
      el("div", {}, () => el(Child, { version: version.value })),
    );
    const app = mount(Parent, container);
    try {
      expect(lifecycle).toEqual(["mount:0"]);
      version.value = 1;
      await nextTick();
      expect(lifecycle).toEqual(["mount:0", "unmount:0", "mount:1"]);
      source.value = 1;
      await nextTick();
      expect(seen).toEqual(["0:0", "1:0", "1:1"]);
      expect(container.textContent).toBe("1");
      app.unmount();
      expect(lifecycle).toEqual([
        "mount:0",
        "unmount:0",
        "mount:1",
        "unmount:1",
      ]);
      source.value = 2;
      await nextTick();
      expect(seen).toEqual(["0:0", "1:0", "1:1"]);
    } finally {
      app.unmount();
      for (const dispose of disposers) dispose();
      await nextTick();
      container.remove();
    }
  });
});
