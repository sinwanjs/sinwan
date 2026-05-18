/**
 * Comprehensive tests for `act`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: `act` is a test helper that wraps renders and interactions so all
 * pending updates are flushed before assertions.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  act,
  createRoot,
  useState,
  useEffect,
} from "../../../../src/integrations/react/_client.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("act — Reference", () => {
  it("accepts an async function and returns a Promise", async () => {
    let ran = false;
    const promise = act(async () => {
      await Promise.resolve();
      ran = true;
    });
    expect(promise).toBeInstanceOf(Promise);
    await promise;
    expect(ran).toBe(true);
  });

  it("accepts a sync function and returns a Promise", async () => {
    let ran = false;
    const promise = act(() => {
      ran = true;
      return 42;
    });
    expect(promise).toBeInstanceOf(Promise);
    const result = await promise;
    expect(ran).toBe(true);
    expect(result).toBe(42);
  });

  it("throws when IS_REACT_ACT_ENVIRONMENT is not set", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
    expect(() => {
      act(() => {});
    }).toThrow("not configured to support act");
  });

  it("returns the resolved value from an async scope", async () => {
    const result = await act(async () => {
      await Promise.resolve();
      return "hello";
    });
    expect(result).toBe("hello");
  });
});

// ─── Usage / Rendering components in tests ──────────────────────────────────

describe("act — Usage / Rendering components in tests", () => {
  it("renders a component and flushes effects before assertions", async () => {
    let effectRan = false;
    const Counter = cc(() => {
      const [count] = useState(0);
      useEffect(() => {
        effectRan = true;
      }, []);
      return el("div", {}, count);
    });

    await act(async () => {
      const root = createRoot(container);
      root.render(Counter);
    });

    expect(container.textContent).toBe("0");
    expect(effectRan).toBe(true);
  });

  it("flushes state updates triggered during render", async () => {
    const Counter = cc(() => {
      const [count, setCount] = useState(0);
      return el(
        "button",
        {
          onClick: () => setCount((c: number) => c + 1),
        },
        count,
      );
    });

    await act(async () => {
      const root = createRoot(container);
      root.render(Counter);
    });

    expect(container.textContent).toBe("0");
  });
});

// ─── Usage / Dispatching events in tests ────────────────────────────────────

describe("act — Usage / Dispatching events in tests", () => {
  it("flushes DOM updates after dispatching an event", async () => {
    const Counter = cc(() => {
      const [count, setCount] = useState(0);
      return el(
        "button",
        {
          onClick: () => setCount((c: number) => c + 1),
        },
        count,
      );
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(Counter);
    });

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    expect(button.textContent).toBe("0");

    await act(async () => {
      button.click();
    });

    expect(button.textContent).toBe("1");
  });

  it("flushes effect updates triggered by state changes", async () => {
    let title = "";
    const Counter = cc(() => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        title = `count:${count()}`;
      }, [count]);
      return el(
        "button",
        {
          onClick: () => setCount((c: number) => c + 1),
        },
        count,
      );
    });

    const root = createRoot(container);
    await act(async () => {
      root.render(Counter);
    });

    expect(title).toBe("count:0");

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    await act(async () => {
      button.click();
    });

    expect(title).toBe("count:1");
  });
});

// ─── Troubleshooting ────────────────────────────────────────────────────────

describe("act — Troubleshooting", () => {
  it("error message mentions IS_REACT_ACT_ENVIRONMENT", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = undefined;
    expect(() => act(() => {})).toThrow(
      /global\.IS_REACT_ACT_ENVIRONMENT = true/,
    );
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("act — Edge cases", () => {
  it("handles nested act calls", async () => {
    let order: number[] = [];
    await act(async () => {
      order.push(1);
      await act(async () => {
        order.push(2);
      });
      order.push(3);
    });
    expect(order).toEqual([1, 2, 3]);
  });

  it("rejects when the scope throws synchronously", async () => {
    await expect(
      act(() => {
        throw new Error("sync error");
      }),
    ).rejects.toThrow("sync error");
  });

  it("rejects when the scope returns a rejecting promise", async () => {
    await expect(
      act(async () => {
        await Promise.resolve();
        throw new Error("async error");
      }),
    ).rejects.toThrow("async error");
  });

  it("works with mount directly (not just createRoot)", async () => {
    const App = cc(() => {
      const [count, setCount] = useState(0);
      return el(
        "button",
        {
          onClick: () => setCount((c: number) => c + 1),
        },
        count,
      );
    });

    let app: any;
    await act(() => {
      app = mount(App, container);
    });

    expect(container.textContent).toBe("0");

    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    await act(() => {
      button.click();
    });

    expect(container.textContent).toBe("1");
    app.unmount();
  });

  it("flushes multiple queued microtasks", async () => {
    let order: string[] = [];
    await act(async () => {
      queueMicrotask(() => order.push("a"));
      queueMicrotask(() => order.push("b"));
      queueMicrotask(() => order.push("c"));
      await Promise.resolve();
    });
    expect(order).toEqual(["a", "b", "c"]);
  });
});
