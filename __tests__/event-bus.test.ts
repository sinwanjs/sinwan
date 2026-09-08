import { describe, it, expect } from "bun:test";
import {
  SinwanEventBus,
  globalEventBus,
  useEvent,
  useEventNamespace,
  useEventOnce,
} from "../src/event/index.ts";
import { cc } from "../src/component/create.ts";
import { mount } from "../src/renderer/mount.ts";
import { Window } from "happy-dom";
import {
  createSSRContext,
  getSSRContext,
  setSSRContext,
  withSSRContext,
  getCurrentEventBus,
  getSSRFetchData,
} from "../src/event/ssr-context.ts";

describe("SinwanEventBus", () => {
  it("should subscribe and emit events", () => {
    const bus = new SinwanEventBus();
    const calls: unknown[] = [];

    const unsubscribe = bus.on("test", (data) => {
      calls.push(data);
    });

    bus.emit("test", "hello");
    expect(calls).toEqual(["hello"]);

    bus.emit("test", "world");
    expect(calls).toEqual(["hello", "world"]);

    unsubscribe();
    bus.emit("test", "ignored");
    expect(calls).toEqual(["hello", "world"]);
  });

  it("should support multiple listeners for the same event", () => {
    const bus = new SinwanEventBus();
    const calls1: unknown[] = [];
    const calls2: unknown[] = [];

    bus.on("test", (data) => calls1.push(data));
    bus.on("test", (data) => calls2.push(data));

    bus.emit("test", "data");
    expect(calls1).toEqual(["data"]);
    expect(calls2).toEqual(["data"]);
  });

  it("should support once listeners", () => {
    const bus = new SinwanEventBus();
    const calls: unknown[] = [];

    bus.once("test", (data) => calls.push(data));

    bus.emit("test", "first");
    expect(calls).toEqual(["first"]);

    bus.emit("test", "second");
    expect(calls).toEqual(["first"]);
  });

  it("should support namespace patterns with wildcards", () => {
    const bus = new SinwanEventBus();
    const calls: string[] = [];

    bus.onNamespace("user:*", (...args: unknown[]) => {
      calls.push(args[0] as string);
    });

    bus.emit("user:login", { id: 1 });
    bus.emit("user:logout", { id: 1 });
    bus.emit("other:event", {});

    expect(calls).toEqual(["user:login", "user:logout"]);
  });

  it("should support wildcard * pattern", () => {
    const bus = new SinwanEventBus();
    const calls: string[] = [];

    bus.onNamespace("*", (...args: unknown[]) => {
      calls.push(args[0] as string);
    });

    bus.emit("any:event");
    bus.emit("another:event");

    expect(calls).toEqual(["any:event", "another:event"]);
  });

  it("should clear specific event listeners", () => {
    const bus = new SinwanEventBus();
    const calls: unknown[] = [];

    bus.on("test", (data) => calls.push(data));
    bus.emit("test", "before");
    expect(calls).toEqual(["before"]);

    bus.clear("test");
    bus.emit("test", "after");
    expect(calls).toEqual(["before"]);
  });

  it("should clear all event listeners", () => {
    const bus = new SinwanEventBus();
    const calls1: unknown[] = [];
    const calls2: unknown[] = [];

    bus.on("test1", (data) => calls1.push(data));
    bus.on("test2", (data) => calls2.push(data));

    bus.clear();
    bus.emit("test1", "data1");
    bus.emit("test2", "data2");

    expect(calls1).toEqual([]);
    expect(calls2).toEqual([]);
  });

  it("should report listener count", () => {
    const bus = new SinwanEventBus();
    expect(bus.listenerCount("test")).toBe(0);

    bus.on("test", () => {});
    expect(bus.listenerCount("test")).toBe(1);

    bus.on("test", () => {});
    expect(bus.listenerCount("test")).toBe(2);
  });

  it("should check if event has listeners", () => {
    const bus = new SinwanEventBus();
    expect(bus.hasListeners("test")).toBe(false);

    bus.on("test", () => {});
    expect(bus.hasListeners("test")).toBe(true);
  });

  it("should unsubscribe from namespace patterns", () => {
    const bus = new SinwanEventBus();
    const calls: string[] = [];

    const unsubscribe = bus.onNamespace("user:*", (...args: unknown[]) => {
      calls.push(args[0] as string);
    });

    bus.emit("user:login");
    expect(calls).toEqual(["user:login"]);

    unsubscribe();
    bus.emit("user:logout");
    expect(calls).toEqual(["user:login"]);
  });
});

