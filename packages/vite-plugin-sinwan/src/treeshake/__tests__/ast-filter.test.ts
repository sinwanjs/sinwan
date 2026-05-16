import { describe, expect, it } from "bun:test";
import { filterAstByUsedExports } from "../ast-filter";

describe("filterAstByUsedExports", () => {
  it("removes unused function declarations", () => {
    const code = `
function keepMe() { return 1; }
function removeMe() { return 2; }
export { keepMe as Keep, removeMe as Remove };
`;
    const result = filterAstByUsedExports(code, new Set(["Keep"]));
    expect(result.code).toContain("keepMe");
    expect(result.code).not.toContain("removeMe");
    expect(result.keptExports).toContain("Keep");
    expect(result.removedExports).toContain("Remove");
  });

  it("preserves transitive dependencies", () => {
    const code = `
function helper() { return 42; }
function publicFn() { return helper(); }
export { publicFn as Public };
`;
    const result = filterAstByUsedExports(code, new Set(["Public"]));
    expect(result.code).toContain("publicFn");
    expect(result.code).toContain("helper");
  });

  it("keeps only specified exports in a bundle-like file", () => {
    const code = `
const O = () => {};
const F = () => {};
const we = () => {};
export { O as createEffect, F as getCurrentInstance, we as createSignal };
`;
    const result = filterAstByUsedExports(
      code,
      new Set(["createSignal"])
    );
    expect(result.code).toContain("we");
    expect(result.code).not.toContain("O");
    expect(result.code).not.toContain("F");
    expect(result.keptExports).toEqual(["createSignal"]);
  });

  it("removes entire export statement when no specifiers remain", () => {
    const code = `
function a() {}
function b() {}
export { a as A, b as B };
`;
    const result = filterAstByUsedExports(code, new Set(["C"]));
    expect(result.code).not.toContain("export");
  });

  it("handles mixed declarations and export specs", () => {
    const code = `
function usedUtil() { return 1; }
function unusedUtil() { return 2; }
export function publicUsed() { return usedUtil(); }
export function publicUnused() { return unusedUtil(); }
`;
    const result = filterAstByUsedExports(code, new Set(["publicUsed"]));
    expect(result.code).toContain("publicUsed");
    expect(result.code).toContain("usedUtil");
    expect(result.code).not.toContain("publicUnused");
    expect(result.code).not.toContain("unusedUtil");
  });
});
