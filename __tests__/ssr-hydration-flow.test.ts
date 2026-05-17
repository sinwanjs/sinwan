import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { cc } from "../src/component/create.ts";
import { signal, nextTick } from "../src/reactivity/index.ts";
import { ErrorBoundary } from "../src/component/control-flow.ts";
import { Suspense } from "../src/integrations/react/suspense.ts";
import { Activity } from "../src/integrations/react/activity.ts";
import { ViewTransition } from "../src/integrations/react/view-transition.ts";
import type { SinwanElement } from "../src/types.ts";

function el(
  tag: string | Function | symbol,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children.length === 1 ? children[0] : children;
  }
  return { tag: tag as any, props: finalProps, children };
}

let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

describe("SSR & Hydration Flow Integration Tests", () => {
  // ─── ErrorBoundary ──────────────────────────────────────────────────────────
  describe("ErrorBoundary Compatibility", () => {
    it("hydrates successfully and updates to fallback on reactive error", async () => {
      const triggerError = signal(false);
      const ChildComponent = cc(() => {
        if (triggerError.value) {
          throw new Error("reactive-boom");
        }
        return el("span", {}, "normal-content");
      });

      const App = cc(() =>
        el(
          ErrorBoundary,
          {
            fallback: (err: Error) => el("span", { id: "error" }, err.message),
          },
          el(ChildComponent, {}),
        ),
      );

      // SSR
      const html = await renderToHydratableString(App);
      container.innerHTML = html;
      expect(container.textContent).toContain("normal-content");

      // Hydrate
      const app = hydrate(App, container);
      expect(container.textContent).toContain("normal-content");

      // Change signal to trigger error
      triggerError.value = true;
      await nextTick();

      expect(container.textContent).toContain("reactive-boom");
      app.unmount();
    });
  });

  // ─── Suspense ───────────────────────────────────────────────────────────────
  describe("Suspense Compatibility", () => {
    it("hydrates successfully and reacts to promise resolution", async () => {
      let resolvePromise: any;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      const App = cc(() =>
        el(
          Suspense,
          {
            fallback: el("span", { id: "loading" }, "Loading..."),
          },
          pendingPromise as any,
        ),
      );

      // SSR: Simulating synchronous fallback output with boundary anchors from server
      const html = '<!--sinwan-b--><span id="loading">Loading...</span><!--/sinwan-b-->';
      container.innerHTML = html;
      expect(container.textContent).toContain("Loading...");

      // Hydrate
      const app = hydrate(App, container);
      expect(container.textContent).toContain("Loading...");

      // Resolve the promise
      resolvePromise("resolved-suspense-content");
      await pendingPromise;
      await nextTick();
      await new Promise((r) => setTimeout(r, 20));

      expect(container.textContent).toContain("resolved-suspense-content");
      app.unmount();
    });
  });

  // ─── Activity ───────────────────────────────────────────────────────────────
  describe("Activity Compatibility", () => {
    it("hydrates visible activity, then soft-hides it reactively", async () => {
      const mode = signal<"visible" | "hidden">("visible");
      const App = cc(() =>
        el(
          Activity,
          { mode: mode as any },
          el("span", { class: "content" }, "active-text"),
        ),
      );

      // SSR
      const html = await renderToHydratableString(App);
      container.innerHTML = html;
      expect(container.textContent).toContain("active-text");

      // Hydrate
      const app = hydrate(App, container);
      const wrapper = container.querySelector("div") as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.display).not.toBe("none");

      // Reactively hide it
      mode.value = "hidden";
      await nextTick();
      expect(wrapper.style.display).toBe("none");
      expect(wrapper.hasAttribute("hidden")).toBe(true);

      // Reactively show it again
      mode.value = "visible";
      await nextTick();
      expect(wrapper.style.display).toBe("");
      expect(wrapper.hasAttribute("hidden")).toBe(false);

      app.unmount();
    });

    it("hydrates hidden activity, then soft-shows it reactively", async () => {
      const mode = signal<"visible" | "hidden">("hidden");
      const App = cc(() =>
        el(
          Activity,
          { mode: mode as any },
          el("span", { class: "content" }, "hidden-text"),
        ),
      );

      // SSR
      const html = await renderToHydratableString(App);
      container.innerHTML = html;
      const initialWrapper = container.querySelector("div") as HTMLElement;
      expect(initialWrapper).not.toBeNull();
      expect(initialWrapper.hasAttribute("hidden")).toBe(true);

      // Hydrate
      const app = hydrate(App, container);
      const wrapper = container.querySelector("div") as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.display).toBe("none");

      // Reactively show it
      mode.value = "visible";
      await nextTick();
      expect(wrapper.style.display).toBe("");
      expect(wrapper.hasAttribute("hidden")).toBe(false);

      app.unmount();
    });
  });

  // ─── ViewTransition ─────────────────────────────────────────────────────────
  describe("ViewTransition Compatibility", () => {
    it("hydrates view transition with explicit name", async () => {
      const App = cc(() =>
        el(
          ViewTransition,
          { name: "header-transition" },
          el("span", {}, "transition-content"),
        ),
      );

      // SSR
      const html = await renderToHydratableString(App);
      container.innerHTML = html;
      expect(html).toContain('style="view-transition-name:header-transition"');

      // Hydrate
      const app = hydrate(App, container);
      const wrapper = container.querySelector("div") as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.getAttribute("style")).toContain("view-transition-name:header-transition");
      expect(wrapper.textContent).toContain("transition-content");

      app.unmount();
    });
  });
});