describe("globalEventBus", () => {
  it("should be a singleton instance", () => {
    expect(globalEventBus).toBeInstanceOf(SinwanEventBus);
  });

  it("should work across the application", () => {
    const calls: unknown[] = [];

    globalEventBus.on("global:test", (data) => calls.push(data));
    globalEventBus.emit("global:test", "data");

    expect(calls).toEqual(["data"]);

    // Cleanup
    globalEventBus.clear("global:test");
  });
});

describe("useEvent hook", () => {
  it("should throw when called outside component", () => {
    expect(() => {
      useEvent("test", () => {});
    }).toThrow("useEvent() called outside of component setup.");
  });
});

describe("useEventNamespace hook", () => {
  it("should throw when called outside component", () => {
    expect(() => {
      useEventNamespace("test:*", () => {});
    }).toThrow("useEventNamespace() called outside of component setup.");
  });
});

describe("useEventOnce hook", () => {
  it("should throw when called outside component", () => {
    expect(() => {
      useEventOnce("test", () => {});
    }).toThrow("useEventOnce() called outside of component setup.");
  });
});

// ─── useEvent / useEventNamespace / useEventOnce inside components ──

describe("useEvent inside component", () => {
  it("subscribes and receives events, auto-unsubscribes on unmount", () => {
    const bus = new SinwanEventBus();
    const received: unknown[] = [];
    const Comp = cc(() => {
      useEvent("test:event", (data) => received.push(data), bus);
      return { tag: "div", props: {}, children: [] };
    });
    const win = new Window({ url: "http://localhost" });
    const doc = win.document as unknown as Document;
    (globalThis as any).document = doc;
    (globalThis as any).window = win;
    (globalThis as any).Element = (win as any).Element;
    const container = doc.createElement("div");
    doc.body.appendChild(container);

    const app = mount(Comp, container);
    bus.emit("test:event", "hello");
    expect(received).toEqual(["hello"]);
    app.unmount();
    bus.emit("test:event", "after-unmount");
    expect(received).toEqual(["hello"]);
  });
});

describe("useEventNamespace inside component", () => {
  it("subscribes to namespace pattern and auto-unsubscribes on unmount", () => {
    const bus = new SinwanEventBus();
    const received: string[] = [];
    const Comp = cc(() => {
      useEventNamespace(
        "chat:*",
        (event, data) => received.push(`${event}:${data}`),
        bus,
      );
      return { tag: "div", props: {}, children: [] };
    });
    const win = new Window({ url: "http://localhost" });
    const doc = win.document as unknown as Document;
    (globalThis as any).document = doc;
    (globalThis as any).window = win;
    (globalThis as any).Element = (win as any).Element;
    const container = doc.createElement("div");
    doc.body.appendChild(container);

    const app = mount(Comp, container);
    bus.emit("chat:message", "hi");
    expect(received).toEqual(["chat:message:hi"]);
    app.unmount();
    bus.emit("chat:message", "after");
    expect(received).toEqual(["chat:message:hi"]);
  });
});

describe("useEventOnce inside component", () => {
  it("subscribes once and auto-unsubscribes on unmount", () => {
    const bus = new SinwanEventBus();
    const received: unknown[] = [];
    const Comp = cc(() => {
      useEventOnce("once:event", (data) => received.push(data), bus);
      return { tag: "div", props: {}, children: [] };
    });
    const win = new Window({ url: "http://localhost" });
    const doc = win.document as unknown as Document;
    (globalThis as any).document = doc;
    (globalThis as any).window = win;
    (globalThis as any).Element = (win as any).Element;
    const container = doc.createElement("div");
    doc.body.appendChild(container);

    const app = mount(Comp, container);
    bus.emit("once:event", "first");
    bus.emit("once:event", "second");
    expect(received).toEqual(["first"]);
    app.unmount();
  });
});

