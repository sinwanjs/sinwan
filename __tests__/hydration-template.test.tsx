/** @jsxImportSource sinwan */
import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";

let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Text = (win as any).Text;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

describe("Template result hydration", () => {
  it("hydrates a compiler-generated template result and updates reactively", async () => {
    // Import renderer modules after the DOM is set up so template.ts can
    // create its global <template> element.
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);
    const def: TemplateDef = {
      html: '<div><p>Count: <!--s:0--></p><button onclick="">+</button></div>',
      slots: [
        { path: [0, 1], type: "child" },
        { path: [1], type: "event", name: "onclick" },
      ],
    };

    const increment = () => {
      count.value++;
    };

    const App = cc(() => {
      return _$createTemplate(def, [() => count.value, increment]);
    });

    // Server-rendered HTML matching the template (without compiler markers)
    container.innerHTML =
      '<div><p>Count: 0</p><button onclick="">+</button></div>';
    expect(container.textContent).toContain("Count: 0");

    // Hydrate
    const app = hydrate(App, container);
    expect(container.textContent).toContain("Count: 0");

    // Verify direct signal update is reflected by the template effect
    count.value = 1;
    await nextTick();
    expect(container.textContent).toContain("Count: 1");

    // Trigger reactive update via the bound event listener
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    button?.click();
    await nextTick();

    expect(container.textContent).toContain("Count: 2");

    app.unmount();
  });

  it("hydrates a template slot containing a JSX element child", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const { cc } = await import("../src/component/create.ts");

    const linkDef: TemplateDef = {
      html: '<a href="/" onclick=""><!--s:0--></a>',
      slots: [{ path: [0], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(linkDef, [
        <span style="color: blue;">Home</span>,
      ]);
    });

    container.innerHTML =
      '<a href="/" onclick=""><span style="color: blue;">Home</span></a>';
    expect(container.textContent).toContain("Home");

    const app = hydrate(App, container);
    expect(container.textContent).toContain("Home");
    expect(container.querySelector("span")).not.toBeNull();

    app.unmount();
  });

  it("updates explicit binding descriptors reactively", async () => {
    const {
      _$createTemplate,
      _$bindText,
      _$bindAttr,
      _$bindStyle,
      _$bindClass,
      isTemplateResult,
    } = await import("../src/renderer/template.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);
    const title = signal("hello");
    const color = signal("red");
    const active = signal(false);

    const def: TemplateDef = {
      html: '<div title="" style="" class=""><!--s:0--></div>',
      slots: [
        { path: [0], type: "child" },
        { path: [], type: "attr", name: "title" },
        { path: [], type: "attr", name: "style" },
        { path: [], type: "attr", name: "class" },
      ],
    };

    const result = _$createTemplate(def, [
      _$bindText(() => count.value),
      _$bindAttr("title", () => title.value),
      _$bindStyle(() => ({ color: color.value })),
      _$bindClass(() => ({ active: active.value })),
    ]);
    if (!isTemplateResult(result)) throw new Error("expected template result");

    container.appendChild(result.fragment);

    const div = container.querySelector("div");
    expect(div?.textContent).toBe("0");
    expect(div?.getAttribute("title")).toBe("hello");
    expect(div?.style.color).toBe("red");
    expect(div?.className).toBe("");

    count.value = 1;
    title.value = "world";
    color.value = "blue";
    active.value = true;
    await nextTick();

    expect(div?.textContent).toBe("1");
    expect(div?.getAttribute("title")).toBe("world");
    expect(div?.style.color).toBe("blue");
    expect(div?.className).toBe("active");

    for (const dispose of result.disposers) dispose();
  });

  it("updates child DOM when a mutable prop changes", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { cc } = await import("../src/component/create.ts");
    const { createMutable } = await import("../src/store/index.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");
    const { renderNodeToDOM } =
      await import("../src/renderer/render-children.ts");

    let state: { user: { name: string } } = { user: { name: "" } };

    const childDef: TemplateDef = {
      html: "<p><!--s:0--></p>",
      slots: [{ path: [0], type: "child" }],
    };

    const Child = cc((props: { user: { name: string } }) => {
      return _$createTemplate(childDef, [() => props.user.name]);
    });

    const Parent = cc(() => {
      state = createMutable({ user: { name: "Ada" } }) as typeof state;
      return Child({ user: state.user });
    });

    const node = Parent({});
    renderNodeToDOM(node, container, null, null);

    expect(container.textContent).toContain("Ada");

    (state as any).user.name = "Bob";
    await nextTick();

    expect(container.textContent).toContain("Bob");
  });

  it("hydrates a mixed-tree template with a component child slot", async () => {
    // Mirrors the compiler's mixed-tree hoisting output: a static native
    // shell (<div><p>static</p></div>) with a child slot whose dynamic is a
    // component call. Verifies the runtime child-slot branch routes the
    // component through renderNodeToDOM and the component's internal
    // reactivity survives hydration.
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);

    // Card reads the signal via an explicit getter (no compiler in this test,
    // so the reactive read must be wrapped manually for the effect to track).
    const Card = cc(() => <span class="card">Card: {() => count.value}</span>);

    // Compiler-emitted shape: <div><!--s:0--><p>static</p></div>
    // with the component call as the dynamic for slot 0.
    const def: TemplateDef = {
      html: "<div><!--s:0--><p>static</p></div>",
      slots: [{ path: [0], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [<Card />]);
    });

    // Pre-rendered SSR HTML: the component rendered inline + the static <p>.
    container.innerHTML =
      '<div><span class="card">Card: 0</span><p>static</p></div>';
    expect(container.textContent).toContain("Card: 0");
    expect(container.textContent).toContain("static");

    const app = hydrate(App, container);
    expect(container.textContent).toContain("Card: 0");
    expect(container.textContent).toContain("static");
    expect(container.querySelector("span.card")).not.toBeNull();

    // Reactive update propagates through the component's own effect.
    count.value = 7;
    await nextTick();
    expect(container.textContent).toContain("Card: 7");

    app.unmount();
  });
});
