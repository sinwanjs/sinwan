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

describe("Nested component hydration", () => {
  it("hydrates a plain function component followed by a hoisted template component", async () => {
    const { _$createTemplate } = await import("../src/renderer/template.ts");
    const { hydrate } = await import("../src/hydration/hydrate.ts");
    const { cc } = await import("../src/component/create.ts");
    const { signal } = await import("../src/reactivity/signal.ts");
    const { nextTick } = await import("../src/reactivity/index.ts");

    const count = signal(0);
    const counterDef: TemplateDef = {
      html: "<div><p>Count: <!--s:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" }],
    };

    const Counter = cc(() => {
      return _$createTemplate(counterDef, [() => count.value]);
    });

    const NavBar = () => {
      return (
        <nav style="margin: 20px 0; display: flex; gap: 20px;">
          <a href="/">Home</a>
        </nav>
      );
    };

    const Page = cc(() => {
      return (
        <>
          <div style="padding: 20px;">
            <h1>Page</h1>
            <NavBar />
            <Counter />
          </div>
        </>
      );
    });

    container.innerHTML =
      '<div style="padding: 20px;"><h1>Page</h1><nav style="margin: 20px 0; display: flex; gap: 20px;"><a href="/">Home</a></nav><div><p>Count: 0</p></div></div>';
    expect(container.textContent).toContain("Home");
    expect(container.textContent).toContain("Count: 0");

    const app = hydrate(Page, container);
    expect(container.textContent).toContain("Home");
    expect(container.textContent).toContain("Count: 0");

    count.value = 1;
    await nextTick();
    expect(container.textContent).toContain("Count: 1");
    expect(container.textContent).toContain("Home");

    app.unmount();
  });
});
