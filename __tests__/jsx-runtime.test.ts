import { describe, it, expect } from "bun:test";
import { jsx, jsxs, jsxDEV, Fragment, HtmlEscapedString, raw } from "../src/jsx/jsx-runtime.ts";

describe("HtmlEscapedString", () => {
  it("returns the value via toString()", () => {
    const s = raw("<b>hello</b>");
    expect(s.toString()).toBe("<b>hello</b>");
  });
});

describe("jsxDEV", () => {
  it("builds an element with source metadata", () => {
    const element = jsxDEV("div", { class: "test" }, null, false, {
      fileName: "app.tsx",
      lineNumber: 10,
      columnNumber: 5,
    });
    expect(element.tag).toBe("div");
    expect(element.props.class).toBe("test");
    expect((element as any).__source).toEqual({
      fileName: "app.tsx",
      lineNumber: 10,
      columnNumber: 5,
    });
  });

  it("builds an element without source metadata", () => {
    const element = jsxDEV("span", {}, null, false, undefined);
    expect(element.tag).toBe("span");
    expect((element as any).__source).toBeUndefined();
  });

  it("flattens static children", () => {
    const element = jsxDEV("div", { children: ["a", ["b", "c"]] }, null, true);
    expect(element.children).toEqual(["a", "b", "c"]);
  });

  it("normalizes non-static children", () => {
    const element = jsxDEV("div", { children: "text" }, null, false);
    expect(element.children).toEqual(["text"]);
  });
});

describe("jsx", () => {
  it("normalizes single child", () => {
    const element = jsx("p", { children: "hello" });
    expect(element.children).toEqual(["hello"]);
  });

  it("normalizes nested arrays", () => {
    const element = jsx("div", { children: ["a", ["b", ["c"]]] });
    expect(element.children).toEqual(["a", "b", "c"]);
  });

  it("normalizes null children", () => {
    const element = jsx("div", {});
    expect(element.children).toEqual([]);
  });
});

describe("jsxs", () => {
  it("flattens array children", () => {
    const element = jsxs("ul", { children: ["a", ["b", "c"]] });
    expect(element.children).toEqual(["a", "b", "c"]);
  });

  it("normalizes non-array children", () => {
    const element = jsxs("p", { children: "text" });
    expect(element.children).toEqual(["text"]);
  });
});

describe("buildElement fragments", () => {
  it("returns an empty tag for Fragment", () => {
    const element = jsx(Fragment, { children: ["a", "b"] });
    expect(element.tag).toBe("");
    expect(element.children).toEqual(["a", "b"]);
  });
});
