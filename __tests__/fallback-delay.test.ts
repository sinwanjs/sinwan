/**
 * `fallbackDelay` on <Show> and <Suspense>: the fallback appears only when
 * the wait lasts longer than the delay (client render and hydration).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { cc } from "../src/component/create.ts";
import { onMounted } from "../src/component/lifecycle.ts";
import { Show, Suspense } from "../src/component/control-flow.ts";
import { Suspense as ReactSuspense } from "../src/react/suspense.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { renderToString } from "../src/server/renderer.ts";
import { resolveFallbackDelay } from "../src/control-flow/shared/resolveFallbackDelay.ts";
import type { SinwanElement } from "../src/types.ts";

function el(tag: string | Function, props: Record<string, unknown> = {}, ...children: any[]): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children.length === 1 ? children[0] : children;
  }
  return { tag: tag as any, props: finalProps, children };
}

let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  const doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Text = (win as any).Text;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

const text = () => container.textContent ?? "";

describe("resolveFallbackDelay", () => {
  it("keeps positive finite milliseconds, reads getters and signals, else 0", () => {
    expect(resolveFallbackDelay(300)).toBe(300);
    expect(resolveFallbackDelay(() => 120)).toBe(120);
    expect(resolveFallbackDelay(signal(50))).toBe(50);
    for (const value of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, "300"]) {
      expect(resolveFallbackDelay(value)).toBe(0);
    }
  });
});

describe("Show fallbackDelay (client)", () => {
  it("renders nothing, then the fallback once the delay has passed", async () => {
    const ready = signal(false);
    const App = cc(() =>
      el(Show, { when: ready, fallback: el("p", {}, "loading"), fallbackDelay: 20, children: el("b", {}, "data") }),
    );
    mount(App, container);
    expect(text()).toBe("");
    await Bun.sleep(5);
    expect(text()).toBe("");
    await Bun.sleep(30);
    expect(text()).toBe("loading");
    ready.value = true;
    await nextTick();
    expect(text()).toBe("data");
  });

  it("never shows the fallback when `when` turns truthy within the delay", async () => {
    const ready = signal(false);
    const seen: string[] = [];
    const App = cc(() =>
      el(Show, { when: ready, fallback: el("p", {}, "loading"), fallbackDelay: 30, children: el("b", {}, "data") }),
    );
    mount(App, container);
    const observer = new (globalThis as any).window.MutationObserver(() => seen.push(text()));
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    await Bun.sleep(5);
    ready.value = true;
    await nextTick();
    await Bun.sleep(45);
    expect(text()).toBe("data");
    expect(seen.some((value) => value.includes("loading"))).toBe(false);
    observer.disconnect();
  });

  it("waits again on each falsy period; falsy-to-falsy changes keep the running wait", async () => {
    const value = signal<string | null | false>("a");
    const App = cc(() =>
      el(Show, {
        when: value,
        fallback: "empty",
        fallbackDelay: 20,
        children: (current: string) => el("span", {}, current),
      }),
    );
    mount(App, container);
    expect(text()).toBe("a");

    value.value = null;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(10);
    value.value = false;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(20);
    expect(text()).toBe("empty");

    value.value = "b";
    await nextTick();
    expect(text()).toBe("b");
    value.value = null;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(30);
    expect(text()).toBe("empty");
  });

  it("unmounting while waiting cancels the fallback", async () => {
    const App = cc(() => el(Show, { when: false, fallback: "late", fallbackDelay: 10 }, "never"));
    const app = mount(App, container);
    app.unmount();
    await Bun.sleep(25);
    expect(text()).toBe("");
  });

  it("fires mounted hooks for a component fallback shown after the delay", async () => {
    const mounted: string[] = [];
    const Spinner = cc(() => {
      onMounted(() => mounted.push("spinner"));
      return el("i", {}, "spinning");
    });
    const App = cc(() => el(Show, { when: false, fallback: el(Spinner), fallbackDelay: 10 }, "data"));
    mount(App, container);
    expect(mounted).toEqual([]);
    await Bun.sleep(25);
    expect(text()).toBe("spinning");
    expect(mounted).toEqual(["spinner"]);
  });

  it("a zero delay keeps the immediate fallback", () => {
    const App = cc(() => el(Show, { when: false, fallback: "now", fallbackDelay: 0 }, "data"));
    mount(App, container);
    expect(text()).toBe("now");
  });
});

describe("Show fallbackDelay (server and hydration)", () => {
  it("the server renders the fallback at once", async () => {
    const App = cc(() => el(Show, { when: false, fallback: "loading", fallbackDelay: 300 }, "data"));
    expect(await renderToString(App({}))).toContain("loading");
  });

  it("adopts the server's fallback, then waits on later falsy periods", async () => {
    const ready = signal(false);
    const App = cc(() =>
      el(
        "div",
        {},
        el(Show, { when: ready, fallback: el("p", {}, "loading"), fallbackDelay: 20, children: el("b", {}, "data") }),
      ),
    );
    container.innerHTML = await renderToHydratableString(App);
    const app = hydrate(App, container);
    expect(text()).toBe("loading");

    ready.value = true;
    await nextTick();
    expect(text()).toBe("data");
    ready.value = false;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(30);
    expect(text()).toBe("loading");
    app.unmount();
  });

  it("a truthy `when` within the delay never shows the fallback after hydration", async () => {
    const ready = signal(true);
    const App = cc(() =>
      el("div", {}, el(Show, { when: ready, fallback: "loading", fallbackDelay: 25, children: el("b", {}, "data") })),
    );
    container.innerHTML = await renderToHydratableString(App);
    const app = hydrate(App, container);
    expect(text()).toBe("data");
    ready.value = false;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(5);
    ready.value = true;
    await nextTick();
    await Bun.sleep(35);
    expect(text()).toBe("data");
    app.unmount();
  });
});

describe("Suspense fallbackDelay (client)", () => {
  it("renders nothing while suspended, then the fallback, then the content", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => el("p", {}, await pending.promise));
    const App = cc(() => el(Suspense, { fallback: el("p", {}, "loading"), fallbackDelay: 20, children: el(AsyncChild) }));
    mount(App, container);
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(30);
    expect(text()).toBe("loading");
    pending.resolve("content");
    await nextTick();
    await nextTick();
    expect(text()).toBe("content");
  });

  it("children resolving within the delay never show the fallback", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => el("p", {}, await pending.promise));
    const App = cc(() => el(Suspense, { fallback: el("p", {}, "loading"), fallbackDelay: 30, children: el(AsyncChild) }));
    mount(App, container);
    await nextTick();
    pending.resolve("fast");
    await nextTick();
    await nextTick();
    expect(text()).toBe("fast");
    await Bun.sleep(45);
    expect(text()).toBe("fast");
  });

  it("unmounting while waiting cancels the fallback", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => el("p", {}, await pending.promise));
    const App = cc(() => el(Suspense, { fallback: "loading", fallbackDelay: 10, children: el(AsyncChild) }));
    const app = mount(App, container);
    await nextTick();
    app.unmount();
    await Bun.sleep(25);
    expect(text()).toBe("");
  });

  it("fires mounted hooks for a component fallback; the React entry passes the delay through", async () => {
    const mounted: string[] = [];
    const Spinner = cc(() => {
      onMounted(() => mounted.push("spinner"));
      return el("i", {}, "spinning");
    });
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => el("p", {}, await pending.promise));
    const App = cc(() => el(ReactSuspense, { fallback: el(Spinner), fallbackDelay: 10, children: el(AsyncChild) }));
    mount(App, container);
    await nextTick();
    expect(mounted).toEqual([]);
    await Bun.sleep(25);
    expect(text()).toBe("spinning");
    expect(mounted).toEqual(["spinner"]);
    pending.resolve("done");
    await nextTick();
    await nextTick();
    expect(text()).toBe("done");
  });
});

describe("Suspense fallbackDelay (hydration)", () => {
  function suspendingApp(delay: number) {
    const trigger = signal(0);
    const state = { suspend: false, promise: Promise.withResolvers<void>() };
    const Child = cc(() => {
      void trigger.value;
      if (state.suspend) throw state.promise.promise;
      return el("span", {}, "content");
    });
    const App = cc(() =>
      el(Suspense, { fallback: el("p", {}, "loading"), fallbackDelay: delay }, el(Child)),
    );
    return { App, trigger, state };
  }

  it("a later suspension renders nothing, then the fallback, then the content", async () => {
    const { App, trigger, state } = suspendingApp(20);
    container.innerHTML = await renderToHydratableString(App);
    const app = hydrate(App, container);
    expect(text()).toContain("content");

    state.suspend = true;
    trigger.value = 1;
    await nextTick();
    expect(text()).toBe("");
    await Bun.sleep(30);
    expect(text()).toBe("loading");

    state.suspend = false;
    state.promise.resolve();
    await nextTick();
    await nextTick();
    expect(text()).toBe("content");
    app.unmount();
  });

  it("content resolving within the delay never shows the fallback; unmount clears a waiting timer", async () => {
    const { App, trigger, state } = suspendingApp(30);
    container.innerHTML = await renderToHydratableString(App);
    const app = hydrate(App, container);

    state.suspend = true;
    trigger.value = 1;
    await nextTick();
    state.suspend = false;
    state.promise.resolve();
    await nextTick();
    await nextTick();
    expect(text()).toBe("content");
    await Bun.sleep(45);
    expect(text()).toBe("content");

    state.suspend = true;
    state.promise = Promise.withResolvers<void>();
    trigger.value = 2;
    await nextTick();
    app.unmount();
    await Bun.sleep(45);
    expect(text()).toBe("");
  });
});
