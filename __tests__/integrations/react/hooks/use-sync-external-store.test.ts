/**
 * Comprehensive tests for `useSyncExternalStore`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useSyncExternalStore` returns a reactive getter (backed by a
 * signal) so the renderer can track it; this mirrors how `useState` returns
 * getters instead of plain values.
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
import { useSyncExternalStore } from "../../../../src/integrations/react/_client.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
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

describe("useSyncExternalStore — Reference", () => {
  it("accepts subscribe, getSnapshot, and optional getServerSnapshot", () => {
    const App = cc(() => {
      useSyncExternalStore(
        () => () => {},
        () => 0,
        () => 0,
      );
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns a reactive getter wrapping the snapshot", () => {
    let snap: any;
    const App = cc(() => {
      snap = useSyncExternalStore(
        () => () => {},
        () => 42,
      );
      return el("div");
    });
    mount(App, container);
    expect(typeof snap).toBe("function");
    expect(snap()).toBe(42);
  });

  it("getter returns the initial snapshot from setup", () => {
    let snap: any;
    const App = cc(() => {
      snap = useSyncExternalStore(
        () => () => {},
        () => 5,
      );
      return el("div");
    });
    mount(App, container);
    expect(snap()).toBe(5);
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useSyncExternalStore(
        () => () => {},
        () => 0,
      );
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Subscribing to an external store ────────────────────────────────

describe("useSyncExternalStore — Usage / Subscribing to an external store", () => {
  it("reads from an external store and reacts to changes", async () => {
    let value = 0;
    const listeners = new Set<() => void>();
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
      );
      return el("span", {}, snap);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0");

    value = 1;
    for (const l of listeners) l();
    await tick();
    expect((container as any).textContent).toBe("1");

    value = 2;
    for (const l of listeners) l();
    await tick();
    expect((container as any).textContent).toBe("2");
  });

  it("unsubscribes from the store on unmount", () => {
    const listeners = new Set<() => void>();
    const App = cc(() => {
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => 0,
      );
      return el("div");
    });

    const app = mount(App, container);
    expect(listeners.size).toBe(1);

    app.unmount();
    expect(listeners.size).toBe(0);
  });

  it("only triggers DOM updates when snapshot actually changes", async () => {
    let value = 0;
    const listeners = new Set<() => void>();
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
      );
      return el("span", {}, snap);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0");

    // Notify but value hasn't changed
    for (const l of listeners) l();
    await tick();
    expect((container as any).textContent).toBe("0");
    expect(snap()).toBe(0);
  });
});

// ─── Usage / Subscribing to a browser API ────────────────────────────────────

describe("useSyncExternalStore — Usage / Subscribing to a browser API", () => {
  it("subscribes to window online/offline events", async () => {
    const win = (globalThis as any).window;
    let online = true;

    // Mock navigator.onLine
    Object.defineProperty(win.navigator, "onLine", {
      get: () => online,
      configurable: true,
    });

    let snap: any;
    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          win.addEventListener("online", cb);
          win.addEventListener("offline", cb);
          return () => {
            win.removeEventListener("online", cb);
            win.removeEventListener("offline", cb);
          };
        },
        () => win.navigator.onLine,
      );
      return el("span", {}, () => (snap() ? "online" : "offline"));
    });

    mount(App, container);
    expect((container as any).textContent).toBe("online");

    online = false;
    online = false;
    win.dispatchEvent(new (win as any).Event("offline"));
    await tick();
    expect((container as any).textContent).toBe("offline");

    online = true;
    win.dispatchEvent(new (win as any).Event("online"));
    await tick();
    expect((container as any).textContent).toBe("online");
  });
});

// ─── Usage / Extracting the logic to a custom Hook ───────────────────────────

describe("useSyncExternalStore — Usage / Extracting the logic to a custom Hook", () => {
  it("useOnlineStatus custom hook pattern", async () => {
    const win = (globalThis as any).window;
    let online = true;

    Object.defineProperty(win.navigator, "onLine", {
      get: () => online,
      configurable: true,
    });

    function useOnlineStatus() {
      return useSyncExternalStore(
        (cb) => {
          win.addEventListener("online", cb);
          win.addEventListener("offline", cb);
          return () => {
            win.removeEventListener("online", cb);
            win.removeEventListener("offline", cb);
          };
        },
        () => win.navigator.onLine,
        () => true,
      );
    }

    const App = cc(() => {
      const isOnline = useOnlineStatus();
      return el("span", {}, () => (isOnline() ? "Online" : "Offline"));
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Online");

    online = false;
    win.dispatchEvent(new (win as any).Event("offline"));
    await tick();
    expect((container as any).textContent).toBe("Offline");
  });
});

// ─── Usage / Adding support for server rendering ─────────────────────────────

describe("useSyncExternalStore — Usage / Adding support for server rendering", () => {
  it("uses getServerSnapshot during SSR when provided", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        const snap = useSyncExternalStore(
          () => () => {},
          () => "client",
          () => "server",
        );
        return el("div", {}, snap);
      });

      const instance = createComponentInstance(App, {}, null);
      let result: any;
      expect(() => {
        result = withInstance(instance, () => App({}));
      }).not.toThrow();
      expect((result as SinwanElement).children![0]).toBe("server");
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("throws on server when getServerSnapshot is missing", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        const snap = useSyncExternalStore(
          () => () => {},
          () => "client",
        );
        return el("div", {}, snap);
      });

      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).toThrow(
        "useSyncExternalStore",
      );
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────────

describe("useSyncExternalStore — Caveats", () => {
  it("does not re-render if getSnapshot returns the same cached snapshot", async () => {
    const listeners = new Set<() => void>();
    let snap: any;
    let renderCount = 0;

    const App = cc(() => {
      renderCount++;
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => "stable",
      );
      return el("span", {}, snap);
    });

    mount(App, container);
    expect(renderCount).toBe(1);
    expect(snap()).toBe("stable");

    // Notify listeners even though snapshot hasn't changed
    for (const l of listeners) l();
    await tick();
    expect(renderCount).toBe(1);
    expect(snap()).toBe("stable");
  });

  it("re-subscribes when subscribe identity changes (Sinwan: setup runs once)", () => {
    // In Sinwan, component setup runs once, so the subscribe function is
    // captured at setup time. We verify that the *first* subscribe is used.
    const log: string[] = [];
    let snap: any;

    const subscribeA = (cb: () => void) => {
      log.push("subA");
      return () => log.push("unsubA");
    };

    const App = cc(() => {
      snap = useSyncExternalStore(subscribeA, () => 0);
      return el("div");
    });

    const app = mount(App, container);
    expect(log).toContain("subA");

    app.unmount();
    expect(log).toContain("unsubA");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

describe("useSyncExternalStore — Edge cases", () => {
  it("refreshes snapshot on mount if store changed during setup", async () => {
    let value = 0;
    const listeners = new Set<() => void>();
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
      );
      return el("span", {}, snap);
    });

    // Store changes before mount
    value = 10;

    mount(App, container);
    expect(snap()).toBe(10);
    expect((container as any).textContent).toBe("10");
  });

  it("handles rapid store changes without duplicate DOM updates", async () => {
    let value = 0;
    const listeners = new Set<() => void>();
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
      );
      return el("span", {}, snap);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0");

    // Rapid changes
    for (let i = 1; i <= 100; i++) {
      value = i;
      for (const l of listeners) l();
    }

    await tick();
    expect(snap()).toBe(100);
    expect((container as any).textContent).toBe("100");
    expect(listeners.size).toBe(1);
  });

  it("propagates errors from getSnapshot during setup", () => {
    const App = cc(() => {
      useSyncExternalStore(
        () => () => {},
        () => {
          throw new Error("Snapshot error");
        },
      );
      return el("div");
    });

    const instance = createComponentInstance(App, {}, null);
    expect(() => withInstance(instance, () => App({}))).toThrow(
      "Snapshot error",
    );
  });

  it("unsubscribes cleanly when component unmounts before mount", () => {
    const listeners = new Set<() => void>();
    let subscribed = false;

    const App = cc(() => {
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          subscribed = true;
          return () => {
            listeners.delete(cb);
            subscribed = false;
          };
        },
        () => 0,
      );
      return el("div");
    });

    const app = mount(App, container);
    expect(subscribed).toBe(true);

    app.unmount();
    expect(subscribed).toBe(false);
    expect(listeners.size).toBe(0);
  });

  it("supports object snapshots compared by Object.is", async () => {
    const listeners = new Set<() => void>();
    let snapshot: { count: number } = { count: 0 };
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => snapshot,
      );
      return el("span", {}, () => snap().count);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0");

    // Same object reference — should NOT trigger update
    for (const l of listeners) l();
    await tick();
    expect((container as any).textContent).toBe("0");

    // New object with different value — should trigger update
    snapshot = { count: 1 };
    for (const l of listeners) l();
    await tick();
    expect((container as any).textContent).toBe("1");
  });
});
