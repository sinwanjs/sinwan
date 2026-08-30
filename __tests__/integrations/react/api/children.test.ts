import { describe, it, expect } from "bun:test";
import { Children } from "../../../../src/react/children.ts";

describe("Children.map", () => {
  it("maps over a single child", () => {
    const result = Children.map("hello", (child, i) => `${child}-${i}`);
    expect(result).toEqual(["hello-0"]);
  });

  it("maps over multiple children", () => {
    const result = Children.map(["a", "b", "c"], (child, i) => `${child}-${i}`);
    expect(result).toEqual(["a-0", "b-1", "c-2"]);
  });

  it("returns null for null children", () => {
    const result = Children.map(null, () => "x");
    expect(result).toBeNull();
  });

  it("returns null for undefined children", () => {
    const result = Children.map(undefined, () => "x");
    expect(result).toBeNull();
  });

  it("returns null for boolean children", () => {
    const result = Children.map(true, () => "x");
    expect(result).toBeNull();
  });

  it("filters out null and boolean values in arrays", () => {
    const result = Children.map(["a", null, "b", true, false, "c"], (child) => child);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("flattens nested arrays", () => {
    const result = Children.map([["a", "b"], ["c"]], (child, i) => `${child}-${i}`);
    expect(result).toEqual(["a-0", "b-1", "c-2"]);
  });

  it("returns empty array for empty array input", () => {
    const result = Children.map([], () => "x");
    expect(result).toBeNull();
  });
});

describe("Children.forEach", () => {
  it("iterates over a single child", () => {
    const seen: string[] = [];
    Children.forEach("hello", (child, i) => seen.push(`${child}-${i}`));
    expect(seen).toEqual(["hello-0"]);
  });

  it("iterates over multiple children", () => {
    const seen: string[] = [];
    Children.forEach(["a", "b", "c"], (child, i) => seen.push(`${child}-${i}`));
    expect(seen).toEqual(["a-0", "b-1", "c-2"]);
  });

  it("does nothing for null children", () => {
    const seen: string[] = [];
    Children.forEach(null, (child) => seen.push(String(child)));
    expect(seen).toEqual([]);
  });

  it("filters out null and boolean values", () => {
    const seen: unknown[] = [];
    Children.forEach(["a", null, true, "b"], (child) => seen.push(child));
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("Children.count", () => {
  it("counts a single child", () => {
    expect(Children.count("hello")).toBe(1);
  });

  it("counts multiple children", () => {
    expect(Children.count(["a", "b", "c"])).toBe(3);
  });

  it("returns 0 for null", () => {
    expect(Children.count(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(Children.count(undefined)).toBe(0);
  });

  it("returns 0 for boolean", () => {
    expect(Children.count(true)).toBe(0);
  });

  it("filters out null and boolean in arrays", () => {
    expect(Children.count(["a", null, true, "b"])).toBe(2);
  });

  it("counts flattened nested arrays", () => {
    expect(Children.count([["a", "b"], ["c"]])).toBe(3);
  });
});

describe("Children.only", () => {
  it("returns the single child", () => {
    expect(Children.only("hello")).toBe("hello");
  });

  it("throws for zero children", () => {
    expect(() => Children.only(null as any)).toThrow();
  });

  it("throws for multiple children", () => {
    expect(() => Children.only(["a", "b"] as any)).toThrow();
  });

  it("throws for empty array", () => {
    expect(() => Children.only([] as any)).toThrow();
  });
});

describe("Children.toArray", () => {
  it("wraps a single child in an array", () => {
    expect(Children.toArray("hello")).toEqual(["hello"]);
  });

  it("returns the same array for multiple children", () => {
    expect(Children.toArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for null", () => {
    expect(Children.toArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(Children.toArray(undefined)).toEqual([]);
  });

  it("returns empty array for boolean", () => {
    expect(Children.toArray(true)).toEqual([]);
  });

  it("filters out null and boolean values", () => {
    expect(Children.toArray(["a", null, true, "b"])).toEqual(["a", "b"]);
  });

  it("flattens nested arrays", () => {
    expect(Children.toArray([["a", "b"], ["c"]])).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty array input", () => {
    expect(Children.toArray([])).toEqual([]);
  });
});