// ─── SSR Context ───────────────────────────────────────────

describe("SSR context", () => {
  function removeWindow(): () => void {
    const savedWindow = (globalThis as any).window;
    delete (globalThis as any).window;
    return () => {
      (globalThis as any).window = savedWindow;
    };
  }

  it("createSSRContext returns a fresh context with event bus and maps", () => {
    const ctx = createSSRContext();
    expect(ctx.eventBus).toBeInstanceOf(SinwanEventBus);
    expect(ctx.state).toBeInstanceOf(Map);
    expect(ctx.fetchCache).toBeInstanceOf(Map);
    expect(ctx.pendingFetches).toBeInstanceOf(Set);
  });

  it("getSSRContext returns null on client-side", () => {
    // window is defined in test env → client-side
    expect(getSSRContext()).toBeNull();
  });

  it("getSSRContext returns context on server-side", () => {
    const restore = removeWindow();
    try {
      const ctx = createSSRContext();
      setSSRContext(ctx);
      expect(getSSRContext()).toBe(ctx);
      setSSRContext(null);
      expect(getSSRContext()).toBeNull();
    } finally {
      restore();
    }
  });

  it("setSSRContext returns previous context and restores on server-side", () => {
    const restore = removeWindow();
    try {
      const ctx1 = createSSRContext();
      const ctx2 = createSSRContext();
      setSSRContext(ctx1);
      const prev = setSSRContext(ctx2);
      expect(prev).toBe(ctx1);
      setSSRContext(null);
    } finally {
      restore();
    }
  });

  it("setSSRContext returns null on client-side", () => {
    expect(setSSRContext(null)).toBeNull();
  });

  it("withSSRContext runs fn with context and restores previous", () => {
    const restore = removeWindow();
    try {
      const ctx = createSSRContext();
      const prevCtx = createSSRContext();
      setSSRContext(prevCtx);
      const result = withSSRContext(ctx, () => {
        expect(getSSRContext()).toBe(ctx);
        return "done";
      });
      expect(result).toBe("done");
      expect(getSSRContext()).toBe(prevCtx);
      setSSRContext(null);
    } finally {
      restore();
    }
  });

  it("getCurrentEventBus returns SSR bus on server-side, fallback on client", () => {
    // Client-side: returns fallback
    const fallback = new SinwanEventBus();
    expect(getCurrentEventBus(fallback)).toBe(fallback);

    // Server-side: returns SSR context bus
    const restore = removeWindow();
    try {
      const ctx = createSSRContext();
      setSSRContext(ctx);
      expect(getCurrentEventBus(fallback)).toBe(ctx.eventBus);
      setSSRContext(null);
    } finally {
      restore();
    }
  });

  it("getSSRFetchData returns null on client-side", () => {
    expect(getSSRFetchData()).toBeNull();
  });

  it("getSSRFetchData returns null when fetchCache is empty on server-side", () => {
    const restore = removeWindow();
    try {
      const ctx = createSSRContext();
      setSSRContext(ctx);
      expect(getSSRFetchData()).toBeNull();
      setSSRContext(null);
    } finally {
      restore();
    }
  });

  it("getSSRFetchData returns serialized cache on server-side", () => {
    const restore = removeWindow();
    try {
      const ctx = createSSRContext();
      ctx.fetchCache.set("key1", {
        data: "value1",
        statusCode: 200,
        error: null,
      });
      ctx.fetchCache.set("key2", {
        data: null,
        statusCode: 404,
        error: "not found",
      });
      setSSRContext(ctx);
      const data = getSSRFetchData();
      expect(data).not.toBeNull();
      expect(data!.key1).toEqual({
        data: "value1",
        statusCode: 200,
        error: null,
      });
      expect(data!.key2).toEqual({
        data: null,
        statusCode: 404,
        error: "not found",
      });
      setSSRContext(null);
    } finally {
      restore();
    }
  });
});
