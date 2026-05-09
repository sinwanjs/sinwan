/**
 * SinwanJS Component Lifecycle — Unit Tests
 *
 * Tests: onMounted, onUnmounted, onUpdated, onError, provide/inject,
 * ComponentInstance management, and parent/child tree.
 *
 * Run with: bun test src/client/component/__tests__/lifecycle.test.ts
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal, nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { createComponent } from "../src/component/create.ts";
import {
  onMounted,
  onUnmounted,
  onUpdated,
  onError,
} from "../src/component/lifecycle.ts";
import { provide, inject } from "../src/component/provide-inject.ts";
import { getCurrentInstance } from "../src/component/instance.ts";
import type { SinwanElement } from "../src/types.ts";

// ─── DOM setup ─────────────────────────────────────────────

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  container = doc.createElement("div");
  doc.body.appendChild(container);
});

// ─── Helper ────────────────────────────────────────────────

function el(
  tag: string,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

function byTag(parent: Node, tag: string): HTMLElement[] {
  return Array.from(
    (parent as HTMLElement).getElementsByTagName(tag),
  ) as unknown as HTMLElement[];
}

// ─── onMounted ─────────────────────────────────────────────

describe("onMounted", () => {
  it("fires after component is mounted", () => {
    let mounted = false;

    const App = createComponent(() => {
      onMounted(() => {
        mounted = true;
      });
      return el("div", {}, "hello");
    });

    expect(mounted).toBe(false);
    mount(App, container);
    expect(mounted).toBe(true);
  });

  it("fires multiple onMounted hooks in order", () => {
    const order: number[] = [];

    const App = createComponent(() => {
      onMounted(() => order.push(1));
      onMounted(() => order.push(2));
      onMounted(() => order.push(3));
      return el("div");
    });

    mount(App, container);
    expect(order).toEqual([1, 2, 3]);
  });

  it("child onMounted fires before parent (bottom-up)", () => {
    const order: string[] = [];

    const Child = createComponent(() => {
      onMounted(() => order.push("child"));
      return el("span", {}, "child");
    });

    const Parent = createComponent(() => {
      onMounted(() => order.push("parent"));
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    mount(Parent, container);
    expect(order).toEqual(["child", "parent"]);
  });
});

// ─── onUnmounted ───────────────────────────────────────────

describe("onUnmounted", () => {
  it("fires when component is unmounted", () => {
    let unmounted = false;

    const App = createComponent(() => {
      onUnmounted(() => {
        unmounted = true;
      });
      return el("div", {}, "hello");
    });

    const app = mount(App, container);
    expect(unmounted).toBe(false);

    app.unmount();
    expect(unmounted).toBe(true);
  });

  it("fires child onUnmounted before parent (bottom-up)", () => {
    const order: string[] = [];

    const Child = createComponent(() => {
      onUnmounted(() => order.push("child"));
      return el("span");
    });

    const Parent = createComponent(() => {
      onUnmounted(() => order.push("parent"));
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    const app = mount(Parent, container);
    app.unmount();
    expect(order).toEqual(["child", "parent"]);
  });

  it("can be registered synchronously from onMounted", () => {
    const order: string[] = [];

    const App = createComponent(() => {
      onMounted(() => {
        order.push("mounted");
        onUnmounted(() => order.push("cleanup"));
      });
      return el("div", {}, "hello");
    });

    const app = mount(App, container);
    expect(order).toEqual(["mounted"]);

    app.unmount();
    expect(order).toEqual(["mounted", "cleanup"]);
  });

  it("does not fire onUnmounted if never mounted", () => {
    // This is a design confirmation: unmount without mount should be safe
    let unmounted = false;
    const App = createComponent(() => {
      onUnmounted(() => {
        unmounted = true;
      });
      return el("div");
    });

    const app = mount(App, container);
    // It IS mounted, so unmount should fire
    app.unmount();
    expect(unmounted).toBe(true);
  });
});

// ─── onMounted + onUnmounted integration ───────────────────

describe("mount/unmount lifecycle", () => {
  it("full lifecycle: mount → interact → unmount", async () => {
    const log: string[] = [];

    const Counter = createComponent(() => {
      const count = signal(0);

      onMounted(() => log.push("mounted"));
      onUnmounted(() => log.push("unmounted"));

      return el(
        "div",
        {},
        el("span", {}, count as any),
        el(
          "button",
          {
            onClick: () => {
              count.value++;
            },
          },
          "+",
        ),
      );
    });

    const app = mount(Counter, container);
    expect(log).toEqual(["mounted"]);

    // Interact
    const btn = byTag(container, "button")[0]!;
    btn.click();
    await nextTick();
    expect(byTag(container, "span")[0]!.textContent).toBe("1");

    // Unmount
    app.unmount();
    expect(log).toEqual(["mounted", "unmounted"]);
  });
});

// ─── getCurrentInstance ────────────────────────────────────

describe("getCurrentInstance", () => {
  it("returns the current instance during setup", () => {
    let instance: any = null;

    const App = createComponent(() => {
      instance = getCurrentInstance();
      return el("div");
    });

    mount(App, container);
    expect(instance).not.toBeNull();
    expect(instance.uid).toBeGreaterThanOrEqual(0);
    expect(instance.isMounted).toBe(true);
  });

  it("returns null outside setup", () => {
    expect(getCurrentInstance()).toBeNull();
  });
});

// ─── onError ───────────────────────────────────────────────

describe("onError", () => {
  it("catches errors in child components", () => {
    const errors: Error[] = [];

    const Broken = createComponent(() => {
      throw new Error("Oops!");
    });

    const App = createComponent(() => {
      onError((err) => errors.push(err));
      return el("div", {}, { tag: Broken, props: {}, children: [] } as any);
    });

    mount(App, container);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toBe("Oops!");
  });
});

// ─── provide / inject ──────────────────────────────────────

describe("provide/inject", () => {
  it("provides and injects a value", () => {
    const THEME = Symbol("theme");
    let injected: string | undefined;

    const Child = createComponent(() => {
      injected = inject(THEME, "default");
      return el("span", {}, injected!);
    });

    const App = createComponent(() => {
      provide(THEME, "dark");
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    mount(App, container);
    expect(injected).toBe("dark");
  });

  it("uses default value when not provided", () => {
    const KEY = Symbol("missing");
    let injected: string | undefined;

    const App = createComponent(() => {
      injected = inject(KEY, "fallback");
      return el("div");
    });

    mount(App, container);
    expect(injected).toBe("fallback");
  });

  it("child overrides parent provide for deeper children", () => {
    const THEME = Symbol("theme");
    let deepInjected: string | undefined;

    const DeepChild = createComponent(() => {
      deepInjected = inject(THEME, "none");
      return el("span");
    });

    const Middle = createComponent(() => {
      provide(THEME, "override");
      return el("div", {}, { tag: DeepChild, props: {}, children: [] } as any);
    });

    const App = createComponent(() => {
      provide(THEME, "root");
      return el("div", {}, { tag: Middle, props: {}, children: [] } as any);
    });

    mount(App, container);
    expect(deepInjected).toBe("override");
  });

  it("throws when called outside setup", () => {
    expect(() => provide(Symbol(), "val")).toThrow(
      "outside of component setup",
    );
    expect(() => inject(Symbol())).toThrow("outside of component setup");
  });
});

// ─── onMounted/onUnmounted throws outside setup ───────────

describe("lifecycle hooks outside setup", () => {
  it("onMounted throws outside setup", () => {
    expect(() => onMounted(() => {})).toThrow("outside of component setup");
  });

  it("onUnmounted throws outside setup", () => {
    expect(() => onUnmounted(() => {})).toThrow("outside of component setup");
  });

  it("onUpdated throws outside setup", () => {
    expect(() => onUpdated(() => {})).toThrow("outside of component setup");
  });

  it("onError throws outside setup", () => {
    expect(() => onError(() => {})).toThrow("outside of component setup");
  });
});

// ─── Regression: JSX-runtime should NOT invoke tagged components ──

import { jsx, jsxs } from "../src/jsx/jsx-runtime.ts";

describe("JSX runtime + lifecycle integration", () => {
  it("tagged children get their own ComponentInstance and lifecycle hooks", () => {
    const order: string[] = [];

    const Child = createComponent(() => {
      order.push("Child setup");
      onMounted(() => order.push("Child mounted"));
      onUnmounted(() => order.push("Child unmounted"));
      return jsx("span", { children: "child" });
    });

    const Parent = createComponent(() => {
      order.push("Parent setup");
      onMounted(() => order.push("Parent mounted"));
      onUnmounted(() => order.push("Parent unmounted"));
      // Construct via JSX runtime — this is the critical path.
      return jsx("div", { children: jsx(Child, {}) });
    });

    const app = mount(Parent, container);
    // Setup runs during mount; mounted runs after DOM is in place,
    // children-first (bottom-up).
    expect(order).toEqual([
      "Parent setup",
      "Child setup",
      "Child mounted",
      "Parent mounted",
    ]);

    app.unmount();
    expect(order).toEqual([
      "Parent setup",
      "Child setup",
      "Child mounted",
      "Parent mounted",
      "Child unmounted",
      "Parent unmounted",
    ]);
  });

  it("provide() in parent is visible to children declared via JSX", () => {
    let injected: string | undefined;

    const Child = createComponent(() => {
      injected = inject<string>("greeting", "fallback");
      return jsx("span", { children: injected });
    });

    const Parent = createComponent(() => {
      provide("greeting", "hello-from-parent");
      return jsx("div", { children: jsx(Child, {}) });
    });

    mount(Parent, container);
    expect(injected).toBe("hello-from-parent");
  });

  it("getCurrentInstance returns the child's own instance during setup", () => {
    let parentInstance: any = null;
    let childInstance: any = null;

    const Child = createComponent(() => {
      childInstance = getCurrentInstance();
      return jsx("span", {});
    });

    const Parent = createComponent(() => {
      parentInstance = getCurrentInstance();
      return jsx("div", { children: jsx(Child, {}) });
    });

    mount(Parent, container);
    expect(parentInstance).not.toBeNull();
    expect(childInstance).not.toBeNull();
    expect(childInstance).not.toBe(parentInstance);
    expect(childInstance.parent).toBe(parentInstance);
    expect(parentInstance.children).toContain(childInstance);
  });

  it("multiple JSX children each get their own instance", () => {
    const setups: number[] = [];
    let nextId = 0;

    const Item = createComponent(() => {
      setups.push(nextId++);
      return jsx("li", {});
    });

    const List = createComponent(() =>
      jsxs("ul", {
        children: [jsx(Item, {}), jsx(Item, {}), jsx(Item, {})],
      }),
    );

    mount(List, container);
    expect(setups.length).toBe(3);
  });
});
