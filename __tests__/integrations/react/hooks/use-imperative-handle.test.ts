/**
 * Comprehensive tests for `useImperativeHandle`.
 *
 * Tests are organized to mirror the React documentation sections.
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
import {
  useImperativeHandle,
  useRef,
  useState,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush. */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useImperativeHandle — Reference", () => {
  it("accepts ref, createHandle, and optional deps", () => {
    const ref: { current: unknown } = { current: null };
    const App = cc(() => {
      useImperativeHandle(ref, () => ({ focus: () => {} }), []);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns undefined", () => {
    let result: unknown = "initial";
    const ref: { current: unknown } = { current: null };
    const App = cc(() => {
      result = useImperativeHandle(ref, () => ({ x: 1 }), []);
      return el("div");
    });
    mount(App, container);
    expect(result).toBeUndefined();
  });

  it("throws when called outside a component", () => {
    const ref: { current: unknown } = { current: null };
    expect(() => {
      useImperativeHandle(ref, () => ({ x: 1 }), []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Exposing a custom ref handle ─────────────────────────────────

describe("useImperativeHandle — Usage / Exposing a custom ref handle", () => {
  it("exposes a custom handle on an object ref after mount", () => {
    const ref: { current: { ping(): string } | null } = { current: null };
    const Inner = cc(() => {
      useImperativeHandle(ref, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    mount(Inner, container);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.ping()).toBe("pong");
  });

  it("exposes only the chosen methods, not the full DOM node", () => {
    const ref: { current: { focus(): void } | null } = { current: null };
    const Inner = cc(() => {
      const innerRef = useRef<HTMLInputElement>(null);
      useImperativeHandle(
        ref,
        () => ({
          focus() {
            innerRef.current?.focus();
          },
        }),
        [],
      );
      return el("input", { ref: innerRef });
    });
    mount(Inner, container);
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current!.focus).toBe("function");
    // The raw DOM node is NOT exposed
    expect((ref.current as any).tagName).toBeUndefined();
  });

  it("closures capture the inner ref so methods work after mount", () => {
    const ref: { current: { getValue(): string } | null } = { current: null };
    const Inner = cc(() => {
      const innerRef = useRef<HTMLInputElement>(null);
      useImperativeHandle(
        ref,
        () => ({
          getValue: () => innerRef.current?.value ?? "",
        }),
        [],
      );
      return el("input", { ref: innerRef, value: "hello" });
    });
    mount(Inner, container);
    expect(ref.current!.getValue()).toBe("hello");
  });
});

// ─── Usage / Exposing your own imperative methods ───────────────────────────

describe("useImperativeHandle — Usage / Exposing your own imperative methods", () => {
  it("can expose a method that combines multiple internal refs", () => {
    const ref: { current: { scrollAndFocus(): string } | null } = {
      current: null,
    };
    const Inner = cc(() => {
      const listRef = useRef<HTMLDivElement>(null);
      const inputRef = useRef<HTMLInputElement>(null);
      useImperativeHandle(
        ref,
        () => ({
          scrollAndFocus: () => {
            const list = listRef.current;
            const input = inputRef.current;
            return `${list?.tagName ?? "null"}:${input?.tagName ?? "null"}`;
          },
        }),
        [],
      );
      return el(
        "div",
        {},
        el("div", { ref: listRef }),
        el("input", { ref: inputRef }),
      );
    });
    mount(Inner, container);
    expect(ref.current!.scrollAndFocus()).toBe("DIV:INPUT");
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("useImperativeHandle — Caveats", () => {
  it("is a no-op on the server", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const ref: { current: { ping(): string } | null } = { current: null };
      const App = cc(() => {
        useImperativeHandle(ref, () => ({ ping: () => "pong" }), []);
        return el("div");
      });
      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).not.toThrow();
      // Ref should remain unchanged on server
      expect(ref.current).toBeNull();
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("does nothing when ref is null", () => {
    const App = cc(() => {
      useImperativeHandle(null, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("registers only once per component instance", () => {
    const ref: { current: number | null } = { current: null };
    let initCount = 0;
    const App = cc(() => {
      useImperativeHandle(ref, () => {
        initCount++;
        return initCount;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(initCount).toBe(1);
    expect(ref.current).toBe(1);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useImperativeHandle — Edge cases", () => {
  it("supports callback refs", () => {
    const calls: unknown[] = [];
    const ref = (handle: unknown | null) => {
      calls.push(handle);
    };
    const App = cc(() => {
      useImperativeHandle(ref as any, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    mount(App, container);
    expect(calls.length).toBe(1);
    expect((calls[0] as any).ping()).toBe("pong");
  });

  it("calls callback ref cleanup on unmount", () => {
    const calls: unknown[] = [];
    const ref = (handle: unknown | null) => {
      calls.push({ type: "set", handle });
      return () => {
        calls.push({ type: "cleanup", handle });
      };
    };
    const App = cc(() => {
      useImperativeHandle(ref as any, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    const app = mount(App, container);
    app.unmount();
    expect(calls).toEqual([
      { type: "set", handle: expect.any(Object) },
      { type: "cleanup", handle: expect.any(Object) },
    ]);
  });

  it("clears object ref on unmount", () => {
    const ref: { current: { ping(): string } | null } = { current: null };
    const App = cc(() => {
      useImperativeHandle(ref, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    const app = mount(App, container);
    expect(ref.current).not.toBeNull();
    app.unmount();
    expect(ref.current).toBeNull();
  });

  it("clears object ref on unmount with no deps", () => {
    const ref: { current: { ping(): string } | null } = { current: null };
    const App = cc(() => {
      useImperativeHandle(ref, () => ({ ping: () => "pong" }));
      return el("div");
    });
    const app = mount(App, container);
    expect(ref.current).not.toBeNull();
    app.unmount();
    expect(ref.current).toBeNull();
  });

  it("re-creates handle when deps change (signal getter)", async () => {
    const ref: { current: { getCount(): number } | null } = { current: null };
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      useImperativeHandle(
        ref,
        () => ({
          getCount: () => (count as unknown as () => number)(),
        }),
        [count],
      );
      return el("div", {}, count as unknown as number);
    });

    mount(App, container);
    expect(ref.current!.getCount()).toBe(0);

    setCount(1);
    await tick();
    expect(ref.current!.getCount()).toBe(1);

    setCount(2);
    await tick();
    expect(ref.current!.getCount()).toBe(2);
  });

  it("does not re-create handle when deps are stable", async () => {
    const ref: { current: { id: number } | null } = { current: null };
    let setCount: any;
    let initCount = 0;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      // stable dep (empty array) — init should only run once
      useImperativeHandle(ref, () => {
        initCount++;
        return { id: initCount };
      }, []);
      return el("div", {}, count as unknown as number);
    });

    mount(App, container);
    expect(initCount).toBe(1);
    expect(ref.current!.id).toBe(1);

    setCount(1);
    await tick();
    // empty deps means no re-creation
    expect(initCount).toBe(1);
    expect(ref.current!.id).toBe(1);
  });

  it("re-creates handle when no deps are provided (runs on every update)", async () => {
    const ref: { current: { getCount(): number } | null } = { current: null };
    let setCount: any;
    let initCount = 0;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      useImperativeHandle(ref, () => {
        initCount++;
        return {
          getCount: () => (count as unknown as () => number)(),
        };
      });
      return el("div", {}, count as unknown as number);
    });

    mount(App, container);
    expect(initCount).toBe(1);
    expect(ref.current!.getCount()).toBe(0);

    setCount(1);
    await tick();
    // no deps → re-runs on every reactive update
    expect(initCount).toBe(2);
    expect(ref.current!.getCount()).toBe(1);
  });

  it("handles multiple useImperativeHandle calls in one component", () => {
    const ref1: { current: { a: number } | null } = { current: null };
    const ref2: { current: { b: string } | null } = { current: null };

    const App = cc(() => {
      useImperativeHandle(ref1, () => ({ a: 1 }), []);
      useImperativeHandle(ref2, () => ({ b: "two" }), []);
      return el("div");
    });

    mount(App, container);
    expect(ref1.current).toEqual({ a: 1 });
    expect(ref2.current).toEqual({ b: "two" });
  });

  it("cleans up previous handle before creating new one when deps change", async () => {
    const cleanupLog: string[] = [];
    const ref = (handle: any | null) => {
      if (handle) {
        cleanupLog.push("set");
        return () => {
          cleanupLog.push("cleanup");
        };
      }
      return undefined;
    };

    let setCount: any;
    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      useImperativeHandle(
        ref as any,
        () => ({ value: (count as unknown as () => number)() }),
        [count],
      );
      return el("div");
    });

    mount(App, container);
    expect(cleanupLog).toEqual(["set"]);

    setCount(1);
    await tick();
    // cleanup old → set new
    expect(cleanupLog).toEqual(["set", "cleanup", "set"]);
  });

  it("does not re-create handle when non-signal deps have same reference", async () => {
    const ref: { current: { id: number } | null } = { current: null };
    let setCount: any;
    let initCount = 0;
    const stableObj = { x: 1 };

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;
      const [stableObjDep] = useState(stableObj);
      useImperativeHandle(ref, () => {
        initCount++;
        return { id: initCount };
      }, [stableObjDep]);
      return el("div", {}, count as unknown as number);
    });

    mount(App, container);
    expect(initCount).toBe(1);

    setCount(1);
    await tick();
    // same object reference → no re-creation
    expect(initCount).toBe(1);
  });

  it("handles null and undefined in dependency list", () => {
    const ref: { current: unknown } = { current: null };
    const App = cc(() => {
      const [nil] = useState<null>(null);
      const [undef] = useState<undefined>(undefined);
      useImperativeHandle(ref, () => ({ ok: true }), [nil, undef]);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
    expect((ref.current as any).ok).toBe(true);
  });
});
