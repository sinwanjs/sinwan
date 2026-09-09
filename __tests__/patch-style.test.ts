import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { setSingleAttribute, applyAttributes } from "../src/renderer/attributes.ts";
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

  it("clears tracked style props when a falsy style is applied with state", () => {
    const state: { previousStyleProps: Set<string> } = {
      previousStyleProps: new Set(["color"]),
    };
    setSingleAttribute(el, "style", { color: "red" }, state);
    setSingleAttribute(el, "style", null, state);
    expect(el.style.color).toBe("");
    expect(state.previousStyleProps.size).toBe(0);
  });
});

describe("class attributes", () => {
  it("joins truthy keys from a class object", () => {
    setSingleAttribute(el, "class", { foo: true, bar: false, baz: 1 });
    expect(el.getAttribute("class")).toBe("foo baz");
  });

  it("stringifies non-object class items inside arrays", () => {
    setSingleAttribute(el, "class", ["item", 42]);
    expect(el.getAttribute("class")).toBe("item 42");
  });

  it("binds class arrays that contain reactive values", async () => {
    const name = signal("on");
    const { disposers } = applyAttributes(el, { class: [name] });
    expect(el.getAttribute("class")).toBe("on");
    name.value = "off";
    await nextTick();
    expect(el.getAttribute("class")).toBe("off");
    if (disposers) {
      for (const dispose of disposers) dispose();
    }
  });

  it("applies static class arrays without a reactive binding", () => {
    const { disposers } = applyAttributes(el, { class: ["static"] });
    expect(el.getAttribute("class")).toBe("static");
    expect(disposers).toBeNull();
  });
});

describe("uncontrolled form defaults", () => {
  it("sets input defaultValue as the visible value", () => {
    const input = doc.createElement("input") as HTMLInputElement;
    setSingleAttribute(input, "defaultValue", "/api/hello");
    expect(input.value).toBe("/api/hello");
    expect(input.defaultValue).toBe("/api/hello");
  });

  it("clears defaultValue when the value is omitted", () => {
    const input = doc.createElement("input") as HTMLInputElement;
    setSingleAttribute(input, "defaultValue", "keep");
    setSingleAttribute(input, "defaultValue", false);
    expect(input.defaultValue).toBe("");
  });

  it("sets and clears defaultChecked", () => {
    const input = doc.createElement("input") as HTMLInputElement;
    input.type = "checkbox";
    setSingleAttribute(input, "defaultChecked", true);
    expect(input.defaultChecked).toBe(true);
    setSingleAttribute(input, "defaultChecked", false);
    expect(input.defaultChecked).toBe(false);
  });

  it("selects the matching option for select defaultValue", () => {
    const select = doc.createElement("select") as HTMLSelectElement;
    for (const value of ["a", "b", "c"]) {
      const opt = doc.createElement("option") as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    setSingleAttribute(select, "defaultValue", "b");
    expect(select.value).toBe("b");
  });

  it("selects multiple options for array defaultValue", () => {
    const select = doc.createElement("select") as HTMLSelectElement;
    select.multiple = true;
    for (const value of ["a", "b", "c"]) {
      const opt = doc.createElement("option") as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    setSingleAttribute(select, "defaultValue", ["a", "c"]);
    expect(
      Array.from(select.selectedOptions).map((opt) => opt.value),
    ).toEqual(["a", "c"]);
  });

  it("clears a single select when defaultValue is omitted", () => {
    const select = doc.createElement("select") as HTMLSelectElement;
    for (const value of ["a", "b"]) {
      const opt = doc.createElement("option") as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    setSingleAttribute(select, "defaultValue", "b");
    setSingleAttribute(select, "defaultValue", false);
    expect(select.selectedIndex).toBe(-1);
  });

  it("clears a multiple select when value is omitted", () => {
    const select = doc.createElement("select") as HTMLSelectElement;
    select.multiple = true;
    for (const value of ["a", "b"]) {
      const opt = doc.createElement("option") as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    setSingleAttribute(select, "value", ["a", "b"]);
    setSingleAttribute(select, "value", null);
    expect(select.selectedOptions.length).toBe(0);
  });

  it("applies a controlled select value", () => {
    const select = doc.createElement("select") as HTMLSelectElement;
    for (const value of ["a", "b"]) {
      const opt = doc.createElement("option") as HTMLOptionElement;
      opt.value = value;
      select.appendChild(opt);
    }
    setSingleAttribute(select, "value", "b");
    expect(select.value).toBe("b");
  });
});
