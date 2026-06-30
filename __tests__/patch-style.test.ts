import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { setSingleAttribute } from "../src/renderer/attributes.ts";
import { signal } from "../src/reactivity/signal.ts";
import { effect } from "../src/reactivity/index.ts";
import { nextTick } from "../src/reactivity/index.ts";

let doc: Document;
let el: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  el = doc.createElement("div");
});

describe("patchStyle", () => {
  it("assigns string styles directly to cssText", () => {
    setSingleAttribute(el, "style", "color: red; background: blue;");
    expect(el.style.color).toBe("red");
    expect(el.style.background).toBe("blue");
  });

  it("applies object styles property by property", () => {
    setSingleAttribute(el, "style", { color: "red", backgroundColor: "blue" });
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundColor).toBe("blue");
  });

  it("converts camelCase to kebab-case", () => {
    setSingleAttribute(el, "style", { backgroundColor: "red" });
    expect(el.style.backgroundColor).toBe("red");
  });

  it("preserves CSS custom properties", () => {
    setSingleAttribute(el, "style", { "--my-var": "red" });
    expect(el.style.getPropertyValue("--my-var")).toBe("red");
  });

  it("merges style arrays", () => {
    setSingleAttribute(el, "style", ["color: red;", { backgroundColor: "blue" }]);
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundColor).toBe("blue");
  });

  it("removes stale properties when style object changes", () => {
    const state: { previousStyleProps: Set<string> } = {
      previousStyleProps: new Set(),
    };
    setSingleAttribute(el, "style", { color: "red", backgroundColor: "blue" }, state);
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundColor).toBe("blue");

    setSingleAttribute(el, "style", { color: "green" }, state);
    expect(el.style.color).toBe("green");
    expect(el.style.backgroundColor).toBe("");
  });

  it("clears styles for null, undefined, false, and empty string", () => {
    setSingleAttribute(el, "style", { color: "red" });
    expect(el.style.color).toBe("red");

    setSingleAttribute(el, "style", null);
    expect(el.style.color).toBe("");

    setSingleAttribute(el, "style", { color: "red" });
    setSingleAttribute(el, "style", undefined);
    expect(el.style.color).toBe("");

    setSingleAttribute(el, "style", { color: "red" });
    setSingleAttribute(el, "style", false);
    expect(el.style.color).toBe("");

    setSingleAttribute(el, "style", { color: "red" });
    setSingleAttribute(el, "style", "");
    expect(el.style.color).toBe("");
  });

  it("resolves reactive getter values in object styles", () => {
    const color = signal("red");
    setSingleAttribute(el, "style", { color: () => color.value });
    expect(el.style.color).toBe("red");

    color.value = "blue";
    expect(el.style.color).toBe("red"); // not reactive unless wrapped in effect
  });

  it("updates reactively when wrapped in an effect", async () => {
    const color = signal("red");
    const dispose = effect(() => {
      setSingleAttribute(el, "style", { color: color.value });
    });
    expect(el.style.color).toBe("red");

    color.value = "blue";
    await nextTick();
    expect(el.style.color).toBe("blue");

    dispose();
  });

  it("skips null and false values inside objects", () => {
    setSingleAttribute(el, "style", { color: "red", backgroundColor: null, border: false });
    expect(el.style.color).toBe("red");
    expect(el.style.backgroundColor).toBe("");
    expect(el.style.border).toBe("");
  });
});
