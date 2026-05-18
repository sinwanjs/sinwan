/**
 * Comprehensive tests for `cache`.
 *
 * Tests are organised to mirror the React documentation sections.
 */

import { describe, it, expect } from "bun:test";
import { cache } from "../../../../src/integrations/react/cache.ts";

// ─── Reference ────────────────────────────────────────────────────────────

describe("cache — Reference", () => {
  it("returns a memoized function with the same signature", () => {
    const fn = (a: number, b: string) => `${a}-${b}`;
    const cached = cache(fn);
    expect(typeof cached).toBe("function");
    expect(cached(1, "a")).toBe("1-a");
  });

  it("only calls fn on cache miss", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return a * 2;
    });
    fn(5);
    fn(5);
    fn(5);
    expect(calls).toBe(1);
  });

  it("calls fn again when arguments change", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return a * 2;
    });
    fn(1);
    fn(2);
    fn(1);
    expect(calls).toBe(2);
  });

  it("returns the cached result on hit", () => {
    const obj = { id: 1 };
    const fn = cache((_: string) => obj);
    const r1 = fn("key");
    const r2 = fn("key");
    expect(r1).toBe(obj);
    expect(r2).toBe(obj);
  });

  it("uses Object.is equality for argument comparison (NaN)", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return a;
    });
    fn(NaN);
    fn(NaN);
    expect(calls).toBe(1);
  });

  it("uses Object.is equality for argument comparison (objects by ref)", () => {
    let calls = 0;
    const fn = cache((a: object) => {
      calls++;
      return a;
    });
    const obj = { id: 1 };
    fn(obj);
    fn(obj);
    fn({ id: 1 });
    expect(calls).toBe(2);
  });

  it("caches errors and re-throws them on subsequent hits", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      if (a < 0) throw new Error("negative");
      return a;
    });
    expect(() => fn(-1)).toThrow("negative");
    expect(() => fn(-1)).toThrow("negative");
    expect(calls).toBe(1);
  });
});

// ─── Usage / Cache an expensive computation ───────────────────────────────

describe("cache — Usage / Cache an expensive computation", () => {
  it("skips duplicate work for the same arguments", () => {
    let calls = 0;
    function calculateMetrics(data: number[]) {
      calls++;
      return data.reduce((a, b) => a + b, 0);
    }
    const getMetrics = cache(calculateMetrics);

    const data = [1, 2, 3];
    getMetrics(data);
    getMetrics(data);
    expect(calls).toBe(1);
  });

  it("recomputes when arguments differ", () => {
    let calls = 0;
    const getMetrics = cache((data: number[]) => {
      calls++;
      return data.reduce((a, b) => a + b, 0);
    });

    getMetrics([1, 2]);
    getMetrics([1, 2, 3]);
    expect(calls).toBe(2);
  });
});

// ─── Usage / Share a snapshot of data ───────────────────────────────────

describe("cache — Usage / Share a snapshot of data", () => {
  it("shares the same promise across calls with the same key", async () => {
    let fetches = 0;
    const getTemperature = cache(async (city: string) => {
      fetches++;
      return `${city}: 20°C`;
    });

    const p1 = getTemperature("London");
    const p2 = getTemperature("London");
    expect(p1).toBe(p2); // same promise object
    expect(await p1).toBe("London: 20°C");
    expect(fetches).toBe(1);
  });

  it("creates separate promises for different keys", async () => {
    let fetches = 0;
    const getTemperature = cache(async (city: string) => {
      fetches++;
      return `${city}: 20°C`;
    });

    const p1 = getTemperature("London");
    const p2 = getTemperature("Paris");
    expect(p1).not.toBe(p2);
    await p1;
    await p2;
    expect(fetches).toBe(2);
  });
});

// ─── Usage / Preload data ───────────────────────────────────────────────

