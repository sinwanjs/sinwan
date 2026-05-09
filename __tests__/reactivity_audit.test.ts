
import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal, nextTick } from "../src/reactivity/index.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import { renderElementToDOM } from "../src/renderer/render-element.ts";
import { SinwanElement } from "../src/types.ts";
import { Switch, Match } from "../src/component/control-flow.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

function el(tag: string, props: Record<string, any> = {}, ...children: any[]): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

describe("Reactivity Audit", () => {
  it("functional getter in children should be reactive", async () => {
    const count = signal(0);
    // Functional getter: () => count.value
    renderNodeToDOM((() => count.value) as any, container);
    
    // CURRENT BEHAVIOR: It is coerced to string once (if it's lucky) or just rendered as a static value.
    // Actually, renderNodeToDOM treats functions as "fallback - coerce to string" if they are not signals.
    // String(() => 0) is "() => 0".
    
    expect(container.textContent).toBe("0"); // This will likely fail if it's currently coerced to string "() => 0"
    
    count.value = 1;
    await nextTick();
    expect(container.textContent).toBe("1");
  });

  it("functional getter in attributes should be reactive", async () => {
    const cls = signal("red");
    const element = el("div", { class: () => cls.value });
    renderElementToDOM(element, container);
    
    const div = container.firstElementChild as HTMLElement;
    expect(div.getAttribute("class")).toBe("red");
    
    cls.value = "blue";
    await nextTick();
    expect(div.getAttribute("class")).toBe("blue");
  });

  it("Switch/Match with functional getter should be reactive", async () => {
    const count = signal(0);
    const element = {
      tag: Switch,
      props: {
        children: [
          {
            tag: Match,
            props: { when: () => count.value === 0, children: ["Zero"] }
          },
          {
            tag: Match,
            props: { when: () => count.value === 1, children: ["One"] }
          }
        ]
      }
    } as any;
    
    renderElementToDOM(element, container);
    expect(container.textContent).toBe("Zero");
    
    count.value = 1;
    await nextTick();
    expect(container.textContent).toBe("One");
    
    count.value = 2; // neither match
    await nextTick();
    expect(container.textContent).toBe("");
  });

  it("functional getter returning JSX element should be reactive", async () => {
    const count = signal(0);
    const element = (() => 
      count.value === 1 ? el("p", {}, "One") : el("p", {}, "Not One")
    ) as any;
    
    renderNodeToDOM(element, container);
    expect(container.textContent).toBe("Not One");
    
    count.value = 1;
    await nextTick();
    expect(container.textContent).toBe("One");
    
    count.value = 0;
    await nextTick();
    expect(container.textContent).toBe("Not One");
  });
});
