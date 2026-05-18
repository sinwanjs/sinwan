/**
 * Phase 1 — SHARED adapter tests.
 *
 * Verifies that the React-compatible API surface works without any
 * `react` / `react-dom` import.
 */

import { describe, expect, it } from "bun:test";
import {
  Fragment,
  createContext,
  memo,
  lazy,
  use,
  cache,
  cacheSignal,
  addTransitionType,
  getActiveTransitionTypes,
  captureOwnerStack,
} from "../../../../src/integrations/react/_shared.ts";
import { REACT_CONTEXT_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";

describe("Fragment", () => {
  it("is a symbol re-exported from the JSX runtime", () => {
    expect(typeof Fragment).toBe("symbol");
  });
});

describe("createContext", () => {
  it("produces a context with Provider, Consumer, and unique key", () => {
    const Ctx = createContext("light");
    expect(Ctx.$$typeof).toBe(REACT_CONTEXT_TYPE);
    expect(typeof Ctx.Provider).toBe("function");
    expect(typeof Ctx.Consumer).toBe("function");
    expect(Ctx._defaultValue).toBe("light");
    expect(typeof Ctx._key).toBe("symbol");
  });

  it("two contexts have distinct keys", () => {
    const A = createContext(1);
    const B = createContext(1);
    expect(A._key).not.toBe(B._key);
  });
});

describe("memo", () => {
  it("returns the cached element when props are shallow-equal", () => {
    let calls = 0;
    const Inner = (props: { x: number }) => {
      calls++;
      return { tag: "div", props, children: [] };
    };
    const Memoed = memo(Inner);
    const r1 = (Memoed as any)({ x: 1 });
    const r2 = (Memoed as any)({ x: 1 });
    const r3 = (Memoed as any)({ x: 2 });
    expect(r1).toBe(r2);
    expect(r3).not.toBe(r2);
    expect(calls).toBe(2);
  });
});

describe("lazy", () => {
  it("resolves and renders the loaded component", async () => {
    const Lazy = lazy(async () => ({
      default: ((p: { v: number }) => ({
        tag: "span",
        props: p,
        children: [],
      })) as any,
    }));

    // First call throws the pending promise (Suspense integration)
    let promise: Promise<any>;
    try {
      (Lazy as any)({ v: 7 });
    } catch (e: any) {
      promise = e;
    }
    expect(promise!).toBeInstanceOf(Promise);

    await promise!;

    // After resolution the component renders directly
    const result = (Lazy as any)({ v: 7 });
    expect(result).toEqual({ tag: "span", props: { v: 7 }, children: [] });
  });
});

describe("use", () => {
  it("unwraps a fulfilled promise on second call", async () => {
    const p = Promise.resolve(42);
    try {
      use(p);
    } catch (e) {
      expect(e).toBe(p);
    }
    await p;
    expect(use(p)).toBe(42);
  });

  it("throws for non-thenable / non-context values", () => {
    expect(() => use(123 as any)).toThrow();
  });
});

describe("cache", () => {
  it("memoizes by argument structural equality", () => {
    let calls = 0;
    const fn = cache((a: number, b: number) => {
      calls++;
      return a + b;
    });
    fn(1, 2);
    fn(1, 2);
    fn(2, 3);
    expect(calls).toBe(2);
  });
});

describe("cacheSignal", () => {
  it("returns null on the client", () => {
    const sig = cacheSignal();
    expect(sig).toBeNull();
  });
});

describe("addTransitionType", () => {
  it("records type labels", () => {
    addTransitionType("navigate");
    expect(getActiveTransitionTypes().has("navigate")).toBe(true);
  });
});

describe("captureOwnerStack", () => {
  it("returns null when no instance is active", () => {
    expect(captureOwnerStack()).toBeNull();
  });
});
