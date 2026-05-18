/**
 * Comprehensive tests for `<Activity>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { signal } from "../../../../src/reactivity/index.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Activity,
  useState,
  useEffect,
} from "../../../../src/integrations/react/_client.ts";
import { REACT_ACTIVITY_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";

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

async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("Activity — Reference", () => {
  it("accepts mode and children props", () => {
    const App = cc(() =>
      Activity({ mode: "visible", children: el("span", {}, "hi") }),
    );
    mount(App, container);
    expect(container.textContent).toContain("hi");
  });

  it("has REACT_ACTIVITY_TYPE as $$typeof", () => {
    expect((Activity as any).$$typeof).toBe(REACT_ACTIVITY_TYPE);
  });

  it("has _SinwanComponent marker", () => {
    expect((Activity as any)._SinwanComponent).toBe(true);
  });

  it("defaults to visible mode", () => {
    const App = cc(() => Activity({ children: el("span", {}, "default") }));
    mount(App, container);
    expect(container.textContent).toContain("default");
    expect(
      container.querySelector("[data-sinwan-activity='hidden']"),
    ).toBeNull();
  });
});

// ─── Usage / Restoring state of hidden components ───────────────────────────

describe("Activity — Usage / Restoring state", () => {
  it("preserves useState when toggling hidden then visible", async () => {
    let setCount: (v: number) => void;
    const mode = signal<"visible" | "hidden">("visible");

    const Counter = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      return el("span", { "data-testid": "count" }, count);
    });

    const App = cc(() =>
      Activity({
        mode: mode as any,
        children: el(Counter as any, {}),
      }),
    );

    mount(App, container);
    expect(container.querySelector("[data-testid='count']")?.textContent).toBe(
      "0",
    );

    setCount!(5);
    await tick();
    expect(container.querySelector("[data-testid='count']")?.textContent).toBe(
      "5",
    );

    // Hide
    mode.value = "hidden";
    await tick();

    // Show again
    mode.value = "visible";
    await tick();
    expect(container.querySelector("[data-testid='count']")?.textContent).toBe(
      "5",
    );
  });
});

// ─── Usage / Restoring DOM of hidden components ───────────────────────────────

describe("Activity — Usage / Restoring DOM", () => {
  it("preserves textarea value when hidden", async () => {
    const mode = signal<"visible" | "hidden">("visible");

    const Editor = cc(() => {
      return el("textarea", { "data-testid": "editor" }, "initial");
    });

    const App = cc(() =>
      Activity({
        mode: mode as any,
        children: el(Editor as any, {}),
      }),
    );

    mount(App, container);
    const textarea = container.querySelector(
      "[data-testid='editor']",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // Simulate user typing
    textarea.value = "user typed";
    expect(textarea.value).toBe("user typed");

    // Hide
    mode.value = "hidden";
    await tick();

    // Show again
    mode.value = "visible";
    await tick();
    const textarea2 = container.querySelector(
      "[data-testid='editor']",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea2.value).toBe("user typed");
  });
});

// ─── Usage / Pre-rendering content ──────────────────────────────────────────

describe("Activity — Usage / Pre-rendering", () => {
  it("renders children into the DOM even when initially hidden", () => {
    const App = cc(() =>
      Activity({
        mode: "hidden",
        children: el("span", { "data-testid": "pre" }, "pre-rendered"),
      }),
    );

    mount(App, container);
    const hiddenDiv = container.querySelector(
      "[data-sinwan-activity='hidden']",
    );
    expect(hiddenDiv).toBeTruthy();
    expect(hiddenDiv?.querySelector("[data-testid='pre']")).toBeTruthy();
    expect(hiddenDiv?.textContent).toContain("pre-rendered");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("Activity — Caveats", () => {
  it("cleans up effects when hidden and re-creates them when visible", async () => {
    const mode = signal<"visible" | "hidden">("visible");
    const effectLog: string[] = [];

    const Child = cc(() => {
      useEffect(() => {
        effectLog.push("mount");
        return () => {
          effectLog.push("cleanup");
        };
      }, []);
      return el("span", {}, "child");
    });

    const App = cc(() =>
      Activity({
        mode: mode as any,
        children: el(Child as any, {}),
      }),
    );

    mount(App, container);
    await tick();
    expect(effectLog).toEqual(["mount"]);

    // Hide
    mode.value = "hidden";
    await tick();
    expect(effectLog).toEqual(["mount", "cleanup"]);

    // Show again
    mode.value = "visible";
    await tick();
    expect(effectLog).toEqual(["mount", "cleanup", "mount"]);
  });

  it("applies display: none to the wrapper when hidden", async () => {
    const mode = signal<"visible" | "hidden">("visible");

    const App = cc(() =>
      Activity({
        mode: mode as any,
        children: el("span", {}, "x"),
      }),
    );

    mount(App, container);
    let wrapper = container.querySelector(
      "[data-sinwan-activity]",
    ) as unknown as HTMLElement | null;
    expect(wrapper).toBeTruthy();
    expect(wrapper?.style.display).toBe("");

    mode.value = "hidden";
    await tick();
    wrapper = container.querySelector(
      "[data-sinwan-activity]",
    ) as unknown as HTMLElement | null;
    expect(wrapper?.style.display).toBe("none");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("Activity — Edge cases", () => {
  it("handles rapid toggles without crashing", async () => {
    const mode = signal<"visible" | "hidden">("visible");

    const App = cc(() =>
      Activity({
        mode: mode as any,
        children: el("span", {}, "rapid"),
      }),
    );

    mount(App, container);

    mode.value = "hidden";
    mode.value = "visible";
    mode.value = "hidden";
    mode.value = "visible";
    await tick();

    expect(container.textContent).toContain("rapid");
  });

  it("handles empty children", () => {
    const App = cc(() => Activity({ mode: "visible" }));
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("handles null children", () => {
    const App = cc(() => Activity({ mode: "visible", children: null }));
    mount(App, container);
    expect(container.textContent).toBe("");
  });

  it("handles nested Activity boundaries", async () => {
    const outerMode = signal<"visible" | "hidden">("visible");
    const innerMode = signal<"visible" | "hidden">("visible");
    const log: string[] = [];

    const Inner = cc(() => {
      useEffect(() => {
        log.push("inner-mount");
        return () => {
          log.push("inner-cleanup");
        };
      }, []);
      return el("span", { "data-testid": "inner" }, "inner");
    });

    const App = cc(() =>
      Activity({
        mode: outerMode as any,
        children: Activity({
          mode: innerMode as any,
          children: el(Inner as any, {}),
        }),
      }),
    );

    mount(App, container);
    await tick();
    expect(log).toEqual(["inner-mount"]);

    innerMode.value = "hidden";
    await tick();
    expect(log).toEqual(["inner-mount", "inner-cleanup"]);

    innerMode.value = "visible";
    await tick();
    expect(log).toEqual(["inner-mount", "inner-cleanup", "inner-mount"]);
  });

  it("does not throw when called with plain string mode", () => {
    const App = cc(() =>
      Activity({ mode: "hidden", children: el("div", {}, "ok") }),
    );
    expect(() => mount(App, container)).not.toThrow();
  });
});
