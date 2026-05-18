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
import { hydrate } from "../src/hydration/hydrate.ts";
import { cc } from "../src/component/create.ts";
import {
  onMounted,
  onUnmounted,
  onUpdated,
  onDispose,
  onHydrated,
  onServer,
  onClient,
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

    const App = cc(() => {
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

    const App = cc(() => {
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

    const Child = cc(() => {
      onMounted(() => order.push("child"));
      return el("span", {}, "child");
    });

    const Parent = cc(() => {
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

    const App = cc(() => {
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

    const Child = cc(() => {
      onUnmounted(() => order.push("child"));
      return el("span");
    });

    const Parent = cc(() => {
      onUnmounted(() => order.push("parent"));
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    const app = mount(Parent, container);
    app.unmount();
    expect(order).toEqual(["child", "parent"]);
  });

  it("can be registered synchronously from onMounted", () => {
    const order: string[] = [];

    const App = cc(() => {
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
    const App = cc(() => {
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

    const Counter = cc(() => {
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

    const App = cc(() => {
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

    const Broken = cc(() => {
      throw new Error("Oops!");
    });

    const App = cc(() => {
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

    const Child = cc(() => {
      injected = inject(THEME, "default");
      return el("span", {}, injected!);
    });

    const App = cc(() => {
      provide(THEME, "dark");
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    mount(App, container);
    expect(injected).toBe("dark");
  });

  it("uses default value when not provided", () => {
    const KEY = Symbol("missing");
    let injected: string | undefined;

    const App = cc(() => {
      injected = inject(KEY, "fallback");
      return el("div");
    });

    mount(App, container);
    expect(injected).toBe("fallback");
  });

  it("child overrides parent provide for deeper children", () => {
    const THEME = Symbol("theme");
    let deepInjected: string | undefined;

    const DeepChild = cc(() => {
      deepInjected = inject(THEME, "none");
      return el("span");
    });

    const Middle = cc(() => {
      provide(THEME, "override");
      return el("div", {}, { tag: DeepChild, props: {}, children: [] } as any);
    });

    const App = cc(() => {
      provide(THEME, "root");
      return el("div", {}, { tag: Middle, props: {}, children: [] } as any);
    });

    mount(App, container);
    expect(deepInjected).toBe("override");
  });

  it("warns and returns undefined when key is missing and no default", () => {
    const KEY = Symbol("missing");
    let injected: string | undefined;
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    const App = cc(() => {
      injected = inject(KEY) as string | undefined;
      return el("div");
    });

    mount(App, container);
    expect(injected).toBeUndefined();
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("not found and no default provided");

    console.warn = originalWarn;
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

    const Child = cc(() => {
      order.push("Child setup");
      onMounted(() => order.push("Child mounted"));
      onUnmounted(() => order.push("Child unmounted"));
      return jsx("span", { children: "child" });
    });

    const Parent = cc(() => {
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

    const Child = cc(() => {
      injected = inject<string>("greeting", "fallback");
      return jsx("span", { children: injected });
    });

    const Parent = cc(() => {
      provide("greeting", "hello-from-parent");
      return jsx("div", { children: jsx(Child, {}) });
    });

    mount(Parent, container);
    expect(injected).toBe("hello-from-parent");
  });

  it("getCurrentInstance returns the child's own instance during setup", () => {
    let parentInstance: any = null;
    let childInstance: any = null;

    const Child = cc(() => {
      childInstance = getCurrentInstance();
      return jsx("span", {});
    });

    const Parent = cc(() => {
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

    const Item = cc(() => {
      setups.push(nextId++);
      return jsx("li", {});
    });

    const List = cc(() =>
      jsxs("ul", {
        children: [jsx(Item, {}), jsx(Item, {}), jsx(Item, {})],
      }),
    );

    mount(List, container);
    expect(setups.length).toBe(3);
  });
});

// ─── onDispose ───────────────────────────────────────────────

describe("onDispose", () => {
  it("fires when component is unmounted", () => {
    let disposed = false;

    const App = cc(() => {
      onDispose(() => {
        disposed = true;
      });
      return el("div", {}, "hello");
    });

    const app = mount(App, container);
    expect(disposed).toBe(false);

    app.unmount();
    expect(disposed).toBe(true);
  });

  it("fires child onDispose before parent (bottom-up)", () => {
    const order: string[] = [];

    const Child = cc(() => {
      onDispose(() => order.push("child"));
      return el("span");
    });

    const Parent = cc(() => {
      onDispose(() => order.push("parent"));
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    const app = mount(Parent, container);
    app.unmount();
    expect(order).toEqual(["child", "parent"]);
  });

  it("fires alongside onUnmounted during unmount", () => {
    const order: string[] = [];

    const App = cc(() => {
      onUnmounted(() => order.push("unmounted"));
      onDispose(() => order.push("disposed"));
      return el("div");
    });

    const app = mount(App, container);
    app.unmount();
    expect(order).toEqual(["unmounted", "disposed"]);
  });
});

// ─── onHydrated ────────────────────────────────────────────

describe("onHydrated", () => {
  it("fires after hydration completes", () => {
    let hydrated = false;

    const App = cc(() => {
      onHydrated(() => {
        hydrated = true;
      });
      return el("div", {}, "hello");
    });

    container.innerHTML = "<div>hello</div>";
    hydrate(App, container);
    expect(hydrated).toBe(true);
  });

  it("fires child onHydrated before parent (bottom-up)", () => {
    const order: string[] = [];

    const Child = cc(() => {
      onHydrated(() => order.push("child"));
      return el("span", {}, "child");
    });

    const Parent = cc(() => {
      onHydrated(() => order.push("parent"));
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    container.innerHTML = "<div><span>child</span></div>";
    hydrate(Parent, container);
    expect(order).toEqual(["child", "parent"]);
  });

  it("does not fire on a fresh client mount", () => {
    let hydrated = false;

    const App = cc(() => {
      onHydrated(() => {
        hydrated = true;
      });
      return el("div", {}, "hello");
    });

    mount(App, container);
    expect(hydrated).toBe(false);
  });
});

// ─── onServer ──────────────────────────────────────────────

describe("onServer", () => {
  it("executes immediately when window is undefined", () => {
    const originalWindow = (globalThis as any).window;
    try {
      delete (globalThis as any).window;

      let serverRan = false;
      const App = cc(() => {
        onServer(() => {
          serverRan = true;
        });
        return el("div");
      });

      mount(App, container);
      expect(serverRan).toBe(true);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("is a no-op when window exists", () => {
    let serverRan = false;
    const App = cc(() => {
      onServer(() => {
        serverRan = true;
      });
      return el("div");
    });

    mount(App, container);
    expect(serverRan).toBe(false);
  });
});

// ─── onClient ──────────────────────────────────────────────

describe("onClient", () => {
  it("executes immediately when window exists", () => {
    let clientRan = false;
    const App = cc(() => {
      onClient(() => {
        clientRan = true;
      });
      return el("div");
    });

    mount(App, container);
    expect(clientRan).toBe(true);
  });

  it("is a no-op when window is undefined", () => {
    const originalWindow = (globalThis as any).window;
    try {
      delete (globalThis as any).window;

      let clientRan = false;
      const App = cc(() => {
        onClient(() => {
          clientRan = true;
        });
        return el("div");
      });

      mount(App, container);
      expect(clientRan).toBe(false);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});

// ─── New hooks throw outside setup ─────────────────────────

describe("new lifecycle hooks outside setup", () => {
  it("onDispose throws outside setup", () => {
    expect(() => onDispose(() => {})).toThrow("outside of component setup");
  });

  it("onHydrated throws outside setup", () => {
    expect(() => onHydrated(() => {})).toThrow("outside of component setup");
  });

  it("onServer throws outside setup", () => {
    expect(() => onServer(() => {})).toThrow("outside of component setup");
  });

  it("onClient throws outside setup", () => {
    expect(() => onClient(() => {})).toThrow("outside of component setup");
  });
});
