import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  signal,
  computed,
  batch,
  nextTick,
  flushSync,
} from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import {
  Show,
  For,
  Portal,
  Index,
  Dynamic,
} from "../src/component/control-flow.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;

  // Happy-DOM sometimes fails to find its own constructors on the window object
  // when used in certain test environments. We ensure they are present.
  if (!win.SyntaxError) (win as any).SyntaxError = SyntaxError;
  if (!win.TypeError) (win as any).TypeError = TypeError;
  if (!win.ReferenceError) (win as any).ReferenceError = ReferenceError;

  // Link global objects that Happy-DOM expects
  (globalThis as any).window = win;
  (globalThis as any).document = doc;
  (globalThis as any).Node = win.Node;
  (globalThis as any).Element = win.Element;
  (globalThis as any).HTMLElement = win.HTMLElement;
  (globalThis as any).CustomEvent = win.CustomEvent;
  (globalThis as any).Event = win.Event;
  (globalThis as any).SyntaxError = win.SyntaxError;

  container = doc.createElement("div");
  doc.body.appendChild(container);
});

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

describe("Renderer — Stress Tests (Massive Scale)", () => {
  it("should handle mounting 20,000 intrinsic elements", () => {
    const App = cc(() => {
      const items = Array.from({ length: 20000 }, (_, i) =>
        el("div", { class: `item-${i}`, "data-id": i }, `Item ${i}`),
      );
      return el("div", { class: "container" }, ...items);
    });

    mount(App, container);
    expect(container.querySelectorAll(".container > div").length).toBe(20000);
    expect(container.querySelector(".item-19999")?.textContent).toBe(
      "Item 19999",
    );
  });

  it("should handle 10,000 reactive attribute updates", async () => {
    const count = signal(0);
    const App = cc(() => {
      const items = Array.from({ length: 10000 }, (_, i) =>
        el("div", {
          class: "item",
          "data-count": count,
          style: () => `opacity: ${count.value / 100};`,
        }),
      );
      return el("div", {}, ...items);
    });

    mount(App, container);
    const items = container.querySelectorAll(".item");
    expect(items[0].getAttribute("data-count")).toBe("0");

    count.value = 50;
    await nextTick();
    expect(items[0].getAttribute("data-count")).toBe("50");
    expect((items[0] as HTMLElement).style.opacity).toBe("0.5");

    count.value = 100;
    await nextTick();
    expect(items[9999].getAttribute("data-count")).toBe("100");
    expect((items[9999] as HTMLElement).style.opacity).toBe("1");
  });

  it("should handle extreme component nesting (1,000 levels)", () => {
    const Leaf = cc(() => el("span", { id: "leaf" }, "Leaf"));

    function Nest(depth: number): SinwanElement {
      if (depth <= 0) return Leaf({}) as SinwanElement;
      const Wrapper = (props: any) => Nest(depth - 1);
      return el(Wrapper, {});
    }

    const App = cc(() => Nest(1000));
    mount(App, container);

    expect(container.querySelector("#leaf")?.textContent).toBe("Leaf");
  });

  it("should handle massive event listener registration (5,000 listeners)", () => {
    let clickCount = 0;
    const App = cc(() => {
      const items = Array.from({ length: 5000 }, (_, i) =>
        el(
          "button",
          {
            class: "btn",
            onclick: () => clickCount++,
          },
          `Btn ${i}`,
        ),
      );
      return el("div", {}, ...items);
    });

    mount(App, container);
    const buttons = container.querySelectorAll(".btn");
    expect(buttons.length).toBe(5000);

    (buttons[0] as HTMLElement).click();
    (buttons[2500] as HTMLElement).click();
    (buttons[4999] as HTMLElement).click();

    expect(clickCount).toBe(3);
  });

  it("should handle very large fragment updates (10,000 items swap)", async () => {
    const toggle = signal(true);
    const App = cc(() => {
      return el("", {}, () =>
        toggle.value
          ? Array.from({ length: 10000 }, (_, i) => el("p", {}, `A ${i}`))
          : Array.from({ length: 10000 }, (_, i) => el("span", {}, `B ${i}`)),
      );
    });

    mount(App, container);
    expect(container.querySelectorAll("p").length).toBe(10000);

    toggle.value = false;
    flushSync();
    expect(container.querySelectorAll("p").length).toBe(0);
    expect(container.querySelectorAll("span").length).toBe(10000);
  });

  it("should handle extreme rapid mount/unmount churn (100 cycles)", async () => {
    const visible = signal(true);
    let mountedCount = 0;
    let unmountedCount = 0;

    const Subtree = cc(() => {
      onMounted(() => mountedCount++);
      onUnmounted(() => unmountedCount++);
      return el(
        "div",
        { class: "subtree" },
        Array.from({ length: 10 }, (_, i) => el("div", {}, `Item ${i}`)),
      );
    });

    const App = cc(() => {
      return el(
        "div",
        {},
        el(Show, {
          when: visible,
          children: () => el(Subtree, {}),
        }),
      );
    });

    mount(App, container);
    expect(mountedCount).toBe(1);

    for (let i = 0; i < 100; i++) {
      visible.value = false;
      flushSync();
      visible.value = true;
      flushSync();
    }

    expect(mountedCount).toBe(101);
    expect(unmountedCount).toBe(100);
    expect(container.querySelectorAll(".subtree").length).toBe(1);
  });

  it("should handle large-scale reactive prop diffusion", async () => {
    const base = signal(0);
    const items = Array.from({ length: 1000 }, (_, i) =>
      computed(() => base.value + i),
    );

    const Item = cc(({ val }: { val: number | (() => number) }) => {
      return el("div", { class: "prop-item" }, val);
    });

    const App = cc(() => {
      return el(
        "div",
        {},
        items.map((s, i) => el(Item, { val: s })),
      );
    });

    mount(App, container);
    const first = container.querySelector(".prop-item");
    expect(first?.textContent).toBe("0");

    base.value = 10;
    await nextTick();
    expect(first?.textContent).toBe("10");
    expect(container.querySelectorAll(".prop-item")[999].textContent).toBe(
      "1009",
    );
  });

  it("should handle complex SVG stress with animations (1,000 animated circles)", async () => {
    const pos = signal(0);
    const App = cc(() => {
      const circles = Array.from({ length: 1000 }, (_, i) =>
        el("circle", {
          cx: () => pos.value + i,
          cy: i,
          r: 5,
          fill: () => (pos.value % 2 === 0 ? "red" : "blue"),
        }),
      );
      return el("svg", { width: 2000, height: 2000 }, ...circles);
    });

    mount(App, container);
    const firstCircle = container.querySelector("circle")!;
    expect(firstCircle.getAttribute("fill")).toBe("red");

    pos.value = 1;
    await nextTick();
    expect(firstCircle.getAttribute("cx")).toBe("1");
    expect(firstCircle.getAttribute("fill")).toBe("blue");
  });

  it("should handle large-scale table rendering (100x100 grid)", () => {
    const App = cc(() => {
      const rows = Array.from({ length: 100 }, (_, i) =>
        el(
          "tr",
          { class: "row" },
          Array.from({ length: 100 }, (_, j) =>
            el(
              "td",
              { class: "cell", "data-pos": `${i}-${j}` },
              `Cell ${i},${j}`,
            ),
          ),
        ),
      );
      return el("table", {}, el("tbody", {}, ...rows));
    });

    mount(App, container);
    const table = container.firstChild as HTMLTableElement;
    expect(table.querySelectorAll("tr").length).toBe(100);
    expect(table.querySelectorAll("td").length).toBe(10000);
    const cell = table.querySelector('[data-pos="99-99"]');
    expect(cell?.textContent).toBe("Cell 99,99");
  });

  it("should handle massive attribute churn", async () => {
    const active = signal(false);
    const App = cc(() => {
      return el(
        "div",
        {
          id: "target",
          class: () =>
            active.value
              ? "active massive-class-list-item-1 massive-class-list-item-2"
              : "inactive",
          "data-active": active,
          title: () => (active.value ? "Active State" : "Inactive State"),
          style: () =>
            active.value
              ? "color: red; background: blue; border: 1px solid black;"
              : "color: black;",
        },
        "Content",
      );
    });

    mount(App, container);
    const target = container.querySelector("#target") as HTMLElement;
    expect(target.className).toBe("inactive");

    for (let i = 0; i < 50; i++) {
      active.value = !active.value;
      flushSync();
    }

    expect(target.className).toBe("inactive");
    active.value = true;
    flushSync();
    expect(target.className).toContain("active");
    expect(target.style.color).toBe("red");
  });

  it("should handle deep fragment nesting (100 layers)", () => {
    function DeepFragment(depth: number): SinwanNode {
      if (depth <= 0) return el("div", { id: "deepest" }, "bottom");
      return el("", {}, DeepFragment(depth - 1));
    }

    const App = cc(() => DeepFragment(100) as SinwanElement);
    mount(App, container);
    expect(container.querySelector("#deepest")?.textContent).toBe("bottom");
  });

  it("should handle large list of conditional components", async () => {
    const filter = signal("all");
    const Item = cc(({ id, type }: { id: number; type: string }) => {
      return el("div", { class: `item ${type}` }, `Item ${id}`);
    });

    const App = cc(() => {
      return el(
        "div",
        {},
        Array.from({ length: 1000 }, (_, i) => {
          const type = i % 2 === 0 ? "even" : "odd";
          return el(Show, {
            when: () => filter.value === "all" || filter.value === type,
            children: () => Item({ id: i, type }),
          });
        }),
      );
    });

    mount(App, container);
    expect(container.querySelectorAll(".item").length).toBe(1000);

    filter.value = "even";
    flushSync();
    expect(container.querySelectorAll(".item").length).toBe(500);
    expect(container.querySelectorAll(".even").length).toBe(500);
    expect(container.querySelectorAll(".odd").length).toBe(0);
  });

  it("should handle massive style object updates", async () => {
    const styles = signal({ color: "red", fontSize: "12px", margin: "10px" });
    const App = cc(() => el("div", { id: "styled", style: styles }, "Text"));

    mount(App, container);
    const div = container.querySelector("#styled") as HTMLElement;
    expect(div.style.color).toBe("red");

    styles.value = { color: "blue", fontSize: "20px", margin: "20px" };
    flushSync();
    expect(div.style.color).toBe("blue");
    expect(div.style.fontSize).toBe("20px");
  });

  it("should handle component props reactivity across many levels", async () => {
    const count = signal(0);

    const Level3 = cc(({ value }: any) => el("span", { id: "result" }, value));
    const Level2 = cc(({ value }: any) => el(Level3, { value }));
    const Level1 = cc(({ value }: any) => el(Level2, { value }));

    const App = cc(() => el(Level1, { value: count }));
    mount(App, container);

    expect(container.querySelector("#result")?.textContent).toBe("0");

    count.value = 100;
    flushSync();
    expect(container.querySelector("#result")?.textContent).toBe("100");
  });

  it("should handle large number of parallel mountings", () => {
    const MountTest = cc(({ id }: any) => {
      const inner = signal(0);
      return el("div", { id: `mount-${id}` }, inner);
    });

    const App = cc(() => {
      return el(
        "div",
        {},
        Array.from({ length: 500 }, (_, i) => el(MountTest, { id: i })),
      );
    });

    mount(App, container);
    expect(container.querySelector("#mount-499")).not.toBeNull();
  });

  it("should handle mixed children types (signals, strings, elements, arrays)", async () => {
    const s1 = signal("A");
    const s2 = signal("B");
    const App = cc(() =>
      el("div", { id: "mixed" }, s1, " static ", el("span", {}, s2), [
        el("p", {}, "1"),
        "2",
        s1,
      ]),
    );

    mount(App, container);
    const mixed = container.querySelector("#mixed")!;
    expect(mixed.textContent).toContain("A static B12A");

    s1.value = "X";
    flushSync();
    expect(mixed.textContent).toContain("X static B12X");
  });

  it("should handle extreme event delegation stress", () => {
    let lastClicked = -1;
    const App = cc(() => {
      return el(
        "div",
        {
          onclick: (e: any) => {
            const target = e.target || (e.detail && e.detail.target);
            if (!target) return;
            const id = target.getAttribute("data-id");
            if (id) lastClicked = parseInt(id);
          },
        },
        Array.from({ length: 2000 }, (_, i) =>
          el("span", { "data-id": i }, `I${i}`),
        ),
      );
    });

    mount(App, container);
    const items = container.querySelectorAll("span");
    (items[123] as HTMLElement).click();
    expect(lastClicked).toBe(123);
    (items[1999] as HTMLElement).click();
    expect(lastClicked).toBe(1999);
  });

  it("should handle rapid toggling of deeply nested structures", async () => {
    const visible = signal(true);
    const App = cc(() => {
      return el(Show, {
        when: visible,
        children: () =>
          el(
            "div",
            { class: "outer" },
            Array.from({ length: 10 }, (_, i) =>
              el(
                "div",
                { class: "inner" },
                Array.from({ length: 10 }, (_, j) =>
                  el("span", {}, `S${i}-${j}`),
                ),
              ),
            ),
          ),
      });
    });

    mount(App, container);
    expect(container.querySelectorAll("span").length).toBe(100);

    for (let i = 0; i < 20; i++) {
      visible.value = !visible.value;
      flushSync();
    }

    expect(container.querySelectorAll("span").length).toBe(100);
    visible.value = false;
    flushSync();
    expect(container.querySelectorAll("span").length).toBe(0);
  });

  it("should handle mounting with complex props transformations", () => {
    const App = cc(() => {
      return el(
        "div",
        {},
        Array.from({ length: 1000 }, (_, i) => {
          const props = {
            id: `id-${i}`,
            class: i % 2 === 0 ? "even" : "odd",
            "data-val": i * 10,
            style: {
              color: i % 3 === 0 ? "red" : "blue",
              fontSize: `${(i % 10) + 10}px`,
            },
          };
          return el("div", props, `Item ${i}`);
        }),
      );
    });

    mount(App, container);
    expect(container.querySelectorAll(".even").length).toBe(500);
    const item = container.querySelector("#id-999") as HTMLElement;
    expect(item.style.color).toBe("red");
    expect(item.style.fontSize).toBe("19px");
  });

  it("should handle large scale Portal movement", async () => {
    const targetA = doc.createElement("div");
    const targetB = doc.createElement("div");
    targetA.id = "a";
    targetB.id = "b";
    doc.body.appendChild(targetA);
    doc.body.appendChild(targetB);

    const target = signal("a");
    const App = cc(() => {
      return el(Portal, {
        mount: () => doc.getElementById(target.value),
        children: el("div", { id: "content" }, "Portal Content"),
      });
    });

    mount(App, container);
    flushSync();

    expect(targetA.querySelector("#content")).not.toBeNull();
    expect(targetB.querySelector("#content")).toBeNull();

    target.value = "b";
    flushSync();
    expect(targetA.querySelector("#content")).toBeNull();
    expect(targetB.querySelector("#content")).not.toBeNull();
  });

  it("should handle extreme recursion in functional components", () => {
    const Recursive = (props: { n: number }): SinwanNode => {
      if (props.n <= 0) return "Done";
      return el(
        "div",
        {},
        `Level ${props.n}`,
        el(Recursive, { n: props.n - 1 }),
      );
    };

    const App = cc(() => el(Recursive, { n: 200 }));
    mount(App, container);
    expect(container.textContent).toContain("Level 1");
    expect(container.textContent).toContain("Done");
  });

  it("should handle massive batch updates to thousands of nodes", async () => {
    const signals = Array.from({ length: 1000 }, () => signal(0));
    const App = cc(() =>
      el(
        "div",
        {},
        signals.map((s, i) => el("span", { id: `s-${i}` }, s)),
      ),
    );

    mount(App, container);

    batch(() => {
      for (const s of signals) s.value++;
    });

    flushSync();
    expect(container.querySelector("#s-0")?.textContent).toBe("1");
    expect(container.querySelector("#s-999")?.textContent).toBe("1");
  });

  it("should handle large-scale conditional attribute presence", async () => {
    const active = signal(false);
    const App = cc(() => {
      return el(
        "div",
        {},
        Array.from({ length: 1000 }, (_, i) =>
          el("div", {
            class: "item",
            disabled: () => (active.value ? true : undefined),
            hidden: () => (active.value ? true : undefined),
            "aria-hidden": () => (active.value ? "true" : "false"),
          }),
        ),
      );
    });

    mount(App, container);
    const item = container.querySelector(".item") as HTMLElement;
    expect(item.getAttribute("disabled")).toBeNull();

    active.value = true;
    flushSync();
    expect(item.hasAttribute("disabled")).toBe(true);
    expect(item.hasAttribute("hidden")).toBe(true);
    expect(item.getAttribute("aria-hidden")).toBe("true");
  });

  it("should handle massive child reordering without keys (Index component)", async () => {
    const data = signal(Array.from({ length: 500 }, (_, i) => i));
    const App = cc(() => {
      return el(Index, {
        each: data,
        children: (item: any) => el("div", { class: "index-item" }, item),
      });
    });

    mount(App, container);
    expect(container.querySelectorAll(".index-item").length).toBe(500);

    data.value = Array.from({ length: 500 }, (_, i) => 499 - i);
    flushSync();
    expect(container.querySelectorAll(".index-item")[0].textContent).toBe(
      "499",
    );
    expect(container.querySelectorAll(".index-item")[499].textContent).toBe(
      "0",
    );
  });

  it("should handle lifecycle hooks in deeply nested dynamic components", async () => {
    const comp = signal("A");
    let mounted = 0;

    const CompA = cc(() => {
      onMounted(() => mounted++);
      return el("div", {}, "A");
    });
    const CompB = cc(() => {
      onMounted(() => mounted++);
      return el("div", {}, "B");
    });

    const App = cc(() => {
      return el(Dynamic, {
        component: () => (comp.value === "A" ? CompA : CompB),
      });
    });

    mount(App, container);
    expect(mounted).toBe(1);

    for (let i = 0; i < 50; i++) {
      comp.value = i % 2 === 0 ? "B" : "A";
      flushSync();
    }

    expect(mounted).toBe(51);
  });

  it("should handle complex class object merging at scale", async () => {
    const s1 = signal(true);
    const s2 = signal(false);

    const App = cc(() => {
      return el(
        "div",
        {},
        Array.from({ length: 1000 }, (_, i) =>
          el("div", {
            class: {
              active: s1,
              highlight: s2,
              [`item-${i}`]: true,
              even: i % 2 === 0,
            },
          }),
        ),
      );
    });

    mount(App, container);
    flushSync();
    const first = container.querySelector(".item-0")!;
    expect(first.classList.contains("active")).toBe(true);
    expect(first.classList.contains("highlight")).toBe(false);

    s2.value = true;
    flushSync();
    expect(first.classList.contains("highlight")).toBe(true);
  });

  it("should handle SVG coordinate system stress", async () => {
    const time = signal(0);
    const App = cc(() => {
      return el(
        "svg",
        { viewBox: "0 0 100 100" },
        Array.from({ length: 500 }, (_, i) =>
          el("rect", {
            x: () => (i + time.value) % 100,
            y: i % 100,
            width: 1,
            height: 1,
          }),
        ),
      );
    });

    mount(App, container);
    const rect = container.querySelector("rect")!;
    expect(rect.getAttribute("x")).toBe("0");

    time.value = 50;
    flushSync();
    expect(rect.getAttribute("x")).toBe("50");
  });

  it("should handle concurrent mount/unmount in multiple portals", async () => {
    const show = signal(true);
    const App = cc(() =>
      el(
        "div",
        {},
        el("div", { id: "p1" }),
        el("div", { id: "p2" }),
        el(Show, {
          when: show,
          children: () => [
            el(Portal, {
              mount: () => doc.getElementById("p1"),
              children: el("div", { id: "c1" }),
            }),
            el(Portal, {
              mount: () => doc.getElementById("p2"),
              children: el("div", { id: "c2" }),
            }),
          ],
        }),
      ),
    );

    mount(App, container);
    expect(doc.getElementById("c1")).not.toBeNull();

    show.value = false;
    flushSync();
    expect(doc.getElementById("c1")).toBeNull();
  });

  it("should handle large scale text node updates", async () => {
    const text = signal("init");
    const App = cc(() =>
      el(
        "div",
        {},
        Array.from({ length: 1000 }, () => el("p", {}, text)),
      ),
    );

    mount(App, container);
    expect(container.querySelector("p")?.textContent).toBe("init");

    text.value = "updated";
    flushSync();
    expect(container.querySelector("p")?.textContent).toBe("updated");
  });

  it("should handle massive SVG path stress (500 animated paths)", async () => {
    const d = signal("M 0 0 L 10 10");
    const App = cc(() =>
      el(
        "svg",
        {},
        Array.from({ length: 500 }, () => el("path", { d })),
      ),
    );

    mount(App, container);
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      "M 0 0 L 10 10",
    );

    d.value = "M 10 10 L 20 20";
    flushSync();
    expect(container.querySelector("path")?.getAttribute("d")).toBe(
      "M 10 10 L 20 20",
    );
  });

  it("should handle mixed keyed and non-keyed children reordering", async () => {
    const data = signal([1, 2, 3]);
    const App = cc(() =>
      el(
        "div",
        {},
        el(For, {
          each: data,
          key: (i: any) => i,
          children: (i: any) => el("span", {}, i),
        }),
        " - ",
        () => data.value.map((i) => el("b", {}, i)),
      ),
    );

    mount(App, container);
    expect(container.textContent).toBe("123 - 123");

    data.value = [3, 2, 1];
    flushSync();
    expect(container.textContent).toBe("321 - 321");
  });

  it("should handle rapid component property churn", async () => {
    const p1 = signal(0);
    const p2 = signal(0);

    const Child = cc((props: any) => el("div", {}, props.v1, ":", props.v2));
    const App = cc(() => el(Child, { v1: p1, v2: p2 }));

    mount(App, container);
    for (let i = 0; i < 50; i++) {
      p1.value = i;
      p2.value = i * 2;
      flushSync();
    }
    expect(container.textContent).toBe("49:98");
  });

  it("should handle massive child insertion into middle of list", async () => {
    const list = signal([1, 2, 100]);
    const App = cc(() =>
      el(
        "div",
        {},
        el(For, { each: list, children: (i: any) => el("p", {}, i) }),
      ),
    );

    mount(App, container);
    expect(container.querySelectorAll("p").length).toBe(3);

    const newList = [1];
    for (let i = 0; i < 1000; i++) newList.push(i + 3);
    newList.push(100);

    list.value = newList;
    flushSync();
    expect(container.querySelectorAll("p").length).toBe(1002);
    expect(container.querySelectorAll("p")[500].textContent).toBe("502");
  });

  it("should handle deeply nested Dynamic components", async () => {
    const tag = signal("div");
    function RecursiveDynamic(depth: number): SinwanNode {
      if (depth <= 0) return "End";
      return el(Dynamic, {
        component: tag,
        children: RecursiveDynamic(depth - 1),
      });
    }

    const App = cc(() => RecursiveDynamic(50) as SinwanElement);
    mount(App, container);
    expect(container.querySelectorAll("div").length).toBe(50);

    tag.value = "section";
    flushSync();
    expect(container.querySelectorAll("div").length).toBe(0);
    expect(container.querySelectorAll("section").length).toBe(50);
  });

  it("should handle extreme style merging with dynamic strings and objects", async () => {
    const s1 = signal("color: red;");
    const s2 = signal({ background: "blue" });
    const App = cc(() =>
      el("div", {
        id: "t",
        style: () => [s1.value, s2.value, { border: "1px solid green" }],
      }),
    );

    mount(App, container);
    const t = container.querySelector("#t") as HTMLElement;
    expect(t.style.color).toBe("red");
    expect(t.style.background).toBe("blue");

    s1.value = "color: yellow;";
    s2.value = { background: "black" };
    flushSync();
    expect(t.style.color).toBe("yellow");
    expect(t.style.background).toBe("black");
  });

  it("should handle large scale attribute removal", async () => {
    const active = signal(true);
    const App = cc(() =>
      el("div", {
        id: "t",
        "data-a": () => (active.value ? "1" : null),
        "data-b": () => (active.value ? "2" : null),
        title: () => (active.value ? "T" : null),
      }),
    );

    mount(App, container);
    const t = container.querySelector("#t")!;
    expect(t.hasAttribute("data-a")).toBe(true);

    active.value = false;
    flushSync();
    expect(container.querySelector("#t")?.hasAttribute("data-a")).toBe(false);
    expect(t.hasAttribute("title")).toBe(false);
  });

  it("should handle nested For loops with varying keys", async () => {
    const outer = signal([1, 2]);
    const inner = signal(["A", "B"]);
    const App = cc(() =>
      el(For, {
        each: outer,
        children: (o: any) =>
          el(
            "div",
            { class: "outer" },
            el(For, {
              each: inner,
              children: (i: any) => el("span", { class: "inner" }, `${o}${i}`),
            }),
          ),
      }),
    );

    mount(App, container);
    expect(container.querySelectorAll(".inner").length).toBe(4);
    expect(container.textContent).toBe("1A1B2A2B");

    inner.value = ["X"];
    flushSync();
    expect(container.textContent).toBe("1X2X");
  });

  it("should handle massive event listener cleanup", async () => {
    const show = signal(true);
    let clicks = 0;
    const App = cc(() =>
      el(Show, {
        when: show,
        children: () =>
          el(
            "div",
            {},
            Array.from({ length: 1000 }, () =>
              el("button", { onclick: () => clicks++ }, "Click"),
            ),
          ),
      }),
    );

    mount(App, container);
    const btns = container.querySelectorAll("button");
    (btns[500] as HTMLElement).click();
    expect(clicks).toBe(1);

    show.value = false;
    flushSync();
    expect(container.querySelectorAll("button").length).toBe(0);
    // Should not have any memory leaks from listeners (simulated check)
  });

  it("should handle reactive class name diffusion across tree", async () => {
    const theme = signal("light");
    const App = cc(() =>
      el(
        "div",
        { class: theme },
        Array.from({ length: 10 }, () =>
          el(
            "div",
            { class: theme },
            Array.from({ length: 10 }, () =>
              el("span", { class: theme }, theme),
            ),
          ),
        ),
      ),
    );

    mount(App, container);
    expect(container.querySelectorAll(".light").length).toBe(111);

    theme.value = "dark";
    flushSync();
    expect(container.querySelectorAll(".dark").length).toBe(111);
    expect(container.querySelectorAll(".light").length).toBe(0);
  });

  it("should handle extreme fragment to element transitions", async () => {
    const type = signal("fragment");
    const App = cc(() => {
      return el("", {}, () => {
        if (type.value === "fragment") {
          return el("", {}, el("p", {}, "1"), el("p", {}, "2"));
        } else {
          return el("div", {}, el("span", {}, "3"));
        }
      });
    });

    mount(App, container);
    expect(container.querySelectorAll("p").length).toBe(2);

    type.value = "div";
    flushSync();
    expect(container.querySelectorAll("p").length).toBe(0);
    expect(container.querySelectorAll("span").length).toBe(1);
    expect(container.querySelectorAll("span").length).toBe(1);
  });

  it("should handle 1,000 parallel async-like nextTick updates", async () => {
    const values = Array.from({ length: 1000 }, () => signal(0));
    const App = cc(() =>
      el(
        "div",
        {},
        values.map((v) => el("span", {}, v)),
      ),
    );

    mount(App, container);

    for (let i = 0; i < 10; i++) {
      values.forEach((v) => v.value++);
      await nextTick();
    }

    expect(container.querySelector("span")?.textContent).toBe("10");
  });

  it("should handle massive property object churn on custom components", async () => {
    const valA = signal(1);
    const valB = signal(2);
    const Child = cc((p: any) => el("div", {}, p.a, "-", p.b));
    const App = cc(() => el(Child, { a: valA, b: valB }));

    mount(App, container);
    expect(container.textContent).toBe("1-2");

    valA.value = 10;
    valB.value = 20;
    flushSync();
    expect(container.textContent).toBe("10-20");
  });

  it("should handle extremely deep recursive component mounting", () => {
    const Deep = cc((props: { n: number }): SinwanElement => {
      if (props.n <= 0) return el("", {}, "End");
      return el("div", { class: "step" }, el(Deep, { n: props.n - 1 }));
    });

    const App = cc(() => el(Deep, { n: 100 }));
    mount(App, container);
    expect(container.querySelectorAll(".step").length).toBe(100);
  });

  it("should handle massive child reordering with Portal", async () => {
    const order = signal([1, 2, 3]);
    const App = cc(() =>
      el(
        "div",
        {},
        el(For, {
          each: order,
          children: (i: any) =>
            el(Portal, {
              mount: () => container,
              children: el("div", { class: "portal-item" }, i),
            }),
        }),
      ),
    );

    mount(App, container);
    expect(container.querySelectorAll(".portal-item").length).toBe(3);

    order.value = [3, 2, 1];
    flushSync();

    // Check order in container
    const items = container.querySelectorAll(".portal-item");
    expect(items[0].textContent).toBe("3");
    expect(items[1].textContent).toBe("2");
    expect(items[2].textContent).toBe("1");
    expect(items[2].textContent).toBe("1");
  });

  it("should handle large scale mounting of functional components (non-cc)", () => {
    const Func = (props: any) => el("div", { class: "func" }, props.children);
    const App = cc(() =>
      el(
        "div",
        {},
        Array.from({ length: 1000 }, (_, i) => el(Func, {}, `F${i}`)),
      ),
    );

    mount(App, container);
    expect(container.querySelectorAll(".func").length).toBe(1000);
  });

  it("should handle reactive style updates with CSS variables", async () => {
    const color = signal("red");
    const App = cc(() =>
      el("div", {
        id: "t",
        style: () => ({
          "--theme-color": color.value,
          color: "var(--theme-color)",
        }),
      }),
    );

    mount(App, container);
    const t = container.querySelector("#t") as HTMLElement;
    // Note: happy-dom might not resolve CSS variables perfectly but we check the attribute
    expect(t.style.getPropertyValue("--theme-color")).toBe("red");

    color.value = "blue";
    flushSync();
    expect(t.style.getPropertyValue("--theme-color")).toBe("blue");
  });

  it("should handle large scale class merging from signals and functions", async () => {
    const s = signal("a");
    const App = cc(() =>
      el("div", {
        id: "t",
        class: [s, () => "b", { c: true, d: () => s.value === "a" }],
      }),
    );

    mount(App, container);
    flushSync();
    const t = container.querySelector("#t")!;
    expect(t.className).toBe("a b c d");

    s.value = "x";
    flushSync();
    expect(t.className).toBe("x b c");
  });

  it("should handle extreme child node insertion performance", () => {
    const App = cc(() => {
      const items = [];
      for (let i = 0; i < 5000; i++) items.push(el("div", {}, i));
      return el("div", {}, ...items);
    });

    const start = performance.now();
    mount(App, container);
    const end = performance.now();
    // div > div matches the root div too because container is a div.
    // Use childNodes of the root div.
    expect(container.firstElementChild?.children.length).toBe(5000);
    // console.log(`Mounting 5,000 nodes took ${end - start}ms`);
  });

  it("should handle extreme event bubbling (100 layers)", () => {
    let bubbleCount = 0;
    function DeepEvent(depth: number): SinwanNode {
      if (depth <= 0) return el("button", { id: "clicker" }, "Click Me");
      return el("div", { onclick: () => bubbleCount++ }, DeepEvent(depth - 1));
    }

    const App = cc(() => DeepEvent(100) as SinwanElement);
    mount(App, container);

    const btn = doc.getElementById("clicker");
    btn?.click();
    expect(bubbleCount).toBe(100);
  });
});
