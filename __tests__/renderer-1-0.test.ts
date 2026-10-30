/**
 * SinwanJS Renderer 1.0.0 — Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import {
  getParentNamespace,
  renderElementToDOM,
} from "../src/renderer/render-element.ts";
import { domOps, resetDOMOps, setDOMOps } from "../src/renderer/dom-ops.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import {
  removeMountedNode,
  unmountNode,
  getMountedDomRoot,
} from "../src/renderer/unmount.ts";
import { HtmlEscapedString } from "../src/jsx/jsx-runtime.ts";
import {
  _$createTemplate,
  _$bindAttr,
  _$bindText,
  walkToSlot,
  isTemplateResult,
} from "../src/renderer/template.ts";
import {
  bindDelegatedEvent,
  ensureDelegated,
  bindEvent,
  bindEvents,
  isEventProp,
  toEventName,
  __resetDelegatedEventsForTests,
} from "../src/renderer/events.ts";
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
import { setSingleAttribute } from "../src/renderer/attributes.ts";
import { assignClassName } from "../src/renderer/set-attribute.ts";

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

function isDispatchableEvent(value: unknown): value is Event {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "bubbles" in value &&
    typeof value.bubbles === "boolean" &&
    "stopPropagation" in value &&
    typeof value.stopPropagation === "function" &&
    "currentTarget" in value
  );
}

function windowEvent(type: string, init: { bubbles: boolean }): Event {
  const event: unknown = new win.Event(type, init);
  if (!isDispatchableEvent(event)) {
    throw new Error(`expected a ${type} event`);
  }
  return event;
}

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

  it("writes SVG presentation attributes under their attribute names", async () => {
    const shape = signal("M0 0 L10 10Z");
    renderElementToDOM(
      el(
        "svg",
        { viewBox: "0 0 10 10" },
        el(
          "g",
          { fill: "url(#brand)", "fill-rule": "evenodd" },
          el("path", {
            d: () => shape.value,
            stroke: "currentColor",
            "stroke-width": 2,
            "stroke-linecap": "round",
          }),
        ),
      ),
      container,
    );

    const g = byTag(container, "g")[0]!;
    const path = byTag(container, "path")[0]!;
    expect(path.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(g.getAttribute("fill")).toBe("url(#brand)");
    expect(g.getAttribute("fill-rule")).toBe("evenodd");
    expect(path.getAttribute("d")).toBe("M0 0 L10 10Z");
    expect(path.getAttribute("stroke")).toBe("currentColor");
    expect(path.getAttribute("stroke-width")).toBe("2");
    expect(path.getAttribute("stroke-linecap")).toBe("round");

    shape.value = "M1 1 L9 9Z";
    await nextTick();
    expect(path.getAttribute("d")).toBe("M1 1 L9 9Z");
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
    expect(() => walkToSlot(empty, [0], { html: "", slots: [] })).toThrow(
      "template fragment has no children",
    );
  });

  it("throws when a slot path has no child at the requested index", () => {
    const def: TemplateDef = { html: "<div></div>", slots: [] };
    const template = document.createElement("template");
    template.innerHTML = def.html;
    expect(() => walkToSlot(template.content, [3], def)).toThrow(
      "no child at index 3",
    );
  });

  it("walks to a later sibling via nextSibling when path index > 0", () => {
    const def: TemplateDef = {
      html: "<div><span>a</span><span>b</span></div>",
      slots: [],
    };
    const template = document.createElement("template");
    template.innerHTML = def.html;
    const node = walkToSlot(template.content, [1], def);
    expect(node.textContent).toBe("b");
  });

  it("resolves a single DOM root for element and fragment rows", () => {
    const elNode = document.createElement("tr");
    expect(
      getMountedDomRoot({
        type: "element",
        node: elNode,
        children: [],
        eventCleanups: null,
        attrDisposers: null,
        refCleanup: null,
      })!.nodeName,
    ).toBe("TR");

    const text = document.createTextNode("x");
    expect(getMountedDomRoot({ type: "text", node: text })).toBe(text);

    expect(
      getMountedDomRoot({
        type: "fragment",
        children: [
          {
            type: "element",
            node: elNode,
            children: [],
            eventCleanups: null,
            attrDisposers: null,
            refCleanup: null,
          },
        ],
      }),
    ).toBe(elNode);

    expect(
      getMountedDomRoot({
        type: "fragment",
        children: [
          { type: "text", node: text },
          {
            type: "element",
            node: elNode,
            children: [],
            eventCleanups: null,
            attrDisposers: null,
            refCleanup: null,
          },
        ],
      }),
    ).toBeNull();

    expect(
      getMountedDomRoot({
        type: "component",
        children: [
          {
            type: "element",
            node: elNode,
            children: [],
            eventCleanups: null,
            attrDisposers: null,
            refCleanup: null,
          },
        ],
        disposers: [],
        instance: null,
      }),
    ).toBe(elNode);

    expect(
      getMountedDomRoot({
        type: "component",
        children: [
          { type: "text", node: text },
          {
            type: "element",
            node: elNode,
            children: [],
            eventCleanups: null,
            attrDisposers: null,
            refCleanup: null,
          },
        ],
        disposers: [],
        instance: null,
      }),
    ).toBeNull();

    expect(
      getMountedDomRoot({
        type: "portal",
        children: [],
        target: document.body,
        anchor: document.createComment("p"),
      } as any),
    ).toBeNull();
  });

  it("renders bindText children that resolve to a node tree", () => {
    const def: TemplateDef = {
      html: '<div data-slot="menubar"><!--s:0--></div>',
      slots: [{ path: [0], type: "child" }],
    };
    const menus = [
      { tag: "button", props: {}, children: ["File"] },
      { tag: "button", props: {}, children: ["Edit"] },
      { tag: "button", props: {}, children: ["View"] },
    ];
    const result = _$createTemplate(def, [_$bindText(() => menus)]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const root = container.querySelector("[data-slot=menubar]")!;
    expect(root.textContent).not.toContain("[object Object]");
    expect(
      [...root.querySelectorAll("button")].map((el) => el.textContent),
    ).toEqual(["File", "Edit", "View"]);
    for (const dispose of result.disposers) dispose();
  });

  it("renders template child slots in the namespace of their parent", () => {
    const SVG = "http://www.w3.org/2000/svg";
    const HTML = "http://www.w3.org/1999/xhtml";
    const def: TemplateDef = {
      html:
        '<div><svg viewBox="0 0 10 10"><g data-slot="static"><!--s:0--></g>' +
        '<g data-slot="text"><!--s:1--></g><g data-slot="getter"><!--s:2--></g>' +
        "<foreignObject><!--s:3--></foreignObject></svg><!--s:4--></div>",
      slots: [
        { path: [0, 0, 0], type: "child" },
        { path: [0, 1, 0], type: "child" },
        { path: [0, 2, 0], type: "child" },
        { path: [0, 3, 0], type: "child" },
        { path: [1], type: "child" },
      ],
    };
    const path = (d: string) => ({ tag: "path", props: { d }, children: [] });
    const result = _$createTemplate(def, [
      [path("M0 0Z"), path("M1 1Z")],
      _$bindText(() => path("M2 2Z")),
      () => path("M3 3Z"),
      { tag: "div", props: {}, children: ["html"] },
      { tag: "span", props: {}, children: ["after"] },
    ]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);

    const paths = [...container.querySelectorAll("g > path")];
    expect(paths.map((el) => el.getAttribute("d"))).toEqual([
      "M0 0Z",
      "M1 1Z",
      "M2 2Z",
      "M3 3Z",
    ]);
    expect(paths.map((el) => el.namespaceURI)).toEqual([SVG, SVG, SVG, SVG]);
    expect(container.querySelector("foreignObject > div")?.namespaceURI).toBe(
      HTML,
    );
    expect(container.querySelector("div > span")?.namespaceURI).toBe(HTML);
    for (const dispose of result.disposers) dispose();
  });

  it("derives the child namespace from an existing parent node", () => {
    const SVG = "http://www.w3.org/2000/svg";
    const MATHML = "http://www.w3.org/1998/Math/MathML";
    expect(getParentNamespace(doc.createElementNS(SVG, "g"))).toBe(SVG);
    expect(getParentNamespace(doc.createElementNS(SVG, "foreignObject"))).toBeNull();
    expect(getParentNamespace(doc.createElementNS(MATHML, "math"))).toBe(MATHML);
    expect(getParentNamespace(doc.createElement("div"))).toBeNull();
    expect(getParentNamespace(doc.createDocumentFragment())).toBeNull();
  });

  it("parses templates whose root is an SVG element as SVG", () => {
    const SVG = "http://www.w3.org/2000/svg";
    const HTML = "http://www.w3.org/1999/xhtml";
    const render = (def: TemplateDef, dynamics: unknown[]) => {
      const result = _$createTemplate(def, dynamics);
      if (!isTemplateResult(result)) {
        throw new Error("expected a client template result");
      }
      const host = doc.createElement("div");
      host.appendChild(result.fragment);
      return host;
    };

    const path = render(
      { html: '<path d=""></path>', slots: [{ path: [], type: "attr", name: "d" }] },
      ["M0 0Z"],
    ).firstElementChild!;
    expect(path.namespaceURI).toBe(SVG);
    expect(path.getAttribute("d")).toBe("M0 0Z");

    const gradient = render(
      {
        html: '<linearGradient gradientUnits="userSpaceOnUse"><stop offset="0"></stop></linearGradient>',
        slots: [],
      },
      [],
    ).firstElementChild!;
    expect(gradient.namespaceURI).toBe(SVG);
    expect(gradient.localName).toBe("linearGradient");
    expect(gradient.getAttribute("gradientUnits")).toBe("userSpaceOnUse");
    expect(gradient.firstElementChild?.namespaceURI).toBe(SVG);

    const siblings = render({ html: "<circle></circle><rect></rect>", slots: [] }, []);
    expect([...siblings.children].map((el) => el.namespaceURI)).toEqual([SVG, SVG]);

    const ambiguous = render({ html: '<a href="/x"></a>', slots: [] }, []);
    expect(ambiguous.firstElementChild?.namespaceURI).toBe(HTML);
    const html = render({ html: "<div><path></path></div>", slots: [] }, []);
    expect(html.firstElementChild?.namespaceURI).toBe(HTML);
  });

  it("keeps bindText scalar children as live text", async () => {
    const label = signal("inspector");
    const def: TemplateDef = {
      html: "<p><!--s:0--></p>",
      slots: [{ path: [0], type: "child" }],
    };
    const result = _$createTemplate(def, [_$bindText(() => label.value)]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    expect(container.textContent).toBe("inspector");
    label.value = "console";
    await nextTick();
    expect(container.textContent).toBe("console");
    for (const dispose of result.disposers) dispose();
  });
});

describe("template event delegation", () => {
  it("registers one document click listener and fires row handlers", () => {
    const clicks: string[] = [];
    const def: TemplateDef = {
      html: '<button type="button"></button>',
      slots: [{ path: [], type: "event", name: "onclick" }],
    };

    const a = _$createTemplate(def, [() => clicks.push("a")]);
    const b = _$createTemplate(def, [() => clicks.push("b")]);
    if (!isTemplateResult(a) || !isTemplateResult(b)) {
      throw new Error("expected client template results");
    }
    container.appendChild(a.fragment);
    container.appendChild(b.fragment);

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect((buttons[0] as any).$$click).toBeTypeOf("function");
    expect((buttons[1] as any).$$click).toBeTypeOf("function");

    buttons[0]!.dispatchEvent(windowEvent("click", { bubbles: true }));
    buttons[1]!.dispatchEvent(windowEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["a", "b"]);
    // Reading currentTarget exercises the delegated getter
    const probe = windowEvent("click", { bubbles: true });
    const seen: { current: EventTarget | null } = { current: null };
    (buttons[0] as any).$$click = (e: Event) => {
      seen.current = e.currentTarget;
    };
    buttons[0]!.dispatchEvent(probe);
    expect(seen.current).toBe(buttons[0]);

    for (const dispose of a.disposers) dispose();
    for (const dispose of b.disposers) dispose();
    expect((buttons[0] as any).$$click).toBeUndefined();
  });

  it("stops walking when a handler cancels the bubble", () => {
    const order: string[] = [];
    const outer = doc.createElement("div");
    const inner = doc.createElement("button");
    outer.appendChild(inner);
    container.appendChild(outer);

    __resetDelegatedEventsForTests();
    ensureDelegated("click", doc);
    const disposeOuter = bindDelegatedEvent(
      outer,
      "click",
      () => {
        order.push("outer");
      },
      doc,
    );
    const disposeInner = bindDelegatedEvent(
      inner,
      "click",
      (e) => {
        order.push("inner");
        e.stopPropagation();
      },
      doc,
    );

    inner.dispatchEvent(windowEvent("click", { bubbles: true }));
    expect(order).toEqual(["inner"]);

    disposeInner();
    disposeOuter();
  });

  it("fires delegated handlers when an ancestor stopPropagation on bubble", () => {
    const clicks: string[] = [];
    const panel = doc.createElement("div");
    const button = doc.createElement("button");
    panel.appendChild(button);
    container.appendChild(panel);

    __resetDelegatedEventsForTests();
    ensureDelegated("click", doc);
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    const dispose = bindDelegatedEvent(
      button,
      "click",
      () => {
        clicks.push("button");
      },
      doc,
    );

    button.dispatchEvent(windowEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["button"]);
    dispose();
  });

  it("binds events through the shared delegated model", () => {
    expect(isEventProp("onclick")).toBe(true);
    expect(toEventName("onclick")).toBe("click");
    const el = doc.createElement("button");
    container.appendChild(el);
    let clicked = 0;
    const dispose = bindEvent(el, "click", () => {
      clicked++;
    }, doc);
    expect((el as any).$$click).toBeTypeOf("function");
    el.dispatchEvent(windowEvent("click", { bubbles: true }));
    expect(clicked).toBe(1);
    dispose();
    expect((el as any).$$click).toBeUndefined();

    const cleanups = bindEvents(
      el,
      {
        onclick: () => {
          clicked++;
        },
        id: "x",
      },
      doc,
    );
    expect(cleanups).toHaveLength(1);
    expect((el as any).$$click).toBeTypeOf("function");
    el.dispatchEvent(windowEvent("click", { bubbles: true }));
    expect(clicked).toBe(2);
    for (const c of cleanups!) c();

    el.setAttribute("class", "danger");
    setSingleAttribute(el, "class", "");
    expect(el.hasAttribute("class")).toBe(false);
    setSingleAttribute(el, "class", false);
    expect(el.hasAttribute("class")).toBe(false);
  });

  it("binds mouseenter directly so child hit targets still fire", () => {
    const el = doc.createElement("div");
    const child = doc.createElement("span");
    el.appendChild(child);
    container.appendChild(el);
    let entered = 0;
    const dispose = bindEvent(
      el,
      "mouseenter",
      () => {
        entered++;
      },
      doc,
    );
    // Direct bind — no $$mouseenter property (unlike click delegation).
    expect((el as any).$$mouseenter).toBeUndefined();
    // Entering the child still delivers native mouseenter to the parent.
    el.dispatchEvent(windowEvent("mouseenter", { bubbles: false }));
    expect(entered).toBe(1);
    child.dispatchEvent(windowEvent("mouseenter", { bubbles: false }));
    // Synthetic mouseenter on the child does not retarget to the parent;
    // native geometry entry does. Direct listener is on `el` only.
    expect(entered).toBe(1);
    dispose();
    el.dispatchEvent(windowEvent("mouseenter", { bubbles: false }));
    expect(entered).toBe(1);
  });

  it("binds focus and blur directly (not document-delegated)", () => {
    const el = doc.createElement("button");
    container.appendChild(el);
    let focuses = 0;
    let blurs = 0;
    const d1 = bindEvent(el, "focus", () => {
      focuses++;
    }, doc);
    const d2 = bindEvent(el, "blur", () => {
      blurs++;
    }, doc);
    expect((el as any).$$focus).toBeUndefined();
    el.dispatchEvent(windowEvent("focus", { bubbles: false }));
    el.dispatchEvent(windowEvent("blur", { bubbles: false }));
    expect(focuses).toBe(1);
    expect(blurs).toBe(1);
    d1();
    d2();
  });

  it("skips $$click delete when the element is already detached", () => {
    const el = doc.createElement("button");
    container.appendChild(el);
    const dispose = bindDelegatedEvent(el, "click", () => {}, doc);
    expect((el as any).$$click).toBeTypeOf("function");
    el.remove();
    dispose();
    // Detached: cleanup no-ops so Range bulk clear stays cheap.
    expect((el as any).$$click).toBeTypeOf("function");
  });

  it("binds reactive function children as textContent without sinwan-r anchors", async () => {
    const label = signal("alpha");
    const def: TemplateDef = {
      html: "<a><!--s:0--></a>",
      slots: [{ path: [0], type: "child" }],
    };
    const result = _$createTemplate(def, [() => label.value]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const a = container.querySelector("a")!;
    expect(a.childNodes.length).toBe(1);
    expect(a.firstChild?.nodeType).toBe(doc.TEXT_NODE);
    expect(a.textContent).toBe("alpha");
    expect(a.innerHTML).not.toContain("sinwan-r");

    label.value = "beta";
    await nextTick();
    expect(a.textContent).toBe("beta");
    for (const dispose of result.disposers) dispose();
  });

  it("updates a text slot when a conditional getter switches signals", async () => {
    const flag = signal(true);
    const left = signal("left");
    const right = signal("right");
    const def: TemplateDef = {
      html: "<a><!--s:0--></a>",
      slots: [{ path: [0], type: "child" }],
    };
    const result = _$createTemplate(def, [
      () => (flag.value ? left.value : right.value),
    ]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const a = container.querySelector("a")!;
    expect(a.textContent).toBe("left");

    flag.value = false;
    await nextTick();
    expect(a.textContent).toBe("right");
    right.value = "RIGHT";
    await nextTick();
    expect(a.textContent).toBe("RIGHT");
    left.value = "LEFT";
    await nextTick();
    expect(a.textContent).toBe("RIGHT");
    for (const dispose of result.disposers) dispose();
  });

  it("sets SVG class through the attribute when className is not a string", () => {
    const el = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    Object.defineProperty(el, "className", {
      configurable: true,
      get() {
        return { baseVal: "" };
      },
      set() {
        throw new TypeError("className is readonly");
      },
    });
    assignClassName(el, "icon");
    expect(el.getAttribute("class")).toBe("icon");
    assignClassName(el, "icon");
    expect(el.getAttribute("class")).toBe("icon");
    assignClassName(el, "");
    expect(el.hasAttribute("class")).toBe(false);
    assignClassName(el, "");
    expect(el.hasAttribute("class")).toBe(false);

    const html = doc.createElement("div");
    assignClassName(html, "row");
    expect(html.className).toBe("row");
    assignClassName(html, "row");
    expect(html.className).toBe("row");
  });

  it("skips no-op class clears on template class slots", () => {
    const selected = signal(false);
    const def: TemplateDef = {
      html: '<tr class=""></tr>',
      slots: [{ path: [], type: "attr", name: "class" }],
    };
    const result = _$createTemplate(def, [
      () => (selected.value ? "danger" : false),
    ]);
    if (!isTemplateResult(result)) {
      throw new Error("expected a client template result");
    }
    container.appendChild(result.fragment);
    const tr = container.querySelector("tr")!;
    expect(tr.className).toBe("");
    selected.value = true;
    return nextTick().then(() => {
      expect(tr.className).toBe("danger");
      selected.value = false;
      return nextTick().then(() => {
        expect(tr.className).toBe("");
        for (const dispose of result.disposers) dispose();
      });
    });
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
