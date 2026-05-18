/**
 * Comprehensive tests for `createContext`.
 *
 * Tests are organised to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { createContext } from "../../../../src/integrations/react/_shared.ts";
import { REACT_CONTEXT_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";

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

// ─── Reference / createContext(defaultValue) ──────────────────────────────

describe("createContext — Reference", () => {
  it("accepts a defaultValue and returns a context object", () => {
    const Ctx = createContext("light");
    expect(Ctx).toBeDefined();
    expect(typeof Ctx).toBe("function");
  });

  it("returns a context with $$typeof set to REACT_CONTEXT_TYPE", () => {
    const Ctx = createContext(0);
    expect(Ctx.$$typeof).toBe(REACT_CONTEXT_TYPE);
  });

  it("stores the defaultValue on _defaultValue", () => {
    const Ctx = createContext("fallback");
    expect(Ctx._defaultValue).toBe("fallback");
  });

  it("assigns a unique symbol key per context", () => {
    const A = createContext(1);
    const B = createContext(1);
    expect(typeof A._key).toBe("symbol");
    expect(typeof B._key).toBe("symbol");
    expect(A._key).not.toBe(B._key);
  });
});

// ─── Reference / SomeContext.Provider ───────────────────────────────────────

describe("createContext — SomeContext.Provider", () => {
  it("exposes a Provider function on the context object", () => {
    const Ctx = createContext("light");
    expect(typeof Ctx.Provider).toBe("function");
    expect(Ctx.Provider.displayName).toBe("Context.Provider");
  });

  it("Provider provides the value to descendant components", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;

    const Child = cc(() => {
      captured = ThemeContext.Consumer({
        children: (v: string) => v,
      } as any) as any;
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeContext.Provider, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(captured).toBe("dark");
  });
});

// ─── Reference / SomeContext.Consumer ─────────────────────────────────────

describe("createContext — SomeContext.Consumer", () => {
  it("exposes a Consumer function on the context object", () => {
    const Ctx = createContext("light");
    expect(typeof Ctx.Consumer).toBe("function");
    expect(Ctx.Consumer.displayName).toBe("Context.Consumer");
  });

  it("Consumer calls children function with the current context value", () => {
    const ThemeContext = createContext("light");
    let received: string | undefined;

    const App = cc(() => {
      return el(
        ThemeContext.Provider,
        { value: "dark" },
        el(ThemeContext.Consumer, {}, (theme: string) => {
          received = theme;
          return el("span", {}, theme);
        }),
      );
    });

    mount(App, container);
    expect(received).toBe("dark");
  });

  it("Consumer falls back to defaultValue when no provider is present", () => {
    const ThemeContext = createContext("light");
    let received: string | undefined;

    const App = cc(() => {
      return el(ThemeContext.Consumer, {}, (theme: string) => {
        received = theme;
        return el("span", {}, theme);
      });
    });

    mount(App, container);
    expect(received).toBe("light");
  });
});

// ─── Reference / React 19 shorthand ─────────────────────────────────────────

describe("createContext — React 19 shorthand", () => {
  it("allows the context itself to be used as a provider with a value prop", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;

    const Child = cc(() => {
      captured = ThemeContext.Consumer({
        children: (v: string) => v,
      } as any) as any;
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(Child, {}));
    });

    mount(App, container);
    expect(captured).toBe("dark");
  });
});

// ─── Usage / Creating context ───────────────────────────────────────────────

describe("createContext — Usage / Creating context", () => {
  it("can be called outside any component", () => {
    // createContext is not a hook; it can be called at module top level.
    const ThemeContext = createContext("light");
    const AuthContext = createContext<null | { name: string }>(null);

    expect(ThemeContext._defaultValue).toBe("light");
    expect(AuthContext._defaultValue).toBeNull();
  });

  it("allows any type as defaultValue including objects and functions", () => {
    const fn = () => {};
    const Ctx = createContext(fn);
    expect(Ctx._defaultValue).toBe(fn);

    const obj = { a: 1 };
    const ObjCtx = createContext(obj);
    expect(ObjCtx._defaultValue).toBe(obj);
  });
});

// ─── Usage / Importing and exporting context from a file ──────────────────

describe("createContext — Usage / Importing and exporting context from a file", () => {
  it("produces the same context object when imported from multiple places", () => {
    // Simulates re-export pattern: one module creates and exports the context.
    const ThemeContext = createContext("light");
    // If another module imports the SAME reference, it is identical.
    expect(ThemeContext).toBe(ThemeContext);
  });

  it("different createContext calls produce independent objects", () => {
    const A = createContext(1);
    const B = createContext(1);
    expect(A).not.toBe(B);
    expect(A._key).not.toBe(B._key);
  });
});

// ─── Troubleshooting ───────────────────────────────────────────────────────

describe("createContext — Troubleshooting", () => {
  it("defaultValue never changes — the context object itself is static", () => {
    const ThemeContext = createContext("light");
    expect(ThemeContext._defaultValue).toBe("light");

    // There is no setter on the context object; _defaultValue is read-only in intent.
    // To change the value dynamically, a Provider must be used in the tree.
    const App = cc(() => {
      return el(ThemeContext.Provider, { value: "dark" }, el("div"));
    });
    mount(App, container);

    // The context object itself still holds the original default.
    expect(ThemeContext._defaultValue).toBe("light");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("createContext — Edge cases", () => {
  it("handles null as defaultValue", () => {
    const Ctx = createContext<null | string>(null);
    expect(Ctx._defaultValue).toBeNull();
  });

  it("handles undefined as defaultValue", () => {
    const Ctx = createContext<string | undefined>(undefined);
    expect(Ctx._defaultValue).toBeUndefined();
  });

  it("handles numeric zero as defaultValue", () => {
    const Ctx = createContext(0);
    expect(Ctx._defaultValue).toBe(0);
  });

  it("handles boolean false as defaultValue", () => {
    const Ctx = createContext(false);
    expect(Ctx._defaultValue).toBe(false);
  });

  it("provider shorthand does NOT provide when value prop is absent", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;

    const Child = cc(() => {
      captured = ThemeContext.Consumer({
        children: (v: string) => v,
      } as any) as any;
      return el("span");
    });

    const App = cc(() => {
      // "value" not in props → provide() is skipped
      return el(ThemeContext, {}, el(Child, {}));
    });

    mount(App, container);
    expect(captured).toBe("light");
  });

  it("provider shorthand provides undefined when value prop is explicitly undefined", () => {
    const ThemeContext = createContext("light");
    let captured: string | undefined;

    const Child = cc(() => {
      captured = ThemeContext.Consumer({
        children: (v: string | undefined) => v,
      } as any) as any;
      return el("span");
    });

    const App = cc(() => {
      return el(ThemeContext, { value: undefined }, el(Child, {}));
    });

    mount(App, container);
    expect(captured).toBeUndefined();
  });
});
