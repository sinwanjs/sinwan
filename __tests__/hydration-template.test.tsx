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
});
