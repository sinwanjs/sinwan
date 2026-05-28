/**
 * React Hooks SSR + Hydration Integration Tests
 *
 * Ensures that React-compatible hooks (useState, useReducer) behave
 * identically to native Sinwan signals during server-side rendering
 * and client-side hydration — including reactive updates after hydration.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../../../../src/component/create.ts";
import { hydrateRoot } from "../../../../src/integrations/react/hydrate-root.ts";
import { renderToHydratableString } from "../../../../src/server/hydration-markers.ts";
import { nextTick } from "../../../../src/reactivity/index.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
} from "../../../../src/integrations/react/_client.ts";
import { onMounted, onUnmounted } from "../../../../src/component/lifecycle.ts";

globalThis.__DEV__ = false;

let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

// ─── useState — text content ──────────────────────────────────────────────

describe("useState + SSR + hydration — text content", () => {
  it("hydrates useState value in text and stays reactive", async () => {
    const App = cc(() => {
      const [count, setCount] = useState(5);
      return el(
        "div",
        {},
        "Count: ",
        count,
        el("button", { onClick: () => setCount((c: number) => c + 1) }, "inc"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.textContent).toContain("Count: 5");

    const root = hydrateRoot(container, App);
    expect(container.textContent).toContain("Count: 5");

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("Count: 6");
    root.unmount();
  });

  it("hydrates useState string value and updates reactively", async () => {
    const App = cc(() => {
      const [text, setText] = useState("hello");
      return el(
        "span",
        {},
        text,
        el("button", { onClick: () => setText("world") }, "change"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.textContent).toContain("hello");

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("world");
    root.unmount();
  });

  it("hydrates useState with initial function and updates", async () => {
    const App = cc(() => {
      const [value, setValue] = useState(() => 42);
      return el(
        "div",
        {},
        value,
        el("button", { onClick: () => setValue(100) }, "set"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.textContent).toContain("42");

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("100");
    root.unmount();
  });
});

// ─── useState — attributes ──────────────────────────────────────────────────

describe("useState + SSR + hydration — attributes", () => {
  it("hydrates useState value in attribute and stays reactive", async () => {
    const App = cc(() => {
      const [count, setCount] = useState(5);
      return el(
        "div",
        {
          "data-count": count,
        },
        el("button", { onClick: () => setCount((c: number) => c + 10) }, "inc"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.querySelector("div")?.getAttribute("data-count")).toBe(
      "5",
    );

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.querySelector("div")?.getAttribute("data-count")).toBe(
      "15",
    );
    root.unmount();
  });

  it("hydrates useState boolean toggling attribute", async () => {
    const App = cc(() => {
      const [active, setActive] = useState(false);
      return el(
        "div",
        {
          "data-active": active,
        },
        el(
          "button",
          { onClick: () => setActive((a: boolean) => !a) },
          "toggle",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    // SSR renders false as no attribute
    expect(container.querySelector("div")?.hasAttribute("data-active")).toBe(
      false,
    );

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    // Boolean true is rendered as empty-value attribute in HTML
    expect(container.querySelector("div")?.hasAttribute("data-active")).toBe(
      true,
    );
    expect(container.querySelector("div")?.getAttribute("data-active")).toBe(
      "",
    );
    root.unmount();
  });
});

// ─── useReducer — text content ────────────────────────────────────────────

describe("useReducer + SSR + hydration — text content", () => {
  it("hydrates useReducer state in text and dispatches reactively", async () => {
    const App = cc(() => {
      const [count, dispatch] = useReducer((s: number, a: number) => s + a, 10);
      return el(
        "div",
        {},
        "Total: ",
        count,
        el("button", { onClick: () => dispatch(5) }, "add"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.textContent).toContain("Total: 10");

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.textContent).toContain("Total: 15");
    root.unmount();
  });

  it("hydrates useReducer with init function and dispatches", async () => {
    const App = cc(() => {
      const [value, dispatch] = useReducer(
        (s: number, a: number) => s * a,
        2,
        (n) => n * 10,
      );
      return el(
        "span",
        {},
        value,
        el("button", { onClick: () => dispatch(3) }, "multiply"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    // init: 2 → 2*10 = 20
    expect(container.textContent).toContain("20");

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    // 20 * 3 = 60
    expect(container.textContent).toContain("60");
    root.unmount();
  });
});

// ─── useReducer — attributes ──────────────────────────────────────────────

describe("useReducer + SSR + hydration — attributes", () => {
  it("hydrates useReducer state in attribute and dispatches reactively", async () => {
    const App = cc(() => {
      const [score, dispatch] = useReducer((s: number, a: number) => s + a, 0);
      return el(
        "div",
        {
          "data-score": score,
        },
        el("button", { onClick: () => dispatch(100) }, "score"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.querySelector("div")?.getAttribute("data-score")).toBe(
      "0",
    );

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(container.querySelector("div")?.getAttribute("data-score")).toBe(
      "100",
    );
    root.unmount();
  });
});

// ─── Multiple hooks in one component ────────────────────────────────────────

describe("multiple hooks + SSR + hydration", () => {
  it("hydrates multiple useState hooks and all stay reactive", async () => {
    const App = cc(() => {
      const [a, setA] = useState(1);
      const [b, setB] = useState(2);
      return el(
        "div",
        {},
        el("span", { id: "a" }, a),
        el("span", { id: "b" }, b),
        el(
          "button",
          { id: "inc-a", onClick: () => setA((x: number) => x + 1) },
          "inc-a",
        ),
        el(
          "button",
          { id: "inc-b", onClick: () => setB((x: number) => x + 10) },
          "inc-b",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.querySelector("#a")?.textContent).toBe("1");
    expect(container.querySelector("#b")?.textContent).toBe("2");

    const root = hydrateRoot(container, App);

    const btnA = container.querySelector(
      "#inc-a",
    ) as unknown as HTMLButtonElement;
    const btnB = container.querySelector(
      "#inc-b",
    ) as unknown as HTMLButtonElement;

    btnA.click();
    await nextTick();
    expect(container.querySelector("#a")?.textContent).toBe("2");
    expect(container.querySelector("#b")?.textContent).toBe("2");

    btnB.click();
    await nextTick();
    expect(container.querySelector("#a")?.textContent).toBe("2");
    expect(container.querySelector("#b")?.textContent).toBe("12");

    root.unmount();
  });

  it("hydrates useState + useReducer together", async () => {
    const App = cc(() => {
      const [count, setCount] = useState(10);
      const [total, dispatch] = useReducer(
        (s: number, a: number) => s + a,
        100,
      );
      return el(
        "div",
        {},
        el("span", { id: "count" }, count),
        el("span", { id: "total" }, total),
        el(
          "button",
          { id: "s", onClick: () => setCount((c: number) => c + 1) },
          "inc-state",
        ),
        el("button", { id: "r", onClick: () => dispatch(50) }, "add-reducer"),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.querySelector("#count")?.textContent).toBe("10");
    expect(container.querySelector("#total")?.textContent).toBe("100");

    const root = hydrateRoot(container, App);

    const btnS = container.querySelector("#s") as unknown as HTMLButtonElement;
    const btnR = container.querySelector("#r") as unknown as HTMLButtonElement;

    btnS.click();
    await nextTick();
    expect(container.querySelector("#count")?.textContent).toBe("11");
    expect(container.querySelector("#total")?.textContent).toBe("100");

    btnR.click();
    await nextTick();
    expect(container.querySelector("#count")?.textContent).toBe("11");
    expect(container.querySelector("#total")?.textContent).toBe("150");

    root.unmount();
  });
});

// ─── Nested components ────────────────────────────────────────────────────

describe("nested components with hooks + SSR + hydration", () => {
  it("hydrates parent with useState and child reading the getter", async () => {
    let parentSetter: any;

    const Child = cc(() => {
      const [label] = useState("child-static");
      return el("span", { id: "child" }, label);
    });

    const Parent = cc(() => {
      const [value, setValue] = useState("parent");
      parentSetter = setValue;
      return el("div", {}, el("span", { id: "parent" }, value), el(Child, {}));
    });

    const html = await renderToHydratableString(Parent);
    container.innerHTML = html;
    expect(container.querySelector("#parent")?.textContent).toBe("parent");
    expect(container.querySelector("#child")?.textContent).toBe("child-static");

    const root = hydrateRoot(container, Parent);

    parentSetter("updated");
    await nextTick();
    expect(container.querySelector("#parent")?.textContent).toBe("updated");
    expect(container.querySelector("#child")?.textContent).toBe("child-static");

    root.unmount();
  });

  it("hydrates deeply nested useState in text across multiple levels", async () => {
    let level2Setter: any;

    const Level2 = cc(() => {
      const [text, setText] = useState("level2");
      level2Setter = setText;
      return el("span", { id: "l2" }, text);
    });

    const Level1 = cc(() => {
      const [text] = useState("level1");
      return el("div", { id: "l1" }, text, el(Level2, {}));
    });

    const html = await renderToHydratableString(Level1);
    container.innerHTML = html;
    expect(container.querySelector("#l1")?.textContent).toContain("level1");
    expect(container.querySelector("#l2")?.textContent).toBe("level2");

    const root = hydrateRoot(container, Level1);

    level2Setter("deep-update");
    await nextTick();
    expect(container.querySelector("#l2")?.textContent).toBe("deep-update");
    expect(container.querySelector("#l1")?.textContent).toContain("level1");

    root.unmount();
  });
});

// ─── Function updater after hydration ─────────────────────────────────────

describe("function updater + SSR + hydration", () => {
  it("hydrates useState and supports function updater after hydration", async () => {
    const App = cc(() => {
      const [count, setCount] = useState(0);
      return el(
        "div",
        {},
        count,
        el(
          "button",
          { onClick: () => setCount((prev: number) => prev + 5) },
          "add5",
        ),
      );
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(container.textContent).toContain("0");

    const root = hydrateRoot(container, App);
    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;

    btn.click();
    await nextTick();
    expect(container.textContent).toContain("5");

    btn.click();
    await nextTick();
    expect(container.textContent).toContain("10");

    root.unmount();
  });
});

// ─── Comparison with native signal ────────────────────────────────────────

describe("React hooks behave like native signals during hydration", () => {
  it("useState text reactivity matches signal text reactivity", async () => {
    // Native signal version
    const { signal } = await import("../../../../src/reactivity/signal.ts");

    const SignalApp = cc(() => {
      const count = signal(7);
      return el(
        "div",
        {},
        count as any,
        el(
          "button",
          {
            onClick: () => {
              count.value = count.value + 3;
            },
          },
          "inc",
        ),
      );
    });

    const html1 = await renderToHydratableString(SignalApp);
    container.innerHTML = html1;
    const root1 = hydrateRoot(container, SignalApp);
    const btn1 = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn1.click();
    await nextTick();
    const signalResult = container.textContent;
    root1.unmount();

    // React useState version
    container.innerHTML = "";
    const HookApp = cc(() => {
      const [count, setCount] = useState(7);
      return el(
        "div",
        {},
        count,
        el("button", { onClick: () => setCount((c: number) => c + 3) }, "inc"),
      );
    });

    const html2 = await renderToHydratableString(HookApp);
    container.innerHTML = html2;
    const root2 = hydrateRoot(container, HookApp);
    const btn2 = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn2.click();
    await nextTick();
    const hookResult = container.textContent;
    root2.unmount();

    expect(hookResult).toBe(signalResult);
    expect(hookResult).toContain("10");
  });
});

// ─── useEffect + hydration ────────────────────────────────────────────────

describe("useEffect + SSR + hydration", () => {
  it("useEffect with no deps fires after hydration", async () => {
    let effectRan = false;

    const App = cc(() => {
      useEffect(() => {
        effectRan = true;
      });
      return el("div", {}, "hello");
    });

    // Simulate true SSR by hiding DOM globals
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    const html = await renderToHydratableString(App);
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;

    container.innerHTML = html;
    expect(effectRan).toBe(false); // SSR: no effect

    const root = hydrateRoot(container, App);
    expect(effectRan).toBe(false); // still synchronous

    await nextTick(); // let queueMicrotask flush
    expect(effectRan).toBe(true);
    root.unmount();
  });

  it("useEffect with deps fires after hydration when deps change", async () => {
    let effectRuns = 0;
    let latestValue = -1;

    const App = cc(() => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        effectRuns++;
        latestValue = (count as any)();
      }, [count]);
      return el(
        "div",
        {},
        count,
        el("button", { onClick: () => setCount((c: number) => c + 1) }, "inc"),
      );
    });

    // Simulate true SSR
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    const html = await renderToHydratableString(App);
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;

    container.innerHTML = html;
    expect(effectRuns).toBe(0);

    const root = hydrateRoot(container, App);
    await nextTick();
    expect(effectRuns).toBe(1);
    expect(latestValue).toBe(0);

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(effectRuns).toBe(2);
    expect(latestValue).toBe(1);
    root.unmount();
  });

  it("useEffect cleanup runs on unmount after hydration", async () => {
    let cleanupRan = false;

    const App = cc(() => {
      useEffect(() => {
        return () => {
          cleanupRan = true;
        };
      });
      return el("div", {}, "hello");
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const root = hydrateRoot(container, App);
    await nextTick();
    expect(cleanupRan).toBe(false);

    root.unmount();
    expect(cleanupRan).toBe(true);
  });
});

// ─── useLayoutEffect + hydration ──────────────────────────────────────────

describe("useLayoutEffect + SSR + hydration", () => {
  it("useLayoutEffect with deps fires synchronously after hydration", async () => {
    let effectRan = false;

    const App = cc(() => {
      const [count] = useState(5);
      useLayoutEffect(() => {
        effectRan = true;
      }, [count]);
      return el("div", {}, count);
    });

    // Simulate true SSR
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    const html = await renderToHydratableString(App);
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;

    container.innerHTML = html;
    expect(effectRan).toBe(false);

    hydrateRoot(container, App);
    // useLayoutEffect runs synchronously during setup, no microtask needed
    expect(effectRan).toBe(true);
  });

  it("useLayoutEffect re-runs synchronously when deps change after hydration", async () => {
    let effectRuns = 0;

    const App = cc(() => {
      const [count, setCount] = useState(1);
      useLayoutEffect(() => {
        effectRuns++;
      }, [count]);
      return el(
        "div",
        {},
        count,
        el("button", { onClick: () => setCount((c: number) => c + 1) }, "inc"),
      );
    });

    // Simulate true SSR
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    const html = await renderToHydratableString(App);
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;

    container.innerHTML = html;
    const root = hydrateRoot(container, App);
    expect(effectRuns).toBe(1);

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await nextTick();

    expect(effectRuns).toBe(2);
    root.unmount();
  });
});

// ─── Sinwan lifecycle hooks + hydration ─────────────────────────────────

describe("Sinwan lifecycle hooks + SSR + hydration", () => {
  it("onMounted fires during hydration", async () => {
    let mounted = false;

    const App = cc(() => {
      onMounted(() => {
        mounted = true;
      });
      return el("div", {}, "hello");
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    expect(mounted).toBe(false);

    hydrateRoot(container, App);
    expect(mounted).toBe(true);
  });

  it("onUnmounted fires on unmount after hydration", async () => {
    let unmounted = false;

    const App = cc(() => {
      onUnmounted(() => {
        unmounted = true;
      });
      return el("div", {}, "hello");
    });

    const html = await renderToHydratableString(App);
    container.innerHTML = html;
    const root = hydrateRoot(container, App);
    expect(unmounted).toBe(false);

    root.unmount();
    expect(unmounted).toBe(true);
  });

  it("onMounted + onUnmounted work with React hooks in same component", async () => {
    let mounted = false;
    let unmounted = false;
    let effectRan = false;

    const App = cc(() => {
      const [count, setCount] = useState(0);

      onMounted(() => {
        mounted = true;
      });
      onUnmounted(() => {
        unmounted = true;
      });
      useEffect(() => {
        effectRan = true;
      }, [count]);

      return el(
        "div",
        {},
        count,
        el("button", { onClick: () => setCount((c: number) => c + 1) }, "inc"),
      );
    });

    // Simulate true SSR
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    (globalThis as any).window = undefined;
    (globalThis as any).document = undefined;
    const html = await renderToHydratableString(App);
    (globalThis as any).window = prevWindow;
    (globalThis as any).document = prevDocument;

    container.innerHTML = html;
    expect(mounted).toBe(false);
    expect(effectRan).toBe(false);

    const root = hydrateRoot(container, App);
    expect(mounted).toBe(true);
    await nextTick();
    expect(effectRan).toBe(true);

    root.unmount();
    expect(unmounted).toBe(true);
  });
});
