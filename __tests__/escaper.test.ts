import { describe, it, expect } from "bun:test";
import { safeHtml, isSafeHtml, escapeHtml } from "../src/escaper.ts";

describe("safeHtml", () => {
  it("returns an HtmlEscapedString", () => {
    const result = safeHtml("<b>bold</b>");
    expect(result.value).toBe("<b>bold</b>");
  });

  it("works via indirect call", () => {
    const fn = safeHtml;
    expect(fn("x").value).toBe("x");
  });
});

describe("isSafeHtml", () => {
  it("returns true for HtmlEscapedString", () => {
    expect(isSafeHtml(safeHtml("x"))).toBe(true);
  });

  it("returns false for plain strings", () => {
    expect(isSafeHtml("x")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSafeHtml(null)).toBe(false);
  });
});

describe("portableEscape fallback", () => {
  it("falls back to portable implementation when Bun.escapeHTML is missing", async () => {
    const bun = (globalThis as any).Bun;
    const originalEscapeHTML = bun?.escapeHTML;
    try {
      if (bun) bun.escapeHTML = undefined;
      // Dynamically re-import to bypass ESM cache and trigger portable path
      const {
        escapeHtml: freshEscapeHtml,
        safeHtml: freshSafeHtml,
        isSafeHtml: freshIsSafeHtml,
      } = await import("../src/escaper.ts?" + Date.now());
      expect(freshEscapeHtml("<script>")).toBe("&lt;script&gt;");
      expect(freshEscapeHtml("safe")).toBe("safe");
      expect(freshSafeHtml("x").value).toBe("x");
      expect(freshIsSafeHtml(freshSafeHtml("x"))).toBe(true);
    } finally {
      if (bun) bun.escapeHTML = originalEscapeHTML;
    }
  });
});
