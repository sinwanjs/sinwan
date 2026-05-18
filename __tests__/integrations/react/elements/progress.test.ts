/**
 * Comprehensive tests for `<Progress>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Progress,
  useState,
} from "../../../../src/integrations/react/_client.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ───────────────────────────────────────────────────────────

describe("Progress — Reference", () => {
  it("renders a native <progress> element", () => {
    const App = cc(() => Progress({ value: 0.5 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress).toBeTruthy();
    expect(progress.tagName.toLowerCase()).toBe("progress");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Progress({ value: 0.5, id: "my-progress", className: "bar" }),
    );
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.getAttribute("id")).toBe("my-progress");
    expect(progress.getAttribute("class")).toBe("bar");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Progress — Props", () => {
  it("sets value attribute from numeric value", () => {
    const App = cc(() => Progress({ value: 0.5 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.getAttribute("value")).toBe("0.5");
    expect(progress.value).toBe(0.5);
  });

  it("sets max attribute from numeric max", () => {
    const App = cc(() => Progress({ value: 75, max: 100 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.getAttribute("max")).toBe("100");
    expect(progress.max).toBe(100);
  });

  it("defaults max to 1 when not specified", () => {
    const App = cc(() => Progress({ value: 0.5 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.max).toBe(1);
  });

  it("renders value=0 correctly", () => {
    const App = cc(() => Progress({ value: 0 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.getAttribute("value")).toBe("0");
    expect(progress.value).toBe(0);
  });

  it("renders value=1 correctly", () => {
    const App = cc(() => Progress({ value: 1 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.getAttribute("value")).toBe("1");
    expect(progress.value).toBe(1);
  });
});

// ─── Usage / Controlling a progress indicator ──────────────────────────────

describe("Progress — Usage / Controlling a progress indicator", () => {
  it("renders a determinate progress bar with a value", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        Progress({ value: 0 }),
        Progress({ value: 0.5 }),
        Progress({ value: 0.7 }),
        Progress({ value: 75, max: 100 }),
        Progress({ value: 1 }),
      ),
    );
    mount(App, container);
    const bars = container.querySelectorAll(
      "progress",
    ) as unknown as HTMLProgressElement[];
    expect(bars.length).toBe(5);
    expect(bars[0].value).toBe(0);
    expect(bars[1].value).toBe(0.5);
    expect(bars[2].value).toBe(0.7);
    expect(bars[3].value).toBe(75);
    expect(bars[3].max).toBe(100);
    expect(bars[4].value).toBe(1);
  });

  it("renders an indeterminate progress bar when value is null", () => {
    const App = cc(() => Progress({ value: null }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress).toBeTruthy();
    expect(progress.hasAttribute("value")).toBe(false);
    // Indeterminate progress bars have no position
    expect(progress.position).toBe(-1);
  });

  it("updates value reactively when state changes", async () => {
    let setProgressValue: (v: number) => void;

    const App = cc(() => {
      const [value, setValue] = useState(0);
      setProgressValue = setValue;
      return Progress({ value: value, max: 100 });
    });

    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.value).toBe(0);

    setProgressValue!(50);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(progress.value).toBe(50);

    setProgressValue!(100);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(progress.value).toBe(100);
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Progress — Caveats", () => {
  it("omitting value renders indeterminate progress", () => {
    const App = cc(() => Progress({}));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
    expect(progress.position).toBe(-1);
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Progress — Edge cases", () => {
  it("handles value={null} as indeterminate", () => {
    const App = cc(() => Progress({ value: null }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
    expect(progress.position).toBe(-1);
  });

  it("handles value={undefined} as indeterminate", () => {
    const App = cc(() => Progress({ value: undefined }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(false);
    expect(progress.position).toBe(-1);
  });

  it("handles value={0} correctly (does not treat as indeterminate)", () => {
    const App = cc(() => Progress({ value: 0 }));
    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(true);
    expect(progress.value).toBe(0);
    expect(progress.position).toBe(0);
  });

  it("allows controlled progress with useState", async () => {
    let setProgressValue: (v: number) => void;

    const App = cc(() => {
      const [value, setValue] = useState(0);
      setProgressValue = setValue;
      return Progress({ value: value, max: 100 });
    });

    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.value).toBe(0);

    setProgressValue!(50);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(progress.value).toBe(50);

    setProgressValue!(100);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(progress.value).toBe(100);
  });

  it("allows switching from determinate to indeterminate", async () => {
    let setProgressValue: (v: number | null) => void;

    const App = cc(() => {
      const [value, setValue] = useState<number | null>(0.5);
      setProgressValue = setValue;
      return Progress({ value: value });
    });

    mount(App, container);
    const progress = container.querySelector(
      "progress",
    ) as unknown as HTMLProgressElement;
    expect(progress.hasAttribute("value")).toBe(true);
    expect(progress.value).toBe(0.5);

    setProgressValue!(null);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(progress.hasAttribute("value")).toBe(false);
    expect(progress.position).toBe(-1);
  });
});
