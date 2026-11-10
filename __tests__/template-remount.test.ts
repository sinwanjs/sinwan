import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { _$createTemplate } from "../src/renderer/template.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { cc } from "../src/component/create.ts";
import { Show } from "../src/component/control-flow.ts";
import { mount } from "../src/renderer/mount.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import type { SinwanNode } from "../src/types.ts";

// A compiled JSX value (`fallback={<p>…</p>}`, a prop rendered twice) is one
// template result. Mounting it moves the fragment's nodes out, so every mount
// after the first must build a fresh copy of the same template.

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

const emptyDef: TemplateDef = {
  html: '<p class="empty">Nothing <b>here</b></p><span>yet</span>',
  slots: [],
};

// What the compiler emits for `<p class={tone.value}>{text}</p>`.
const labelDef: TemplateDef = {
  html: '<p class=""></p>',
  slots: [
    { path: [], type: "attr", name: "class" },
    { path: [], type: "child" },
  ],
};

function asNode(value: unknown): SinwanNode {
  return value as SinwanNode;
}

describe("a template result mounted more than once", () => {
  it("shows a Show fallback again each time the condition turns false", async () => {
    const full = signal(false);
    const App = cc(() => {
      const fallback = asNode(_$createTemplate(emptyDef, []));
      return Show({
        get when() {
          return full.value;
        },
        fallback,
        children: { tag: "div", props: { class: "full" }, children: ["Full"] },
      });
    });

    const app = mount(App, container);
    await nextTick();
    expect(container.querySelector(".empty")?.textContent).toBe("Nothing here");

    for (let round = 0; round < 3; round++) {
      full.value = true;
      await nextTick();
      expect(container.querySelector(".empty")).toBeNull();
      expect(container.querySelector(".full")).not.toBeNull();

      full.value = false;
      await nextTick();
      expect(container.querySelector(".full")).toBeNull();
      expect(container.querySelector(".empty")?.textContent).toBe("Nothing here");
      expect(container.querySelectorAll("span").length).toBe(1);
    }
    app.unmount();
    expect(container.querySelector(".empty")).toBeNull();
  });

  it("builds a live copy with its own bindings for a second place", async () => {
    const tone = signal("ok");
    const shown = signal(true);
    const App = cc(() => {
      const label = asNode(
        _$createTemplate(labelDef, [() => tone.value, () => `state: ${tone.value}`]),
      );
      return {
        tag: "div",
        props: {},
        children: [
          { tag: "section", props: {}, children: [label] },
          Show({
            get when() {
              return shown.value;
            },
            children: { tag: "aside", props: {}, children: [label] },
          }),
        ],
      };
    });

    const app = mount(App, container);
    await nextTick();
    const read = () =>
      Array.from(container.querySelectorAll("p")).map((p) => `${p.className}|${p.textContent}`);
    expect(read()).toEqual(["ok|state: ok", "ok|state: ok"]);

    tone.value = "error";
    await nextTick();
    expect(read()).toEqual(["error|state: error", "error|state: error"]);

    // Unmounting the copy stops only its bindings.
    shown.value = false;
    await nextTick();
    tone.value = "ok";
    await nextTick();
    expect(read()).toEqual(["ok|state: ok"]);
    app.unmount();
  });
});
