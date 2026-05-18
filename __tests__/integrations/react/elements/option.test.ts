/**
 * Comprehensive tests for `<Option>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Option,
  Select,
  useState,
} from "../../../../src/integrations/react/_client.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ───────────────────────────────────────────────────────────

describe("Option — Reference", () => {
  it("renders a native <option> element", () => {
    const App = cc(() =>
      Select({ children: Option({ value: "apple", children: "Apple" }) }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option).toBeTruthy();
    expect(option.tagName.toLowerCase()).toBe("option");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Select({
        children: Option({
          value: "a",
          className: "fruit",
          id: "opt-apple",
          children: "Apple",
        }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.getAttribute("class")).toBe("fruit");
    expect(option.getAttribute("id")).toBe("opt-apple");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Option — Props", () => {
  it("passes disabled as a boolean attribute", () => {
    const App = cc(() =>
      Select({
        children: Option({ value: "x", disabled: true, children: "X" }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.hasAttribute("disabled")).toBe(true);
    expect((option as any).disabled).toBe(true);
  });

  it("passes label as an attribute", () => {
    const App = cc(() =>
      Select({
        children: Option({
          value: "x",
          label: "Display label",
          children: "X",
        }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.getAttribute("label")).toBe("Display label");
  });

  it("passes value as an attribute", () => {
    const App = cc(() =>
      Select({
        children: Option({ value: "banana", children: "Banana" }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.getAttribute("value")).toBe("banana");
  });
});

// ─── Usage / Displaying a select box with options ──────────────────────

describe("Option — Usage / Displaying a select box with options", () => {
  it("renders multiple options inside a select", () => {
    const App = cc(() =>
      Select({
        children: [
          Option({ value: "apple", children: "Apple" }),
          Option({ value: "banana", children: "Banana" }),
          Option({ value: "orange", children: "Orange" }),
        ],
      }),
    );
    mount(App, container);
    const options = container.querySelectorAll(
      "option",
    ) as unknown as HTMLOptionElement[];
    expect(options.length).toBe(3);
    expect(options[0].value).toBe("apple");
    expect(options[1].value).toBe("banana");
    expect(options[2].value).toBe("orange");
  });

  it("sets the default selected option via select defaultValue", () => {
    const App = cc(() =>
      Select({
        defaultValue: "banana",
        children: [
          Option({ value: "apple", children: "Apple" }),
          Option({ value: "banana", children: "Banana" }),
          Option({ value: "orange", children: "Orange" }),
        ],
      }),
    );
    mount(App, container);
    const select = container.querySelector(
      "select",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("banana");
    const options = select.querySelectorAll(
      "option",
    ) as unknown as HTMLOptionElement[];
    expect(options[0].selected).toBe(false);
    expect(options[1].selected).toBe(true);
    expect(options[2].selected).toBe(false);
  });

  it("controls select value via select value prop", async () => {
    const App = cc(() => {
      const [selected, setSelected] = useState("banana");
      return el(
        "label",
        {},
        "Pick a fruit:",
        Select({
          value: selected,
          onChange: (e: any) => setSelected(e.target.value),
          children: [
            Option({ value: "apple", children: "Apple" }),
            Option({ value: "banana", children: "Banana" }),
            Option({ value: "orange", children: "Orange" }),
          ],
        }),
      );
    });
    mount(App, container);
    const select = container.querySelector(
      "select",
    ) as unknown as HTMLSelectElement;
    expect(select.value).toBe("banana");

    // Simulate user selecting a different option
    select.value = "orange";
    select.dispatchEvent(new (win as any).Event("change", { bubbles: true }));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(select.value).toBe("orange");
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Option — Caveats", () => {
  it("throws when the selected prop is provided", () => {
    expect(() => Option({ value: "x", selected: true } as any)).toThrow(
      /does not support the `selected` prop/,
    );
  });

  it("throws with a helpful message when selected is used", () => {
    expect(() => Option({ value: "x", selected: true } as any)).toThrow(
      /Pass the option's `value` to the parent <select defaultValue>/,
    );
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Option — Edge cases", () => {
  it("allows empty string value", () => {
    const App = cc(() =>
      Select({
        children: Option({ value: "", children: "Empty" }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.getAttribute("value")).toBe("");
  });

  it("allows numeric value", () => {
    const App = cc(() =>
      Select({
        children: Option({ value: 42, children: "Forty-two" }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.getAttribute("value")).toBe("42");
  });

  it("handles disabled=false (no attribute)", () => {
    const App = cc(() =>
      Select({
        children: Option({ value: "x", disabled: false, children: "X" }),
      }),
    );
    mount(App, container);
    const option = container.querySelector(
      "option",
    ) as unknown as HTMLOptionElement;
    expect(option.hasAttribute("disabled")).toBe(false);
  });

  it("sets multiple default values for multiple select", () => {
    const App = cc(() =>
      Select({
        multiple: true,
        defaultValue: ["apple", "orange"],
        children: [
          Option({ value: "apple", children: "Apple" }),
          Option({ value: "banana", children: "Banana" }),
          Option({ value: "orange", children: "Orange" }),
        ],
      }),
    );
    mount(App, container);
    const select = container.querySelector(
      "select",
    ) as unknown as HTMLSelectElement;
    const options = select.querySelectorAll(
      "option",
    ) as unknown as HTMLOptionElement[];
    expect(options[0].selected).toBe(true);
    expect(options[1].selected).toBe(false);
    expect(options[2].selected).toBe(true);
  });

  it("allows select with no defaultValue (first option selected by default)", () => {
    const App = cc(() =>
      Select({
        children: [
          Option({ value: "a", children: "A" }),
          Option({ value: "b", children: "B" }),
        ],
      }),
    );
    mount(App, container);
    const select = container.querySelector(
      "select",
    ) as unknown as HTMLSelectElement;
    // First option is selected by default in HTML
    expect(select.value).toBe("a");
  });
});
