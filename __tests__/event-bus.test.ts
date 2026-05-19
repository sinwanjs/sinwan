import { describe, it, expect } from "bun:test";
import {
  SinwanEventBus,
  globalEventBus,
  useEvent,
  useEventNamespace,
  useEventOnce,
} from "../src/event/index.ts";
import { cc } from "../src/component/create.ts";

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
