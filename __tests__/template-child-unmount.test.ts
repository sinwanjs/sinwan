import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { _$createTemplate } from "../src/renderer/template.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { cc } from "../src/component/create.ts";
import { onUnmounted } from "../src/component/lifecycle.ts";
import { Portal, Show } from "../src/component/control-flow.ts";
import { mount } from "../src/renderer/mount.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import type { SinwanNode } from "../src/types.ts";

let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  Object.assign(globalThis, {
    document: doc,
    window: win,
    DocumentFragment: win.DocumentFragment,
    Element: win.Element,
    Comment: win.Comment,
    Text: win.Text,
  });
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

const sectionDef: TemplateDef = {
  html: "<section><!--s:0--></section>",
  slots: [{ path: [0], type: "child" }],
};

function asNode(value: unknown): SinwanNode {
  return value as SinwanNode;
}

describe("template child slots unmount their mounted subtree", () => {
  it("removes portaled content of a component inside a template", async () => {
    const page = signal(true);
    const log: string[] = [];
    const Card = cc(() => {
      onUnmounted(() => log.push("card unmounted"));
      return Portal({
        mount: () => doc.body,
        children: { tag: "div", props: { "data-slot": "card" }, children: ["Card"] },
      });
    });
    const App = cc(() =>
      Show({
        get when() {
          return page.value;
        },
        children: () =>
          asNode(_$createTemplate(sectionDef, [{ tag: Card, props: {}, children: [] }])),
      }),
    );

    const app = mount(App, container);
    await nextTick();
    expect(container.querySelector("section")).not.toBeNull();
    expect(doc.body.querySelectorAll('[data-slot="card"]').length).toBe(1);

    page.value = false;
    await nextTick();
    expect(container.querySelector("section")).toBeNull();
    expect(doc.body.querySelectorAll('[data-slot="card"]').length).toBe(0);
    expect(log).toEqual(["card unmounted"]);
    app.unmount();
    expect(log).toEqual(["card unmounted"]);
  });
});
