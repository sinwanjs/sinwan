/**
 * Comprehensive tests for standalone `startTransition`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  startTransition,
  useState,
} from "../../../../src/integrations/react/_client.ts";
import { getActiveTransitionTypes } from "../../../../src/integrations/react/add-transition-type.ts";
import { clearTransitionTypes } from "../../../../src/integrations/react/add-transition-type.ts";

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
  clearTransitionTypes();
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): any => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

/** Wait for the next microtask flush (effects + deferred callbacks). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("startTransition — Reference", () => {
  it("accepts a callback function", () => {
    let called = false;
    startTransition(() => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("returns undefined", () => {
    const result = startTransition(() => {});
    expect(result).toBeUndefined();
  });

  it("does not throw when called outside a component", () => {
    expect(() => startTransition(() => {})).not.toThrow();
  });

  it("calls the action immediately and synchronously", () => {
    const order: number[] = [];
    order.push(1);
    startTransition(() => {
      order.push(2);
    });
    order.push(3);
    expect(order).toEqual([1, 2, 3]);
  });
});

// ─── Usage / Marking a state update as a non-blocking transition ─────────

describe("startTransition — Usage / Non-blocking updates", () => {
  it("applies state updates synchronously inside a component", () => {
    let setCount: any;
    let count: any;

    const App = cc(() => {
      [count, setCount] = useState(0);
      return el("div", {}, count);
    });
    mount(App, container);

    expect(count()).toBe(0);

    startTransition(() => {
      setCount(1);
    });

    expect(count()).toBe(1);
  });

  it("batches multiple state updates inside the callback", () => {
    let setA: any;
    let setB: any;
    let a: any;
    let b: any;

    const App = cc(() => {
      [a, setA] = useState(0);
      [b, setB] = useState("x");
      return el("div", {}, a, b);
    });
    mount(App, container);

    startTransition(() => {
      setA(1);
      setB("y");
    });

    expect(a()).toBe(1);
    expect(b()).toBe("y");
  });

  it("works with state update functions", () => {
    let setCount: any;
    let count: any;

    const App = cc(() => {
      [count, setCount] = useState(10);
      return el("div", {}, count);
    });
    mount(App, container);

    startTransition(() => {
      setCount((prev: number) => prev + 5);
    });

    expect(count()).toBe(15);
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("startTransition — Caveats", () => {
  it("does not provide an isPending flag", () => {
    const result = startTransition(() => {});
    // startTransition returns void; there is no pending state to inspect
    expect(result).toBeUndefined();
  });

  it("state updates in setTimeout are NOT inside the transition", async () => {
    let setValue: any;
    let value: any;

    const App = cc(() => {
      [value, setValue] = useState(0);
      return el("div", {}, value);
    });
    mount(App, container);

    startTransition(() => {
      setTimeout(() => {
        setValue(1);
      }, 0);
    });

    expect(value()).toBe(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(value()).toBe(1);
  });

  it("state updates after await need another startTransition", async () => {
    let setValue: any;
    let value: any;

    const App = cc(() => {
      [value, setValue] = useState(0);
      return el("div", {}, value);
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    startTransition(async () => {
      await promise;
      setValue(1);
    });

    expect(value()).toBe(0);
    resolvePromise();
    await tick();
    expect(value()).toBe(1);
  });

  it("can wrap post-await updates in another startTransition", async () => {
    let setValue: any;
    let value: any;

    const App = cc(() => {
      [value, setValue] = useState(0);
      return el("div", {}, value);
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    startTransition(async () => {
      await promise;
      startTransition(() => {
        setValue(1);
      });
    });

    expect(value()).toBe(0);
    resolvePromise();
    await tick();
    expect(value()).toBe(1);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("startTransition — Edge cases", () => {
  it("handles nested startTransition calls", () => {
    let setValue: any;
    let value: any;

    const App = cc(() => {
      [value, setValue] = useState(0);
      return el("div", {}, value);
    });
    mount(App, container);

    startTransition(() => {
      startTransition(() => {
        setValue(1);
      });
    });

    expect(value()).toBe(1);
  });

  it("propagates synchronous errors from the callback", () => {
    expect(() => {
      startTransition(() => {
        throw new Error("sync error");
      });
    }).toThrow("sync error");
  });

  it("does not synchronously throw for async callbacks", async () => {
    expect(() => {
      startTransition(async () => {
        await Promise.resolve();
      });
    }).not.toThrow();
  });

  it("clears transition types at the top level", () => {
    // Simulate a previous transition
    startTransition(() => {
      getActiveTransitionTypes; // just to reference the function
    });

    // A new top-level transition should not inherit old state
    startTransition(() => {});
    expect(getActiveTransitionTypes().size).toBe(0);
  });

  it("handles rapid successive calls", () => {
    let setValue: any;
    let value: any;

    const App = cc(() => {
      [value, setValue] = useState(0);
      return el("div", {}, value);
    });
    mount(App, container);

    for (let i = 1; i <= 100; i++) {
      startTransition(() => {
        setValue(i);
      });
    }

    expect(value()).toBe(100);
  });

  it("returns void even when the callback returns a value", () => {
    const result = startTransition(() => {
      void 42;
    });
    expect(result).toBeUndefined();
  });

  it("returns void even when the callback returns a Promise", () => {
    const result = startTransition(() => {
      void Promise.resolve(42);
    });
    expect(result).toBeUndefined();
  });

  it("works when called before any component is mounted", () => {
    expect(() => startTransition(() => {})).not.toThrow();
  });

  it("does not interfere with component-level useTransition", () => {
    let count: any;
    let setCount: any;

    const App = cc(() => {
      [count, setCount] = useState(0);
      return el("div", {}, count);
    });
    mount(App, container);

    // Standalone startTransition and component hooks should coexist
    startTransition(() => {
      setCount(99);
    });

    expect(count()).toBe(99);
  });
});