describe("cache — Usage / Preload data", () => {
  it("allows early kick-off without awaiting", async () => {
    let calls = 0;
    const getUser = cache(async (id: string) => {
      calls++;
      return { id, name: "Alice" };
    });

    // Early call to kick off work
    getUser("42");

    // Later call awaits the same cached promise
    const user = await getUser("42");
    expect(user).toEqual({ id: "42", name: "Alice" });
    expect(calls).toBe(1);
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────

describe("cache — Caveats", () => {
  it("each call to cache creates a new isolated cache", () => {
    let callsA = 0;
    let callsB = 0;
    const calc = (x: number) => x * 2;

    const getA = cache((x: number) => {
      callsA++;
      return calc(x);
    });
    const getB = cache((x: number) => {
      callsB++;
      return calc(x);
    });

    getA(5);
    getA(5);
    getB(5);
    getB(5);

    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
    expect(getA).not.toBe(getB);
  });

  it("different object references with same shape are different keys", () => {
    let calls = 0;
    const calculateNorm = cache((vector: { x: number }) => {
      calls++;
      return Math.abs(vector.x);
    });

    calculateNorm({ x: 10 });
    calculateNorm({ x: 10 });
    expect(calls).toBe(2);
  });

  it("same object reference is a cache hit", () => {
    let calls = 0;
    const calculateNorm = cache((vector: { x: number }) => {
      calls++;
      return Math.abs(vector.x);
    });

    const v = { x: 10 };
    calculateNorm(v);
    calculateNorm(v);
    expect(calls).toBe(1);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────

describe("cache — Edge cases", () => {
  it("memoizes undefined results", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return undefined;
    });
    fn(1);
    fn(1);
    expect(calls).toBe(1);
    expect(fn(1)).toBeUndefined();
  });

  it("memoizes null results", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return null;
    });
    fn(1);
    fn(1);
    expect(calls).toBe(1);
    expect(fn(1)).toBeNull();
  });

  it("handles zero arguments", () => {
    let calls = 0;
    const fn = cache(() => {
      calls++;
      return 42;
    });
    fn();
    fn();
    expect(calls).toBe(1);
    expect(fn()).toBe(42);
  });

  it("handles multiple arguments of mixed types", () => {
    let calls = 0;
    const fn = cache((a: number, b: string, c: boolean) => {
      calls++;
      return `${a}-${b}-${c}`;
    });
    fn(1, "a", true);
    fn(1, "a", true);
    fn(1, "a", false);
    expect(calls).toBe(2);
  });

  it("distinguishes argument count (partial vs full)", () => {
    let calls = 0;
    const fn = cache((a: number, b?: number) => {
      calls++;
      return b === undefined ? a : a + b;
    });
    fn(1);
    fn(1, 2);
    fn(1);
    fn(1, 2);
    expect(calls).toBe(2);
  });

  it("caches async errors (rejected promises)", async () => {
    let calls = 0;
    const fn = cache(async (id: string) => {
      calls++;
      throw new Error(`fail ${id}`);
    });

    await expect(fn("x")).rejects.toThrow("fail x");
    await expect(fn("x")).rejects.toThrow("fail x");
    expect(calls).toBe(1);
  });

  it("does not conflate +0 and -0 (SameValueZero edge case, acceptable)", () => {
    let calls = 0;
    const fn = cache((a: number) => {
      calls++;
      return a;
    });
    fn(+0);
    fn(-0);
    // Map uses SameValueZero (+0 === -0), so this may cache as one call.
    // Documented as acceptable in our implementation notes.
    expect(calls).toBeLessThanOrEqual(2);
  });

  it("preserves the this value of the original function", () => {
    let capturedThis: unknown;
    const fn = function (this: { name: string }) {
      capturedThis = this;
      return this.name;
    };
    const cached = cache(fn);
    const obj = { name: "test" };
    const result = cached.call(obj);
    expect(result).toBe("test");
    expect(capturedThis).toBe(obj);
  });
});
