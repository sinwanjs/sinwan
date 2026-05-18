/**
 * Comprehensive tests for `<Input>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { Input, useState } from "../../../../src/integrations/react/_client.ts";
import { _resolveFormAction } from "../../../../src/integrations/react/elements.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (globalThis as any).SubmitEvent = (globalThis as any).Event;
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

describe("Input — Reference", () => {
  it("renders a native <input> element", () => {
    const App = cc(() => Input({ type: "text" }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.tagName.toLowerCase()).toBe("input");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Input({
        type: "text",
        name: "myInput",
        placeholder: "Enter text",
        disabled: true,
      }),
    );
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.getAttribute("name")).toBe("myInput");
    expect(input.getAttribute("placeholder")).toBe("Enter text");
    expect(input.hasAttribute("disabled")).toBe(true);
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Input — Props", () => {
  it("defaultValue sets the initial value for text inputs", () => {
    const App = cc(() => Input({ type: "text", defaultValue: "hello world" }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("hello world");
  });

  it("defaultChecked sets the initial checked state for checkboxes", () => {
    const App = cc(() => Input({ type: "checkbox", defaultChecked: true }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("defaultChecked sets the initial checked state for radio buttons", () => {
    const App = cc(() => Input({ type: "radio", defaultChecked: true }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("value prop controls a text input when provided", () => {
    const App = cc(() => {
      const [value] = useState("controlled");
      return Input({ type: "text", value });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("controlled");
  });

  it("checked prop controls a checkbox when provided", () => {
    const App = cc(() => {
      const [checked] = useState(true);
      return Input({ type: "checkbox", checked });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("readOnly prop is passed through", () => {
    const App = cc(() => Input({ type: "text", value: "hi", readOnly: true }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.hasAttribute("readonly")).toBe(true);
  });
});

// ─── Usage / Displaying inputs of different types ──────────────────────

describe("Input — Usage / Displaying inputs of different types", () => {
  it("renders a text input by default", () => {
    const App = cc(() => Input({}));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.getAttribute("type")).toBe(null); // default is text, no attr rendered
    expect(input.type).toBe("text");
  });

  it("renders a checkbox input", () => {
    const App = cc(() => Input({ type: "checkbox" }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("checkbox");
  });

  it("renders a radio input", () => {
    const App = cc(() => Input({ type: "radio" }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("radio");
  });
});

// ─── Usage / Providing an initial value for an input ───────────────────

describe("Input — Usage / Providing an initial value for an input", () => {
  it("uses defaultValue as the initial value for text inputs", () => {
    const App = cc(() =>
      Input({ type: "text", defaultValue: "Some initial value" }),
    );
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("Some initial value");
  });

  it("uses defaultChecked as the initial checked for checkboxes", () => {
    const App = cc(() => Input({ type: "checkbox", defaultChecked: true }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(true);
  });

  it("uses defaultChecked as the initial checked for radio buttons", () => {
    const App = cc(() =>
      Input({ type: "radio", defaultChecked: true, value: "option2" }),
    );
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(input.value).toBe("option2");
  });
});

// ─── Usage / Controlling an input with a state variable ────────────────

describe("Input — Usage / Controlling an input with a state variable", () => {
  it("updates the text input value when state changes", async () => {
    const App = cc(() => {
      const [name, setName] = useState("Taylor");
      return Input({
        type: "text",
        value: name,
        onInput: (e: any) => setName(e.target.value),
      });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("Taylor");

    // Simulate user typing
    input.value = "Taylor Swift";
    input.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(input.value).toBe("Taylor Swift");
  });

  it("updates the checkbox checked state when state changes", async () => {
    const App = cc(() => {
      const [checked, setChecked] = useState(false);
      return Input({
        type: "checkbox",
        checked,
        onChange: (e: any) => setChecked(e.target.checked),
      });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(false);

    // Simulate user clicking
    input.checked = true;
    input.dispatchEvent(new (win as any).Event("change", { bubbles: true }));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(input.checked).toBe(true);
  });

  it("updates the radio checked state when state changes", async () => {
    const App = cc(() => {
      const [selected, setSelected] = useState("a");
      return el(
        "div",
        {},
        Input({
          type: "radio",
          name: "choice",
          value: "a",
          checked: selected() === "a",
          onChange: () => setSelected("a"),
        }),
        Input({
          type: "radio",
          name: "choice",
          value: "b",
          checked: selected() === "b",
          onChange: () => setSelected("b"),
        }),
      );
    });
    mount(App, container);
    const inputs = container.querySelectorAll(
      "input",
    ) as unknown as HTMLInputElement[];
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(false);

    inputs[1].checked = true;
    inputs[1].dispatchEvent(
      new (win as any).Event("change", { bubbles: true }),
    );
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(inputs[0].checked).toBe(false);
    expect(inputs[1].checked).toBe(true);
  });
});

// ─── Caveats ───────────────────────────────────────────────────────────

describe("Input — Caveats", () => {
  it("throws when both value and defaultValue are provided", () => {
    expect(() =>
      Input({ type: "text", value: "x", defaultValue: "y" }),
    ).toThrow();
  });

  it("throws when both checked and defaultChecked are provided", () => {
    expect(() =>
      Input({ type: "checkbox", checked: true, defaultChecked: true }),
    ).toThrow();
  });

  it("does not throw when only defaultValue is provided", () => {
    const App = cc(() => Input({ type: "text", defaultValue: "safe" }));
    expect(() => mount(App, container)).not.toThrow();
  });

  it("does not throw when only defaultChecked is provided", () => {
    const App = cc(() => Input({ type: "checkbox", defaultChecked: false }));
    expect(() => mount(App, container)).not.toThrow();
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Input — Edge cases", () => {
  it("registers function formAction via ref", () => {
    const App = cc(() =>
      Input({
        type: "submit",
        formAction: () => {},
      }),
    );
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("data-sinwan-formaction")).toBe("");
    expect(_resolveFormAction(input)).toBeInstanceOf(Function);
  });

  it("passes string formAction through as an attribute", () => {
    const App = cc(() =>
      Input({
        type: "submit",
        formAction: "/submit",
      }),
    );
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.getAttribute("formaction")).toBe("/submit");
  });

  it("allows controlled input with empty string value", () => {
    const App = cc(() => {
      const [value] = useState("");
      return Input({ type: "text", value });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("allows uncontrolled input with empty string defaultValue", () => {
    const App = cc(() => Input({ type: "text", defaultValue: "" }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("allows controlled checkbox with false checked", () => {
    const App = cc(() => {
      const [checked] = useState(false);
      return Input({ type: "checkbox", checked });
    });
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it("allows uncontrolled checkbox with false defaultChecked", () => {
    const App = cc(() => Input({ type: "checkbox", defaultChecked: false }));
    mount(App, container);
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;
    expect(input.checked).toBe(false);
  });
});
