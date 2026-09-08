import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";

/**
 * SSR serialization of compiler-hoisted templates (Item 11 Phase A).
 *
 * When `_$createTemplate` runs without a `document` global (SSR), it returns a
 * `SinwanServerTemplateResult` carrier. The SSR renderer (`renderNodeH`)
 * serializes it into HTML with hydration markers, so the client can hydrate
 * the resulting DOM.
 *
 * These tests stub `globalThis.document = undefined` to simulate the server
 * environment, then call `renderToHydratableString` on a component that uses
 * `_$createTemplate`.
 */

describe("SSR template serialization (Phase A)", () => {
  let originalDocument: any;
  let originalWindow: any;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;
    // Simulate server environment: no DOM globals.
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });

  afterEach(() => {
    // Restore for other test suites.
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it("serializes a template with a reactive text child slot", async () => {
    // Import AFTER document is removed so _$createTemplate takes the server path.
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");

    const count = signal(42);

    const def = {
      html: "<div><p>Count: <!--s:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" as const }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [() => count.value]);
    });

    const html = await renderToHydratableString(App, {});
    // The reactive text should be wrapped in sinwan-t markers.
    expect(html).toContain("Count: ");
    expect(html).toContain("<!--sinwan-t:0-->42<!--/sinwan-t-->");
    // The static shell should be present.
    expect(html).toContain("<div>");
    expect(html).toContain("<p>");
  });

  it("serializes a template with an event slot", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    const def = {
      html: '<div><button onclick="">Click</button></div>',
      slots: [{ path: [0], type: "event" as const, name: "onclick" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [() => {}]);
    });

    const html = await renderToHydratableString(App, {});
    // The onclick="" placeholder should be replaced with data-sinwan-ev.
    expect(html).toContain('data-sinwan-ev="click:0"');
    expect(html).not.toContain('onclick=""');
  });

  it("serializes a template with an attribute slot", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    const def = {
      html: '<div><span title="">text</span></div>',
      slots: [{ path: [0], type: "attr" as const, name: "title" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, ["hello"]);
    });

    const html = await renderToHydratableString(App, {});
    // The title="" placeholder should be replaced with the resolved value.
    expect(html).toContain('title="hello"');
    expect(html).not.toContain('title=""');
  });

  it("strips false attribute slots and resolves bindings, signals, and getters", async () => {
    const { _$createTemplate, _$bindAttr } =
      await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");

    const title = signal("from-signal");
    const def = {
      html: '<div hidden="" title="" data-x="" class=""></div>',
      slots: [
        { path: [], type: "attr" as const, name: "hidden" },
        { path: [], type: "attr" as const, name: "title" },
        { path: [], type: "attr" as const, name: "data-x" },
        { path: [], type: "attr" as const, name: "class" },
      ],
    };

    const App = cc(() =>
      _$createTemplate(def, [
        false,
        title,
        _$bindAttr("data-x", () => "bound"),
        () => "from-fn",
      ]),
    );

    const html = await renderToHydratableString(App, {});
    expect(html).not.toContain("hidden=");
    expect(html).toContain('title="from-signal"');
    expect(html).toContain('data-x="bound"');
    expect(html).toContain('class="from-fn"');
  });

  it("serializes a 0-arity child getter that returns an element", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    const def = {
      html: "<div><!--s:0--></div>",
      slots: [{ path: [0], type: "child" as const }],
    };

    const App = cc(() =>
      _$createTemplate(def, [() => ({ tag: "span", props: {}, children: ["n"] })]),
    );

    const html = await renderToHydratableString(App, {});
    expect(html).toContain("<span>n</span>");
  });

  it("serializes a template with explicit binding descriptors", async () => {
    const { _$createTemplate, _$bindText } =
      await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");

    const count = signal(10);

    const def = {
      html: "<div><p><!--s:0--></p></div>",
      slots: [{ path: [0, 0], type: "child" as const }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [_$bindText(() => count.value)]);
    });

    const html = await renderToHydratableString(App, {});
    expect(html).toContain("<!--sinwan-t:0-->10<!--/sinwan-t-->");
  });

  it("serializes a mixed-tree template with a component child slot", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    // A child component that renders plain HTML.
    const Card = cc(
      ({ title }: { title: string }) =>
        ({
          tag: "span",
          props: { class: "card" },
          children: ["Card: ", title],
        }) as any,
    );

    const def = {
      html: "<div><!--s:0--><p>static</p></div>",
      slots: [{ path: [0], type: "child" as const }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [Card({ title: "hello" })]);
    });

    const html = await renderToHydratableString(App, {});
    // The component should be rendered into the child slot position.
    expect(html).toContain('<span class="card">');
    expect(html).toContain("Card: hello");
    expect(html).toContain("<p>static</p>");
  });

  it("serializes a template with a ref slot (no ref attribute in HTML)", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    const def = {
      html: "<input />",
      slots: [{ path: [], type: "ref" as const, name: "ref" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [(el: any) => el?.focus()]);
    });

    const html = await renderToHydratableString(App, {});
    // Refs are client-only — no ref attribute should appear in SSR output.
    expect(html).toContain("<input");
    expect(html).not.toContain("ref=");
    expect(html).not.toContain("data-sinwan-ev");
  });

  it("serializes a template with ref + attr slot (attr emitted, ref not)", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");

    const def = {
      html: '<input placeholder="" />',
      slots: [
        { path: [], type: "ref" as const, name: "ref" },
        { path: [], type: "attr" as const, name: "placeholder" },
      ],
    };

    const App = cc(() => {
      return _$createTemplate(def, [(el: any) => el?.focus(), "Enter text"]);
    });

    const html = await renderToHydratableString(App, {});
    expect(html).toContain('placeholder="Enter text"');
    expect(html).not.toContain("ref=");
  });
});

