import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted, onUpdated } from "../src/component/lifecycle.ts";
import { inject, provide } from "../src/component/provide-inject.ts";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { renderNodeToDOM } from "../src/renderer/render-children.ts";
import { unmountNode } from "../src/renderer/unmount.ts";
import {
  _$bindText,
  _$createTemplate,
  isTemplateResult,
} from "../src/renderer/template.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { nextTick, signal } from "../src/reactivity/index.ts";
import type { SinwanComponent } from "../src/types.ts";

const section: TemplateDef = {
  html: "<section><!--s:0--></section>",
  slots: [{ path: [0], type: "child" }],
};
const wrapper: TemplateDef = {
  html: "<div><!--s:0--></div>",
  slots: [{ path: [0], type: "child" }],
};

interface ChildProbe {
  setups: number;
  mounts: number;
  unmounts: number;
}

function createChild(probe: ChildProbe): SinwanComponent {
  return cc(() => {
    probe.setups++;
    onMounted(() => {
      probe.mounts++;
    });
    onUnmounted(() => {
      probe.unmounts++;
    });
    return jsx("p", { children: "child" });
  });
}

let container: HTMLElement;
beforeEach(() => {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Text: window.Text,
    Comment: window.Comment,
    DocumentFragment: window.DocumentFragment,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});

describe("reactive template child slot", () => {
  it("calls a getter that returns nodes once per update", async () => {
    const version = signal(1);
    const probe: ChildProbe = { setups: 0, mounts: 0, unmounts: 0 };
    const Child = createChild(probe);
    let calls = 0;
    const App = cc(() =>
      _$createTemplate(section, [
        () => {
          calls++;
          void version.value;
          return _$createTemplate(wrapper, [jsx(Child, {})]);
        },
      ]),
    );
    const app = mount(App, container);
    await nextTick();
    expect(calls).toBe(1);
    expect(probe.setups).toBe(1);
    expect(probe.mounts).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(1);

    version.value = 2;
    await nextTick();
    expect(calls).toBe(2);
    expect(probe.setups).toBe(2);
    expect(probe.mounts).toBe(2);
    expect(probe.unmounts).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(1);

    app.unmount();
    expect(probe.unmounts).toBe(2);
  });

  it("calls a text binding descriptor that returns nodes once per update", async () => {
    const version = signal(1);
    const probe: ChildProbe = { setups: 0, mounts: 0, unmounts: 0 };
    const Child = createChild(probe);
    let calls = 0;
    const App = cc(() =>
      _$createTemplate(section, [
        _$bindText(() => {
          calls++;
          void version.value;
          return jsx(Child, {});
        }),
      ]),
    );
    const app = mount(App, container);
    expect(calls).toBe(1);
    expect(probe.setups).toBe(1);

    version.value = 2;
    await nextTick();
    expect(calls).toBe(2);
    expect(probe.setups).toBe(2);
    expect(probe.unmounts).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(1);
    app.unmount();
  });

  it("binds a scalar getter as a plain text node", async () => {
    const label = signal("a");
    let calls = 0;
    const App = cc(() =>
      _$createTemplate(section, [
        () => {
          calls++;
          return label.value;
        },
      ]),
    );
    const app = mount(App, container);
    expect(container.innerHTML).toBe("<section>a</section>");
    expect(calls).toBe(1);

    label.value = "b";
    await nextTick();
    expect(container.innerHTML).toBe("<section>b</section>");
    expect(calls).toBe(2);
    app.unmount();
  });

  it("renders text when a node getter later returns a scalar", async () => {
    const asNode = signal(true);
    const App = cc(() =>
      _$createTemplate(section, [
        () => (asNode.value ? jsx("p", { children: "node" }) : "text"),
      ]),
    );
    const app = mount(App, container);
    expect(container.querySelector("p")?.textContent).toBe("node");

    asNode.value = false;
    await nextTick();
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("section")?.textContent).toBe("text");
    app.unmount();
  });

  it("keeps the owner for content rendered on a later run", async () => {
    const version = signal(1);
    const seen: unknown[] = [];
    const Reader = cc(() => {
      seen.push(inject("theme"));
      return jsx("p", { children: "reader" });
    });
    const App = cc(() => {
      provide("theme", "dark");
      return _$createTemplate(section, [
        () => {
          void version.value;
          return jsx(Reader, {});
        },
      ]);
    });
    const app = mount(App, container);
    version.value = 2;
    await nextTick();
    expect(seen).toEqual(["dark", "dark"]);
    app.unmount();
  });

  it("re-renders a node getter in a template built outside a component", async () => {
    const version = signal(1);
    let calls = 0;
    const result = _$createTemplate(section, [
      () => {
        calls++;
        return jsx("p", { children: `v${version.value}` });
      },
    ]);
    expect(isTemplateResult(result)).toBe(true);
    const mounted = renderNodeToDOM(
      jsx("main", { children: result }),
      container,
      null,
      null,
    );
    expect(calls).toBe(1);
    expect(container.querySelector("p")?.textContent).toBe("v1");

    version.value = 2;
    await nextTick();
    expect(calls).toBe(2);
    expect(container.querySelector("p")?.textContent).toBe("v2");
    unmountNode(mounted);
  });

  it("fires the owner's updated hooks after a node re-render", async () => {
    const version = signal(1);
    let updated = 0;
    const App = cc(() => {
      onUpdated(() => {
        updated++;
      });
      return _$createTemplate(section, [
        () => jsx("p", { children: `v${version.value}` }),
      ]);
    });
    const app = mount(App, container);
    expect(updated).toBe(0);

    version.value = 2;
    await nextTick();
    await nextTick();
    expect(container.querySelector("p")?.textContent).toBe("v2");
    expect(updated).toBeGreaterThan(0);
    app.unmount();
  });
});
