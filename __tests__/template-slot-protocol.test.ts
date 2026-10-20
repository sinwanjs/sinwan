import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  DEFAULT_TEMPLATE_SLOT_PROTOCOL,
  type TemplateSlotProtocol,
} from "../src/renderer/template-protocol.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { cc } from "../src/component/create.ts";
import { mount } from "../src/renderer/mount.ts";
import { provide, inject } from "../src/component/provide-inject.ts";
import { getCurrentInstance } from "../src/component/instance.ts";
import type { SinwanNode } from "../src/types.ts";
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
      const comment = document.createComment(
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i),
      );
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
  it.each([false, true])(
    "preserves injection on filtered child updates (compiled: %s)",
    async (compiled) => {
      const routerKey = Symbol("router");
      const router = { path: "/users" };
      const query = signal("");
      const names = ["Alice", "Bob", "Carol"];
      const def: TemplateDef = {
        html: "<div><!--s:0--></div>",
        slots: [{ path: [0], type: "child" }],
      };
      const Link = cc<{ name: string }>(({ name }) => ({
        tag: "a",
        props: { href: inject(routerKey, { path: "missing" }).path },
        children: [name],
      }));
      const App = cc(() => {
        provide(routerKey, router);
        const render = (): SinwanNode => {
          const children = names
            .filter((name) => name.includes(query.value))
            .map((name) => ({
              tag: Link,
              props: { name },
              children: [],
            }));
          return compiled
            ? (_$createTemplate(def, [children]) as unknown as SinwanNode)
            : { tag: "div", props: {}, children };
        };
        return { tag: "section", props: {}, children: [render] };
      });
      const app = mount(App, container);
      try {
        for (const search of ["", "Ali", "", "missing", "Bob", ""]) {
          query.value = search;
          await nextTick();
          const expected = names.filter((name) => name.includes(search));
          const links = [...container.querySelectorAll("a")];
          expect(links.map((link) => link.textContent)).toEqual(expected);
          expect(links.map((link) => link.getAttribute("href"))).toEqual(
            expected.map(() => "/users"),
          );
          expect(getCurrentInstance()).toBeNull();
        }
      } finally {
        app.unmount();
      }
    },
  );

  it("renders and hydrates a template using default slot markers", async () => {
    const count = signal(0);
    const def: TemplateDef = {
      html: "<div><p>Count: <!--s:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, [() => count.value]);
    });

    container.innerHTML = "<div><p>Count: 0</p></div>";
    const app = hydrate(App, container);
    expect(container.textContent).toContain("Count: 0");

    count.value = 1;
    await nextTick();
    expect(container.textContent).toContain("Count: 1");

    app.unmount();
  });

  it("rejects unknown slot markers", () => {
    const def: TemplateDef = {
      html: "<div><p>Count: <!--x:0--></p></div>",
      slots: [{ path: [0, 1], type: "child" }],
    };

    const App = cc(() => {
      return _$createTemplate(def, ["fallback"]);
    });

    // Path is authoritative: the node at [0, 1] is replaced even if the
    // comment does not use the default `s:N` protocol encoding.
    const app = mount(App, container);
    expect(container.querySelector("p")?.textContent).toBe("Count: fallback");
    app.unmount();
  });

  it("binds sole-dynamic child slots via parent element path", async () => {
    const count = signal(3);
    const def: TemplateDef = {
      html: "<div><span></span></div>",
      slots: [{ path: [0], type: "child" }],
    };

    const App = cc(() => _$createTemplate(def, [() => count.value]));
    const app = mount(App, container);
    expect(container.querySelector("span")!.textContent).toBe("3");
    count.value = 9;
    await nextTick();
    expect(container.querySelector("span")!.textContent).toBe("9");
    app.unmount();
  });

  it("queues onUpdated from fixed parent-fill text bindings", async () => {
    const { onUpdated } = await import("../src/component/lifecycle.ts");
    const count = signal(1);
    let updates = 0;
    const def: TemplateDef = {
      html: "<div><span></span></div>",
      slots: [{ path: [0], type: "child" }],
    };
    const App = cc(() => {
      onUpdated(() => {
        updates++;
      });
      return _$createTemplate(def, [() => count.value]);
    });
    const app = mount(App, container);
    expect(container.querySelector("span")!.textContent).toBe("1");
    count.value = 2;
    await nextTick();
    expect(container.querySelector("span")!.textContent).toBe("2");
    await nextTick();
    expect(updates).toBeGreaterThan(0);
    app.unmount();
  });

  it("appends static scalars into parent-fill slots", () => {
    const def: TemplateDef = {
      html: "<div><td></td></div>",
      slots: [{ path: [0], type: "child" }],
    };
    const App = cc(() => _$createTemplate(def, ["42"]));
    const app = mount(App, container);
    expect(container.querySelector("td")!.textContent).toBe("42");
    app.unmount();
  });

  it("skips child slots whose path resolves to a non-element non-comment", () => {
    const def: TemplateDef = {
      html: "<div>text</div>",
      slots: [{ path: [0], type: "child" }],
    };
    const App = cc(() => _$createTemplate(def, ["nope"]));
    const app = mount(App, container);
    expect(container.querySelector("div")!.textContent).toBe("text");
    app.unmount();
  });

  it("binds nested parent-fill and attr slots via compiled resolvers", () => {
    const def: TemplateDef = {
      html: '<div><section><p></p><span title=""></span></section></div>',
      slots: [
        { path: [0, 0], type: "child" },
        { path: [0, 1], type: "attr", name: "title" },
      ],
    };
    const App = cc(() => _$createTemplate(def, ["hello", "tip"]));
    const app = mount(App, container);
    expect(container.querySelector("p")!.textContent).toBe("hello");
    expect(container.querySelector("span")!.getAttribute("title")).toBe("tip");
    app.unmount();
  });

  it("binds depth-3 and depth-4 child slots via compiled resolvers", () => {
    const deep3: TemplateDef = {
      html: "<div><a><b><i></i></b></a></div>",
      slots: [{ path: [0, 0, 0], type: "child" }],
    };
    const deep4: TemplateDef = {
      html: "<div><a><b><c><i></i></c></b></a></div>",
      slots: [{ path: [0, 0, 0, 0], type: "child" }],
    };
    const App = cc(() => [
      _$createTemplate(deep3, ["d3"]),
      _$createTemplate(deep4, ["d4"]),
    ]);
    const app = mount(App, container);
    expect(container.textContent).toContain("d3");
    expect(container.textContent).toContain("d4");
    app.unmount();
  });

  it("throws when a compiled resolver path misses the DOM", () => {
    const def: TemplateDef = {
      html: "<div></div>",
      slots: [{ path: [0], type: "child" }],
    };
    expect(() => _$createTemplate(def, ["x"])).toThrow(/invalid slot path/);

    const empty: TemplateDef = {
      html: "",
      slots: [{ path: [], type: "attr", name: "id" }],
    };
    expect(() => _$createTemplate(empty, ["x"])).toThrow(/no children/);

    const miss1: TemplateDef = {
      html: "",
      slots: [{ path: [0], type: "child" }],
    };
    expect(() => _$createTemplate(miss1, ["x"])).toThrow(/no children/);

    const miss2: TemplateDef = {
      html: "<div><span></span></div>",
      slots: [{ path: [0, 1], type: "child" }],
    };
    expect(() => _$createTemplate(miss2, ["x"])).toThrow(/invalid slot path/);

    const miss2empty: TemplateDef = {
      html: "",
      slots: [{ path: [0, 0], type: "child" }],
    };
    expect(() => _$createTemplate(miss2empty, ["x"])).toThrow(/no children/);

    const miss2depth0: TemplateDef = {
      html: "<div></div>",
      slots: [{ path: [1, 0], type: "child" }],
    };
    expect(() => _$createTemplate(miss2depth0, ["x"])).toThrow(/invalid slot path/);

    const miss3: TemplateDef = {
      html: "<div><a><b></b></a></div>",
      slots: [{ path: [0, 0, 1], type: "child" }],
    };
    expect(() => _$createTemplate(miss3, ["x"])).toThrow(/invalid slot path/);

    const miss3empty: TemplateDef = {
      html: "",
      slots: [{ path: [0, 0, 0], type: "child" }],
    };
    expect(() => _$createTemplate(miss3empty, ["x"])).toThrow(/no children/);

    const miss3depth0: TemplateDef = {
      html: "<div></div>",
      slots: [{ path: [1, 0, 0], type: "child" }],
    };
    expect(() => _$createTemplate(miss3depth0, ["x"])).toThrow(/invalid slot path/);

    const miss3depth1: TemplateDef = {
      html: "<div><a></a></div>",
      slots: [{ path: [0, 1, 0], type: "child" }],
    };
    expect(() => _$createTemplate(miss3depth1, ["x"])).toThrow(/invalid slot path/);
  });

  it("renders reactive object children through parent-fill slots", async () => {
    const node = signal({ tag: "em", props: {}, children: ["x"] } as const);
    const def: TemplateDef = {
      html: "<div><!--s:0--></div>",
      slots: [{ path: [0], type: "child" }],
    };
    const App = cc(() => _$createTemplate(def, [() => node.value]));
    const app = mount(App, container);
    expect(container.querySelector("em")!.textContent).toBe("x");
    node.value = { tag: "em", props: {}, children: ["y"] };
    await nextTick();
    expect(container.querySelector("em")!.textContent).toBe("y");
    app.unmount();
  });
});
