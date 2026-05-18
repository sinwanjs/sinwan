/**
 * Comprehensive tests for `use`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Suspense,
  use,
  createContext,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush (effects + promise resolutions). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Create a deferred promise that can be resolved/rejected manually. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("use — Reference", () => {
  it("accepts a Promise and returns its resolved value after suspension", async () => {
    const p = Promise.resolve(42);
    // First call throws the pending promise (Suspense contract)
    try {
      use(p);
      expect(false).toBe(true); // should not reach
    } catch (e) {
      expect(e).toBe(p);
    }
    // Wait for microtask so the internal cache records fulfillment
    await tick();
    expect(use(p)).toBe(42);
  });

  it("accepts a Context and returns the context value", () => {
    const ThemeContext = createContext("light");
    let theme: string | undefined;
    const App = cc(() => {
      theme = use(ThemeContext);
      return el("div");
    });
    mount(App, container);
    expect(theme).toBe("light");
  });

  it("throws for non-thenable / non-context values", () => {
    expect(() => use(123 as any)).toThrow(
      "[sinwan/react] use() expected a Promise or Context.",
    );
  });

  it("throws when called outside a component with a Context", () => {
    const Ctx = createContext("x");
    expect(() => {
      use(Ctx);
    }).toThrow("outside of component");
  });
});

// ─── Usage / Reading context with use ─────────────────────────────────────

describe("use — Usage / Reading context with use", () => {
  it("reads context value through use()", () => {
    const ThemeContext = createContext("default");
    let captured: string | undefined;
    const Child = cc(() => {
      captured = use(ThemeContext);
      return el("span");
    });
    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(Child, {}));
    });
    mount(App, container);
    expect(captured).toBe("dark");
  });

  it("can be called conditionally inside an if statement", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;
    const Button = cc((props: { show: boolean }) => {
      if (props.show) {
        captured = use(ThemeContext);
        return el("hr", { class: captured });
      }
      return el("", {});
    });
    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(Button, { show: true }));
    });
    mount(App, container);
    expect(captured).toBe("dark");
  });

  it("can be called inside a loop", () => {
    const ItemContext = createContext("fallback");
    const values: string[] = [];
    const List = cc(() => {
      for (let i = 0; i < 3; i++) {
        values.push(use(ItemContext));
      }
      return el("ul");
    });
    const App = cc(() => {
      return el(ItemContext, { value: "provided" }, el(List, {}));
    });
    mount(App, container);
    expect(values).toEqual(["provided", "provided", "provided"]);
  });

  it("is not affected by providers in the same component", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;
    const App = cc(() => {
      captured = use(ThemeContext);
      return el(ThemeContext, { value: "dark" }, el("div"));
    });
    mount(App, container);
    expect(captured).toBe("light");
  });

  it("resolves to the closest ancestor provider", () => {
    const ThemeContext = createContext("default");
    let outerChild: string | undefined;
    let innerChild: string | undefined;

    const Inner = cc(() => {
      innerChild = use(ThemeContext);
      return el("span");
    });
    const Outer = cc(() => {
      outerChild = use(ThemeContext);
      return el(ThemeContext, { value: "inner" }, el(Inner, {}));
    });
    const App = cc(() => {
      return el(ThemeContext, { value: "outer" }, el(Outer, {}));
    });
    mount(App, container);
    expect(outerChild).toBe("outer");
    expect(innerChild).toBe("inner");
  });
});

// ─── Usage / Streaming data from server to client ───────────────────────

describe("use — Usage / Streaming data from server to client", () => {
  it("suspends component while promise is pending", async () => {
    const { promise, resolve } = createDeferred<string>();

    const Message = cc(() => {
      const message = use(promise);
      return el("p", { "data-testid": "msg" }, message);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        { fallback: el("p", {}, "loading") },
        el(Message as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("loading");
    expect(container.querySelector('[data-testid="msg"]')).toBeNull();

    resolve("hello");
    await tick();

    expect(container.textContent).toContain("hello");
    expect(container.querySelector('[data-testid="msg"]')).toBeTruthy();
  });

  it("resumes with resolved value when promise fulfills", async () => {
    const { promise, resolve } = createDeferred<number>();

    const Counter = cc(() => {
      const value = use(promise);
      return el("span", {}, String(value));
    });

    const App = cc(() =>
      el(
        Suspense as any,
        { fallback: el("p", {}, "wait") },
        el(Counter as any, {}),
      ),
    );

    mount(App, container);
    resolve(99);
    await tick();

    expect(container.textContent).toContain("99");
  });

  it("works with multiple components using the same promise", async () => {
    const { promise, resolve } = createDeferred<string>();

    const A = cc(() => {
      const v = use(promise);
      return el("p", {}, `A: ${v}`);
    });
    const B = cc(() => {
      const v = use(promise);
      return el("p", {}, `B: ${v}`);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        { fallback: el("p", {}, "loading") },
        el(A as any, {}),
        el(B as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("loading");

    resolve("shared");
    await tick();

    expect(container.textContent).toContain("A: shared");
    expect(container.textContent).toContain("B: shared");
  });
});

// ─── Usage / Dealing with rejected Promises ───────────────────────────────

describe("use — Usage / Dealing with rejected Promises", () => {
  it("throws rejection reason when promise is rejected (after cache settles)", async () => {
    const error = new Error("rejected");
    const p = Promise.reject(error);

    // First call throws the promise itself (Suspense contract)
    try {
      use(p);
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBe(p);
    }

    // Wait for microtask so the internal cache records rejection
    await tick();

    // Subsequent call throws the reason
    expect(() => use(p)).toThrow("rejected");
  });

  it("allows catching with Promise.catch before passing to use()", async () => {
    const p = Promise.reject(new Error("fail")).catch(() => "fallback");

    // First call throws the promise
    try {
      use(p);
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBe(p);
    }

    await tick();

    // After the catch resolves, use() returns the fallback value
    expect(use(p)).toBe("fallback");
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("use — Caveats", () => {
  it("must be called inside a Component or Hook for context", () => {
    const Ctx = createContext(0);
    expect(() => {
      use(Ctx);
    }).toThrow("outside of component");
  });

  it("does not consider providers in the component from which use(context) is called", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;
    const App = cc(() => {
      captured = use(ThemeContext);
      return el(ThemeContext, { value: "dark" }, el("div"));
    });
    mount(App, container);
    expect(captured).toBe("light");
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("use — Edge cases", () => {
  it("handles null as a valid resolved value", async () => {
    const p = Promise.resolve(null);
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await tick();
    expect(use(p)).toBeNull();
  });

  it("handles false as a valid resolved value", async () => {
    const p = Promise.resolve(false);
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await tick();
    expect(use(p)).toBe(false);
  });

  it("handles zero as a valid resolved value", async () => {
    const p = Promise.resolve(0);
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await tick();
    expect(use(p)).toBe(0);
  });

  it("handles empty string as a valid resolved value", async () => {
    const p = Promise.resolve("");
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await tick();
    expect(use(p)).toBe("");
  });

  it("shares cache state across multiple calls with the same promise", async () => {
    const { promise, resolve } = createDeferred<string>();

    let valA: string | undefined;
    let valB: string | undefined;

    const A = cc(() => {
      valA = use(promise);
      return el("p", {}, valA);
    });
    const B = cc(() => {
      valB = use(promise);
      return el("p", {}, valB);
    });

    const App = cc(() =>
      el(
        Suspense as any,
        { fallback: el("p", {}, "loading") },
        el(A as any, {}),
        el(B as any, {}),
      ),
    );

    mount(App, container);
    resolve("shared");
    await tick();

    expect(valA).toBe("shared");
    expect(valB).toBe("shared");
  });

  it("works outside a component when given a promise", async () => {
    const p = Promise.resolve("standalone");
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await tick();
    expect(use(p)).toBe("standalone");
  });

  it("distinguishes between a context and a thenable object", async () => {
    const fakeThenable = { then: () => {} };
    // This is a thenable, not a context — should be treated as promise-like
    try {
      use(fakeThenable as any);
      expect(false).toBe(true);
    } catch (e) {
      // It will throw the object because it's "pending" forever
      expect(e).toBe(fakeThenable);
    }
  });
});
