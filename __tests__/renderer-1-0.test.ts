/**
 * SinwanJS Renderer 1.0.0 — Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { renderElementToDOM } from "../src/renderer/render-element.ts";
import { domOps, resetDOMOps, setDOMOps } from "../src/renderer/dom-ops.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import { removeMountedNode, unmountNode } from "../src/renderer/unmount.ts";
import { HtmlEscapedString } from "../src/jsx/jsx-runtime.ts";
import {
  _$createTemplate,
  _$bindAttr,
  walkToSlot,
  isTemplateResult,
} from "../src/renderer/template.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import type { MountedComponent } from "../src/renderer/types.ts";
import {
  pushSuspenseBoundary,
  popSuspenseBoundary,
} from "../src/renderer/suspense-boundary.ts";
import { cc } from "../src/component/create.ts";
import { onUpdated } from "../src/component/lifecycle.ts";
import { Show } from "../src/component/control-flow.ts";
import type { SinwanElement } from "../src/types.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Text = (win as any).Text;

  container = doc.createElement("div");
  doc.body.appendChild(container);
  resetDOMOps();
});

afterEach(() => {
  resetDOMOps();
});

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

function byTag(parent: Node, tag: string): HTMLElement[] {
  return Array.from(
    (parent as HTMLElement).getElementsByTagName(tag),
  ) as unknown as HTMLElement[];
}

describe("public refs", () => {
  it("sets callback and object refs on mount and clears them on unmount", () => {
    const calls: Array<Element | null> = [];
    const objectRef: { current: Element | null } = { current: null };

    const App = cc(() =>
      el(
        "section",
        { ref: objectRef },
        el("button", { ref: (node: Element | null) => calls.push(node) }, "ok"),
      ),
    );

    const app = mount(App, container);
    expect(objectRef.current?.tagName).toBe("SECTION");
    expect(calls[0]?.tagName).toBe("BUTTON");

    app.unmount();
    expect(objectRef.current).toBeNull();
    expect(calls[calls.length - 1]).toBeNull();
  });
});

describe("namespaced DOM creation", () => {
  it("creates SVG and MathML descendants in the correct namespace", () => {
    renderElementToDOM(
      el(
        "div",
        {},
        el("svg", {}, el("circle", {}), el("foreignObject", {}, el("div", {}))),
        el("math", {}, el("mi", {}, "x")),
      ),
      container,
    );

    const svg = byTag(container, "svg")[0]!;
    const circle = byTag(container, "circle")[0]!;
    const foreignObject = byTag(container, "foreignObject")[0]!;
    const htmlDiv = foreignObject.firstChild as Element;
    const math = byTag(container, "math")[0]!;
    const mi = byTag(container, "mi")[0]!;

    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(foreignObject.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(htmlDiv.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(math.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
    expect(mi.namespaceURI).toBe("http://www.w3.org/1998/Math/MathML");
  });
});

describe("pluggable domOps", () => {
  it("customizes creation methods and resetDOMOps restores defaults", () => {
    const created: string[] = [];
    setDOMOps({
      createElement(tag: string): Element {
        created.push(tag);
        return doc.createElement(tag);
      },
    });

    renderElementToDOM(el("article", {}, "custom"), container);
    expect(created).toEqual(["article"]);

    resetDOMOps();
    renderElementToDOM(el("section", {}, "native"), container);
    expect(created).toEqual(["article"]);
  });

  it("uses default setTextContent, parentNode, and nextSibling", () => {
    const parent = doc.createElement("div");
    const first = doc.createTextNode("hello");
    const second = doc.createElement("span");
    parent.appendChild(first);
    parent.appendChild(second);

    expect(domOps.parentNode(first)).toBe(parent);
    expect(domOps.nextSibling(first)).toBe(second);

    domOps.setTextContent(first, "world");
    expect(first.data).toBe("world");
  });
});

describe("onUpdated scheduling", () => {
  it("fires after reactive text, attributes, and control-flow updates only", async () => {
    const count = signal(0);
    const className = signal("cold");
    const visible = signal(false);
    let updates = 0;

    const App = cc(() => {
      onUpdated(() => {
        updates++;
      });
      return el(
        "div",
        { class: className as any },
        "Count ",
        count as any,
        el(Show, {
          when: visible,
          fallback: el("span", {}, "off"),
          children: el("strong", {}, "on"),
        }),
      );
    });

    mount(App, container);
    await nextTick();
    expect(updates).toBe(0);

    count.value = 1;
    await nextTick();
    expect(updates).toBe(1);

    count.value = 2;
    className.value = "warm";
    await nextTick();
    expect(updates).toBe(2);

    visible.value = true;
    await nextTick();
    expect(updates).toBe(3);
    expect(container.textContent).toContain("on");
  });
});

describe("template attr slots and walkToSlot", () => {
  it("binds static, reactive, and descriptor attribute slots", async () => {
    const title = signal("one");
    const def: TemplateDef = {
      html: '<div title="" class="" id=""></div>',
      slots: [
        { path: [], type: "attr", name: "title" },
        { path: [], type: "attr", name: "class" },
        { path: [], type: "attr", name: "id" },
      ],
    };

    const result = _$createTemplate(def, [
      title,
      "static-class",
      _$bindAttr("id", () => "bound-id"),
    ]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const el = container.querySelector("div")!;
    expect(el.getAttribute("title")).toBe("one");
    expect(el.getAttribute("class")).toBe("static-class");
    expect(el.getAttribute("id")).toBe("bound-id");

    title.value = "two";
    await nextTick();
    expect(el.getAttribute("title")).toBe("two");

    for (const dispose of result.disposers) dispose();
  });

  it("shows a hoisted input default as the current value", () => {
    const def: TemplateDef = {
      html: '<input name="endpoint" value="/api/hello" />',
      slots: [],
    };
    const result = _$createTemplate(def, []);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("/api/hello");
  });

  it("applies a defaultValue attr slot as the input value", () => {
    const def: TemplateDef = {
      html: '<input value="" />',
      slots: [{ path: [], type: "attr", name: "defaultValue" }],
    };
    const result = _$createTemplate(def, ["/api/hello"]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("/api/hello");
  });

  it("applies a defaultValue attr slot as the selected option", () => {
    const def: TemplateDef = {
      html: '<select><option value="a">A</option><option value="b">B</option></select>',
      slots: [{ path: [], type: "attr", name: "defaultValue" }],
    };
    const result = _$createTemplate(def, ["b"]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("b");
  });

  it("throws when the template fragment is empty", () => {
    const empty = document.createDocumentFragment();
    expect(() =>
      walkToSlot(empty, [0], { html: "", slots: [] }),
    ).toThrow("template fragment has no children");
  });

  it("throws when a slot path has no child at the requested index", () => {
    const def: TemplateDef = { html: "<div></div>", slots: [] };
    const template = document.createElement("template");
    template.innerHTML = def.html;
    expect(() => walkToSlot(template.content, [3], def)).toThrow(
      "no child at index 3",
    );
  });
});

describe("unmount anonymous component nodes", () => {
  it("runs disposers when a component node has no instance", () => {
    let disposed = false;
    const node: MountedComponent = {
      type: "component",
      children: [],
      disposers: [
        () => {
          disposed = true;
        },
      ],
      instance: null,
    };
    unmountNode(node);
    expect(disposed).toBe(true);
  });
});
