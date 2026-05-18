/**
 * Comprehensive tests for `<Profiler>`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan does not maintain a fiber tree, so `<Profiler>` is a
 * measurement shim. It reports "mount" reliably and "update" for direct
 * reactive children in its subtree (signals whose effects are owned by the
 * Profiler instance). Updates inside nested child components are NOT
 * propagated up to the Profiler because Sinwan effects are owned by the
 * component that created them.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Profiler,
  useState,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush (effects + nextTick callbacks). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("Profiler — Reference", () => {
  it("accepts id and onRender props and renders children", () => {
    const App = cc(() =>
      Profiler({
        id: "App",
        onRender: () => {},
        children: el("span", { "data-testid": "child" }, "hello"),
      }),
    );
    mount(App, container);
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
    expect(container.textContent).toBe("hello");
  });

  it("fires onRender on mount with correct parameters", () => {
    const calls: Array<{
      id: string;
      phase: string;
      actualDuration: number;
      baseDuration: number;
      startTime: number;
      commitTime: number;
    }> = [];

    const App = cc(() =>
      Profiler({
        id: "Root",
        onRender: (
          id,
          phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        ) => {
          calls.push({
            id,
            phase,
            actualDuration,
            baseDuration,
            startTime,
            commitTime,
          });
        },
        children: el("div"),
      }),
    );

    mount(App, container);
    expect(calls.length).toBe(1);
    expect(calls[0].id).toBe("Root");
    expect(calls[0].phase).toBe("mount");
    expect(typeof calls[0].actualDuration).toBe("number");
    expect(typeof calls[0].baseDuration).toBe("number");
    expect(typeof calls[0].startTime).toBe("number");
    expect(typeof calls[0].commitTime).toBe("number");
    expect(calls[0].actualDuration).toBeGreaterThanOrEqual(0);
    expect(calls[0].baseDuration).toBeGreaterThanOrEqual(0);
    expect(calls[0].commitTime).toBeGreaterThanOrEqual(calls[0].startTime);
  });

  it("returns a fragment that does not create a wrapper element", () => {
    const App = cc(() =>
      Profiler({
        id: "P",
        onRender: () => {},
        children: el("span", {}, "x"),
      }),
    );
    mount(App, container);
    // The Profiler should not add any wrapper element; span should be direct child of container
    expect(container.children.length).toBe(1);
    expect(container.children[0].tagName).toBe("SPAN");
  });
});

// ─── Usage / Measuring rendering performance programmatically ───────────────

describe("Profiler — Usage / Measuring rendering performance", () => {
  it("reports update phase when direct reactive children change", async () => {
    const calls: Array<[string, string]> = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      return Profiler({
        id: "Counter",
        onRender: (id, phase) => {
          calls.push([id, phase]);
        },
        children: el("div", {}, count),
      });
    });

    mount(App, container);
    expect(calls).toEqual([["Counter", "mount"]]);

    setCount(1);
    await tick();

    // The reactive text node inside the Profiler triggers queueUpdatedHooks
    // on the Profiler instance, so onUpdated should fire.
    expect(calls).toEqual([
      ["Counter", "mount"],
      ["Counter", "update"],
    ]);

    setCount(2);
    await tick();
    expect(calls).toEqual([
      ["Counter", "mount"],
      ["Counter", "update"],
      ["Counter", "update"],
    ]);
  });

  it("reports mount timing that is non-negative and ordered", () => {
    const timings: number[] = [];

    const App = cc(() =>
      Profiler({
        id: "T",
        onRender: (
          _id,
          _phase,
          actualDuration,
          baseDuration,
          startTime,
          commitTime,
        ) => {
          timings.push(startTime, commitTime, actualDuration, baseDuration);
        },
        children: el("div"),
      }),
    );

    mount(App, container);
    expect(timings.length).toBe(4);
    expect(timings[0]).toBeLessThanOrEqual(timings[1]); // startTime <= commitTime
    expect(timings[2]).toBeGreaterThanOrEqual(0); // actualDuration >= 0
    expect(timings[3]).toBeGreaterThanOrEqual(0); // baseDuration >= 0
  });
});

// ─── Usage / Measuring different parts of the application ───────────────────

describe("Profiler — Usage / Measuring different parts", () => {
  it("supports multiple sibling Profilers", () => {
    const calls: Array<{ id: string; phase: string }> = [];

    const App = cc(() =>
      el(
        "div",
        {},
        Profiler({
          id: "Sidebar",
          onRender: (id, phase) => calls.push({ id, phase }),
          children: el("span", {}, "sidebar"),
        }),
        Profiler({
          id: "Content",
          onRender: (id, phase) => calls.push({ id, phase }),
          children: el("span", {}, "content"),
        }),
      ),
    );

    mount(App, container);
    expect(calls.length).toBe(2);
    expect(calls).toContainEqual({ id: "Sidebar", phase: "mount" });
    expect(calls).toContainEqual({ id: "Content", phase: "mount" });
  });

  it("supports nested Profilers", () => {
    const calls: Array<{ id: string; phase: string }> = [];

    const App = cc(() =>
      Profiler({
        id: "Outer",
        onRender: (id, phase) => calls.push({ id, phase }),
        children: Profiler({
          id: "Inner",
          onRender: (id, phase) => calls.push({ id, phase }),
          children: el("span", {}, "nested"),
        }),
      }),
    );

    mount(App, container);
    expect(calls.length).toBe(2);
    expect(calls).toContainEqual({ id: "Outer", phase: "mount" });
    expect(calls).toContainEqual({ id: "Inner", phase: "mount" });
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("Profiler — Caveats", () => {
  it("is a no-op on the server (callback never fires)", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      let fired = false;
      const App = cc(() =>
        Profiler({
          id: "SSR",
          onRender: () => {
            fired = true;
          },
          children: el("div"),
        }),
      );

      // In SSR, calling the component directly should not throw
      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).not.toThrow();
      expect(fired).toBe(false);
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("Profiler — Edge cases", () => {
  it("handles empty children gracefully", () => {
    let fired = false;
    const App = cc(() =>
      Profiler({
        id: "Empty",
        onRender: () => {
          fired = true;
        },
      }),
    );
    mount(App, container);
    expect(fired).toBe(true);
    expect(container.textContent).toBe("");
  });

  it("handles children that are null or undefined", () => {
    let fired = false;
    const App = cc(() =>
      Profiler({
        id: "NullChild",
        onRender: () => {
          fired = true;
        },
        children: null,
      }),
    );
    mount(App, container);
    expect(fired).toBe(true);
  });

  it("does not throw when onRender is accessed during setup", () => {
    const App = cc(() =>
      Profiler({
        id: "Safe",
        onRender: () => {},
        children: el("div"),
      }),
    );
    expect(() => mount(App, container)).not.toThrow();
  });

  it("reports update for direct reactive attribute changes", async () => {
    const calls: Array<[string, string]> = [];
    let setCls: any;

    const App = cc(() => {
      const [cls, setC] = useState("a");
      setCls = setC;

      return Profiler({
        id: "Attr",
        onRender: (id, phase) => {
          calls.push([id, phase]);
        },
        children: el("div", { class: cls }),
      });
    });

    mount(App, container);
    expect(calls).toEqual([["Attr", "mount"]]);

    setCls("b");
    await tick();

    // Reactive attributes on elements inside the Profiler are processed
    // while the Profiler is the current instance, so updates should be
    // reported.
    expect(calls).toEqual([
      ["Attr", "mount"],
      ["Attr", "update"],
    ]);
  });
});
