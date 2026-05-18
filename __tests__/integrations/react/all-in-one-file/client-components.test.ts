/**
 * Phase 3 — CLIENT components & DOM APIs.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { SUSPENSE_TYPE } from "../../../../src/component/control-flow.ts";
import {
  Profiler,
  StrictMode,
  Suspense,
  createPortal,
  flushSync,
  preconnect,
  prefetchDNS,
  preload,
  preloadModule,
  preinit,
  preinitModule,
  useFormStatus,
  Form,
  Input,
  createRoot,
  hydrateRoot,
  act,
  Activity,
} from "../../../../src/integrations/react/_client.ts";
import { _resetResourceHints } from "../../../../src/integrations/react/resource-hints.ts";

let win: InstanceType<typeof Window>;
let container: HTMLElement;
beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (globalThis as any).performance = win.performance;
  (globalThis as any).SubmitEvent = (globalThis as any).Event;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // happy-dom requires SyntaxError to live on its window for querySelector
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
  _resetResourceHints();
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

describe("StrictMode / Profiler / Suspense", () => {
  it("StrictMode renders children", () => {
    const App = cc(() => StrictMode({ children: el("div", {}, "x") }));
    mount(App, container);
    expect(
      (container.querySelector("div") as unknown as HTMLElement).textContent,
    ).toBe("x");
  });

  it("Profiler fires onRender on mount", () => {
    let calls: Array<[string, string]> = [];
    const App = cc(() =>
      Profiler({
        id: "P",
        onRender: (id, phase) => calls.push([id, phase]),
        children: el("span"),
      }),
    );
    mount(App, container);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toBe("P");
    expect(calls[0][1]).toBe("mount");
  });

  it("Suspense returns a control-flow element", () => {
    const node = Suspense({
      fallback: el("p", {}, "loading"),
      children: el("div"),
    });
    expect(node.tag).toBe(SUSPENSE_TYPE);
    expect((node.props as any).fallback).toBeTruthy();
  });
});

describe("createPortal", () => {
  it("returns a Portal element", () => {
    const target = win.document.createElement("section");
    const node = createPortal(
      el("p", {}, "in portal"),
      target as unknown as Node,
    );
    expect(typeof node.tag).toBe("symbol");
  });
});

describe("flushSync", () => {
  it("runs the callback and returns its value", () => {
    expect(flushSync(() => 7)).toBe(7);
  });
});

describe("resource hints", () => {
  it("preconnect adds a <link rel=preconnect>", () => {
    preconnect("https://cdn.example.com");
    const link = win.document.head.querySelector('link[rel="preconnect"]');
    expect(link).toBeTruthy();
  });

  it("prefetchDNS adds a <link rel=dns-prefetch>", () => {
    prefetchDNS("https://api.example.com");
    expect(
      win.document.head.querySelector('link[rel="dns-prefetch"]'),
    ).toBeTruthy();
  });

  it("preload adds a <link rel=preload> with as", () => {
    preload("/font.woff2", { as: "font", crossOrigin: "anonymous" });
    const link = win.document.head.querySelector(
      'link[rel="preload"]',
    ) as unknown as HTMLLinkElement | null;
    expect(link?.getAttribute("as")).toBe("font");
  });

  it("preloadModule adds a <link rel=modulepreload>", () => {
    preloadModule("/m.js");
    expect(
      win.document.head.querySelector('link[rel="modulepreload"]'),
    ).toBeTruthy();
  });

  it("preinit(style) adds a stylesheet link", () => {
    preinit("/x.css", { as: "style" });
    expect(
      win.document.head.querySelector('link[rel="stylesheet"]'),
    ).toBeTruthy();
  });

  it("preinitModule adds a <script type=module>", () => {
    preinitModule("/m2.js");
    const tag = win.document.head.querySelector(
      'script[type="module"]',
    ) as unknown as HTMLScriptElement | null;
    expect(tag?.src).toContain("/m2.js");
  });
});

describe("useFormStatus", () => {
  it("returns not-pending by default", () => {
    let status: any;
    const App = cc(() => {
      status = useFormStatus();
      return el("div");
    });
    mount(App, container);
    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
    expect(status.method()).toBeNull();
    expect(status.action()).toBeNull();
  });
});

describe("element wrappers", () => {
  it("Input passes through to <input>", () => {
    const App = cc(() => Input({ type: "text", value: "hi" } as any));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input?.tagName.toLowerCase()).toBe("input");
  });

  it("Form with string action renders a form element", () => {
    const App = cc(() => Form({ action: "/submit", children: el("button") }));
    mount(App, container);
    expect(container.querySelector("form")).toBeTruthy();
  });
});

describe("createRoot", () => {
  it("renders and unmounts a component", () => {
    const App = cc(() => el("div", {}, "hi"));
    const root = createRoot(container);
    root.render(App);
    expect(container.textContent).toContain("hi");
    root.unmount();
  });
});

describe("hydrateRoot", () => {
  it("returns a Root with render/unmount", () => {
    container.innerHTML = "<div>hi</div>";
    const App = cc(() => el("div", {}, "hi"));
    const root = hydrateRoot(container, App);
    expect(typeof root.render).toBe("function");
    root.unmount();
  });
});

describe("act", () => {
  it("awaits microtasks and resolves", async () => {
    let touched = false;
    await act(async () => {
      await Promise.resolve();
      touched = true;
    });
    expect(touched).toBe(true);
  });
});

describe("Activity (stable)", () => {
  it("mode=visible renders children normally", () => {
    const App = cc(() =>
      Activity({ mode: "visible", children: el("span", {}, "hi") }),
    );
    mount(App, container);
    expect(container.textContent).toContain("hi");
  });

  it("mode=hidden wraps children in <div hidden>", () => {
    const App = cc(() =>
      Activity({ mode: "hidden", children: el("span", {}, "x") }),
    );
    mount(App, container);
    const div = container.querySelector("div") as unknown as HTMLElement | null;
    expect(div).toBeTruthy();
    expect(div?.hasAttribute("hidden")).toBe(true);
    expect(div?.getAttribute("data-sinwan-activity")).toBe("hidden");
  });

  it("preserves child component structure when switching between visible and hidden", () => {
    // Activity preserves the DOM structure (with hidden attribute) which keeps
    // component instances alive even when not visible
    const Child = cc(() => {
      return el("span", { "data-testid": "child" }, "child content");
    });

    let show = true;
    const App = cc(() => {
      return Activity({
        mode: show ? "visible" : "hidden",
        children: el(Child as any, {}),
      });
    });

    mount(App, container);

    let childSpan = container.querySelector(
      "[data-testid='child']",
    ) as unknown as HTMLElement | null;
    expect(childSpan).toBeTruthy();
    expect(childSpan?.textContent).toBe("child content");
    expect(
      container.querySelector("[data-sinwan-activity='hidden']"),
    ).toBeNull();

    // Hide the activity
    show = false;
    mount(App, container);
    const hiddenDiv = container.querySelector(
      "[data-sinwan-activity='hidden']",
    ) as unknown as HTMLElement | null;
    expect(hiddenDiv).toBeTruthy();
    expect(hiddenDiv?.hasAttribute("hidden")).toBe(true);
    // Child is still in the DOM inside the hidden wrapper
    expect(hiddenDiv?.querySelector("[data-testid='child']")).toBeTruthy();

    // Show again - child is directly in container, not inside hidden div
    show = true;
    mount(App, container);
    childSpan = container.querySelector(
      "[data-testid='child']",
    ) as unknown as HTMLElement | null;
    expect(childSpan).toBeTruthy();
    expect(childSpan?.textContent).toBe("child content");
    expect(
      container.querySelector("[data-sinwan-activity='hidden']"),
    ).toBeNull();
  });

  it("defaults to visible mode when mode is not specified", () => {
    const App = cc(() => Activity({ children: el("span", {}, "default") }));
    mount(App, container);
    expect(container.textContent).toContain("default");
    // Should NOT have a hidden wrapper div
    const hiddenDiv = container.querySelector(
      "[data-sinwan-activity='hidden']",
    );
    expect(hiddenDiv).toBeNull();
  });
});