/**
 * Phase B — true in-place hydration.
 *
 * After SSR serialization (Phase A), the client hydrates by binding effects to
 * the EXISTING server-rendered DOM nodes (identified by `sinwan-t` markers)
 * instead of creating a new fragment and swapping. This test verifies:
 * 1. The existing text node is reused (same node identity before/after hydration).
 * 2. Reactive updates change the existing text node's content.
 */
describe("SSR template in-place hydration (Phase B)", () => {
  let originalDocument: any;
  let originalWindow: any;
  let doc: Document;
  let container: HTMLElement;

  beforeEach(() => {
    originalDocument = (globalThis as any).document;
    originalWindow = (globalThis as any).window;
    // Set up a DOM for the hydration phase.
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

  afterEach(() => {
    (globalThis as any).document = originalDocument;
    (globalThis as any).window = originalWindow;
  });

  it("binds effects to existing text nodes without swapping", async () => {
    // Step 1: SSR — render the template to HTML with sinwan-t markers.
    delete (globalThis as any).document;
    delete (globalThis as any).window;

    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(42);

    const def = {
      html: "<div><p>Count: <!--s:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" as const }],
    };

    const App = cc(() => _$createTemplate(def, [() => count.value]));

    const html = await renderToHydratableString(App, {});
    expect(html).toContain("<!--sinwan-t:0-->42<!--/sinwan-t-->");

    // Step 2: Set up the client DOM with the SSR HTML.
    (globalThis as any).document = doc;
    (globalThis as any).window = originalWindow;
    container.innerHTML = html;

    // Record the text node identity BEFORE hydration.
    // DOM: <p>Count: [text]<!--sinwan-t:0-->[text "42"]<!--/sinwan-t--></p>
    const pChildren = container.querySelector("p")?.childNodes;
    // Find the text node after the sinwan-t:0 comment.
    let textBefore: Node | undefined;
    for (let i = 0; i < (pChildren?.length ?? 0); i++) {
      const node = pChildren![i];
      if (node.nodeType === 8 && (node as Comment).data === "sinwan-t:0") {
        textBefore = pChildren![i + 1];
        break;
      }
    }
    expect(textBefore).toBeDefined();
    expect((textBefore as Text).textContent).toBe("42");

    // Step 3: Hydrate — should bind to existing nodes, NOT swap.
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const app = hydrate(App, container);

    // The text node should be the SAME node (in-place, not swapped).
    // After in-place hydration, the sinwan-t markers are removed from the
    // DOM (they were only needed to locate the text node during binding);
    // the reactive effect is bound directly to the surviving text node.
    expect((textBefore as Text).parentNode).not.toBeNull();
    expect(container.textContent).toContain("Count: 42");
    // The sinwan-t markers should have been cleaned up.
    expect(container.innerHTML).not.toContain("sinwan-t");

    // Step 4: Reactive update — the EXISTING text node should update.
    count.value = 99;
    await nextTick();
    expect((textBefore as Text).textContent).toBe("99");
    expect(container.textContent).toContain("Count: 99");

    app.unmount();
  });

  it("falls back to swap when SSR HTML lacks sinwan-t markers", async () => {
    // Pre-rendered HTML without markers (e.g. from a non-Sinwan SSR).
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);

    const def = {
      html: "<div><p>Count: <!--s:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" as const }],
    };

    const App = cc(() => _$createTemplate(def, [() => count.value]));

    // Plain HTML without sinwan-t markers.
    container.innerHTML = "<div><p>Count: 0</p></div>";

    const app = hydrate(App, container);
    expect(container.textContent).toContain("Count: 0");

    count.value = 5;
    await nextTick();
    expect(container.textContent).toContain("Count: 5");

    app.unmount();
  });

  it("hydrates a template with ref slot in-place", async () => {
    // Step 1: SSR — render the template to HTML.
    delete (globalThis as any).document;
    delete (globalThis as any).window;

    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { renderToHydratableString } =
      await import("../src/server/hydration-markers.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);
    const refObj = { current: null as Element | null };

    const def = {
      html: "<div><input /><span><!--s:0--></span></div>",
      slots: [
        { path: [0], type: "ref" as const, name: "ref" },
        { path: [1, 0], type: "child" as const },
      ],
    };

    const App = cc(() => _$createTemplate(def, [refObj, () => count.value]));

    const html = await renderToHydratableString(App, {});
    expect(html).toContain("<input");
    expect(html).not.toContain("ref=");

    // Step 2: Set up the client DOM with the SSR HTML.
    (globalThis as any).document = doc;
    (globalThis as any).window = originalWindow;
    container.innerHTML = html;
    expect(container.querySelector("input")).not.toBeNull();

    // Step 3: Hydrate — should bind ref to existing input, not swap.
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const app = hydrate(App, container);

    // Ref should be bound to the existing input element
    const input = container.querySelector("input");
    expect(refObj.current).toBe(input as any);

    // Reactive text should work
    expect(container.querySelector("span")?.textContent).toBe("0");
    count.value = 99;
    await nextTick();
    expect(container.querySelector("span")?.textContent).toBe("99");

    app.unmount();
    expect(refObj.current).toBeNull();
  });
});
