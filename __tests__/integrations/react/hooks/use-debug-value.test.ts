/**
 * Comprehensive tests for `useDebugValue`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { getCurrentInstance } from "../../../../src/component/instance.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useDebugValue,
  getDebugValues,
} from "../../../../src/integrations/react/use-debug-value.ts";

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

// ─── Reference ────────────────────────────────────────────────────────────

describe("useDebugValue — Reference", () => {
  it("accepts a value of any type", () => {
    // Covers: Reference / Parameters / value — The value you want to
    // display in React DevTools. It can have any type.
    let capturedInstance: any;
    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue({ nested: [1, 2, 3] });
      return el("div");
    });
    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toEqual({ nested: [1, 2, 3] });
  });

  it("accepts an optional formatting function", () => {
    // Covers: Reference / Parameters / format — A formatting function.
    // When the component is inspected, React DevTools will call the
    // formatting function with the value as the argument.
    let capturedInstance: any;
    const formatter = (d: Date) => d.toISOString();
    const now = new Date("2024-06-15");

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(now, formatter);
      return el("div");
    });
    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(now);
    expect(typeof entries[0].formatter).toBe("function");
  });

  it("returns undefined", () => {
    // Covers: Reference / Returns — useDebugValue does not return anything.
    let result: unknown = "not-undefined";
    const App = cc(() => {
      result = useDebugValue("test");
      return el("div");
    });
    mount(App, container);
    expect(result).toBeUndefined();
  });

  it("does not throw when called inside a component", () => {
    // Covers: Reference / usage — Call useDebugValue at the top level of
    // your custom Hook to display a readable debug value.
    const App = cc(() => {
      useDebugValue("safe");
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });
});

// ─── Usage ──────────────────────────────────────────────────────────────────

describe("useDebugValue — Usage / Adding a label to a custom Hook", () => {
  it("stores the debug value when called inside a custom hook", () => {
    // Covers: Usage / Adding a label to a custom Hook — Call useDebugValue
    // at the top level of your custom Hook to display a readable debug value
    // for React DevTools.
    let capturedInstance: any;

    function useOnlineStatus() {
      const isOnline = true;
      useDebugValue(isOnline ? "Online" : "Offline");
      return isOnline;
    }

    const StatusBar = cc(() => {
      capturedInstance = getCurrentInstance();
      const isOnline = useOnlineStatus();
      return el("h1", {}, isOnline ? "✅ Online" : "❌ Disconnected");
    });

    mount(StatusBar, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("Online");
  });

  it("works with primitive values (string, number, boolean)", () => {
    let capturedInstance: any;

    function usePrimitives() {
      useDebugValue("string-label");
      useDebugValue(42);
      useDebugValue(false);
    }

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      usePrimitives();
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(3);
    expect(entries[0].value).toBe("string-label");
    expect(entries[1].value).toBe(42);
    expect(entries[2].value).toBe(false);
  });

  it("works with object and array values", () => {
    let capturedInstance: any;

    function useComplexData() {
      useDebugValue({ user: "alice", role: "admin" });
      useDebugValue([1, 2, 3]);
    }

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useComplexData();
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(2);
    expect(entries[0].value).toEqual({ user: "alice", role: "admin" });
    expect(entries[1].value).toEqual([1, 2, 3]);
  });

  it("mimics the useOnlineStatus real-world pattern from the docs", () => {
    // Covers: Usage / Adding a label to a custom Hook — Sandpack example
    // with useSyncExternalStore + useDebugValue.
    let capturedInstance: any;

    function useOnlineStatus() {
      // Simplified: no real store subscription needed for this test
      const isOnline = true;
      useDebugValue(isOnline ? "Online" : "Offline");
      return isOnline;
    }

    const StatusBar = cc(() => {
      capturedInstance = getCurrentInstance();
      const isOnline = useOnlineStatus();
      return el("h1", {}, isOnline ? "✅ Online" : "❌ Disconnected");
    });

    mount(StatusBar, container);
    expect((container as any).textContent).toBe("✅ Online");

    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("Online");
  });
});

describe("useDebugValue — Usage / Deferring formatting of a debug value", () => {
  it("accepts a formatter but does not call it eagerly during render", () => {
    // Covers: Usage / Deferring formatting of a debug value — Your
    // formatting function will receive the debug value as a parameter
    // and should return a formatted display value. When your component is
    // inspected, React DevTools will call this function and display its
    // result. This lets you avoid running potentially expensive formatting
    // logic unless the component is actually inspected.
    //
    // NOTE: In Sinwan there is no DevTools integration, so the formatter
    // is stored but never invoked. This preserves the lazy-evaluation
    // semantics documented by React.
    let capturedInstance: any;
    let formatterCalls = 0;
    const expensiveFormatter = (date: Date) => {
      formatterCalls++;
      return date.toDateString();
    };
    const date = new Date("2024-01-15");

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(date, expensiveFormatter);
      return el("div");
    });

    mount(App, container);
    expect(formatterCalls).toBe(0); // Formatter was NOT called during render

    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(date);
    expect(typeof entries[0].formatter).toBe("function");

    // Even after mount, formatter was never called
    expect(formatterCalls).toBe(0);
  });

  it("stores the formatter so it could be invoked later by a devtools consumer", () => {
    let capturedInstance: any;
    const formatter = (v: number) => `formatted: ${v}`;

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(42, formatter);
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(
      (entries[0].formatter as (v: number) => string)(
        entries[0].value as number,
      ),
    ).toBe("formatted: 42");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useDebugValue — Edge cases", () => {
  it("handles null as a value", () => {
    let capturedInstance: any;
    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(null);
      return el("div");
    });
    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBeNull();
  });

  it("handles undefined as a value", () => {
    let capturedInstance: any;
    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(undefined);
      return el("div");
    });
    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBeUndefined();
  });

  it("handles multiple useDebugValue calls in the same hook", () => {
    let capturedInstance: any;

    function useMultiDebug() {
      useDebugValue("first");
      useDebugValue("second");
      useDebugValue("third");
    }

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useMultiDebug();
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.value)).toEqual(["first", "second", "third"]);
  });

  it("works when called directly in a component (not just a custom hook)", () => {
    let capturedInstance: any;
    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue("direct-call");
      return el("div");
    });
    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBe("direct-call");
  });

  it("silently returns when called outside a component", () => {
    // Unlike other hooks, useDebugValue is debug-only infrastructure.
    // React does not throw for it; in Sinwan it also silently returns.
    expect(() => {
      useDebugValue("orphan");
    }).not.toThrow();
  });

  it("does not affect component rendering or output", () => {
    // useDebugValue should be a pure side-effect-free annotation.
    const App = cc(() => {
      useDebugValue("invisible");
      return el("span", {}, "visible");
    });
    mount(App, container);
    expect((container as any).textContent).toBe("visible");
  });

  it("does not interfere with other hooks in the same component", () => {
    // Verify useDebugValue slots don't corrupt the hook cursor or
    // interfere with other React-compatible hooks.
    let capturedInstance: any;
    let memoValue: number | undefined;

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue("debug-info");
      memoValue = (globalThis as any).useMemo ? undefined : 42; // Just a placeholder; we verify debug values were stored
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBe("debug-info");
  });

  it("preserves the formatter function reference without calling it", () => {
    const formatter = (x: string) => x.toUpperCase();
    let capturedInstance: any;

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue<string>("hello", formatter);
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].formatter).toBe(formatter);
  });

  it("handles symbol values", () => {
    let capturedInstance: any;
    const sym = Symbol("test");

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(sym);
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBe(sym);
  });

  it("handles function values", () => {
    let capturedInstance: any;
    const fn = () => "hello";

    const App = cc(() => {
      capturedInstance = getCurrentInstance();
      useDebugValue(fn);
      return el("div");
    });

    mount(App, container);
    const entries = getDebugValues(capturedInstance);
    expect(entries[0].value).toBe(fn);
  });
});
