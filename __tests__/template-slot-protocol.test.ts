import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  DEFAULT_TEMPLATE_SLOT_PROTOCOL,
  type TemplateSlotProtocol,
} from "../src/renderer/template-protocol.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { cc } from "../src/component/create.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
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

const customProtocol: TemplateSlotProtocol = {
  slotPrefix: "slot",
  encodeSlot(index) {
    return `slot:${index}`;
  },
  decodeSlot(node) {
    const data = node.data;
    if (data.startsWith("slot:")) {
      const idx = parseInt(data.slice(5), 10);
      return Number.isNaN(idx) ? null : idx;
    }
    return null;
  },
};

describe("TemplateSlotProtocol", () => {
  it("encodes and decodes default slot markers", () => {
    const open = `<!--${DEFAULT_TEMPLATE_SLOT_PROTOCOL.encodeSlot(0)}-->`;
    expect(open).toBe("<!--s:0-->");

    const comment = document.createComment("s:0");
    expect(DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(comment)).toBe(0);

    const notSlot = document.createComment("not-a-slot");
    expect(DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(notSlot)).toBeNull();
  });

  it("round-trips all slot indices", () => {
    for (let i = 0; i < 10; i++) {
      const comment = document.createComment(DEFAULT_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i));
      expect(DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(comment)).toBe(i);
    }
  });

  it("supports a custom protocol implementation", () => {
    const comment = document.createComment(customProtocol.encodeSlot(3));
    expect(customProtocol.decodeSlot(comment)).toBe(3);

    const notSlot = document.createComment("s:3");
    expect(customProtocol.decodeSlot(notSlot)).toBeNull();
  });
});

describe("TemplateSlotProtocol + _$createTemplate", () => {
  it("renders and hydrates a template using default slot markers", async () => {
    const count = signal(0);
    const def: TemplateDef = {
      html: '<div><p>Count: <!--s:0--></p></div>',
      slots: [{ path: [0, 1], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [() => count.value]);
    });

    container.innerHTML = '<div><p>Count: 0</p></div>';
    const app = hydrate(App, container);
    expect(container.textContent).toContain("Count: 0");

    count.value = 1;
    await nextTick();
    expect(container.textContent).toContain("Count: 1");

    app.unmount();
  });

  it("rejects unknown slot markers", () => {
    const def: TemplateDef = {
      html: '<div><p>Count: <!--x:0--></p></div>',
      slots: [{ path: [0, 1], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, ["fallback"]);
    });

    // Since the slot marker does not match the default protocol, the child
    // is not rendered at the marker position and the original comment remains.
    container.innerHTML = '<div><p>Count: <!--x:0--></p></div>';
    const app = hydrate(App, container);
    expect(container.textContent).toContain("Count:");
    // The original comment should still be there because the protocol could not decode it.
    expect(container.querySelector("p")?.childNodes.length).toBe(2);

    app.unmount();
  });
});
