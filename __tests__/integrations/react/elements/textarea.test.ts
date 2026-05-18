/**
 * Comprehensive tests for `<Textarea>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Textarea,
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

const tick = () => new Promise((r) => queueMicrotask(() => r(null)));

// ─── Reference ───────────────────────────────────────────────────────────

describe("Textarea — Reference", () => {
  it("renders a native <textarea> element", () => {
    const App = cc(() => Textarea({}));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("accepts common element props", () => {
    const App = cc(() =>
      Textarea({
        id: "my-textarea",
        className: "post-content",
        name: "postContent",
        placeholder: "Write something...",
        disabled: true,
      }),
    );
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("id")).toBe("my-textarea");
    expect(textarea.getAttribute("class")).toBe("post-content");
    expect(textarea.getAttribute("name")).toBe("postContent");
    expect(textarea.getAttribute("placeholder")).toBe("Write something...");
    expect(textarea.hasAttribute("disabled")).toBe(true);
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Textarea — Props", () => {
  it("defaultValue sets the initial text content", () => {
    const App = cc(() => Textarea({ defaultValue: "Hello world" }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hello world");
  });

  it("value prop controls the textarea when provided", () => {
    const App = cc(() => Textarea({ value: "controlled content" }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("controlled content");
  });

  it("passes rows as an attribute", () => {
    const App = cc(() => Textarea({ rows: 4 }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("rows")).toBe("4");
  });

  it("passes cols as an attribute", () => {
    const App = cc(() => Textarea({ cols: 40 }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("cols")).toBe("40");
  });

  it("passes maxLength as an attribute", () => {
    const App = cc(() => Textarea({ maxLength: 100 }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("maxlength")).toBe("100");
  });

  it("passes minLength as an attribute", () => {
    const App = cc(() => Textarea({ minLength: 10 }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("minlength")).toBe("10");
  });

  it("passes readOnly as a boolean attribute", () => {
    const App = cc(() => Textarea({ readOnly: true }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.hasAttribute("readonly")).toBe(true);
    expect(textarea.readOnly).toBe(true);
  });

  it("passes required as a boolean attribute", () => {
    const App = cc(() => Textarea({ required: true }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.hasAttribute("required")).toBe(true);
    expect(textarea.required).toBe(true);
  });

  it("passes wrap as an attribute", () => {
    const App = cc(() => Textarea({ wrap: "hard" }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("wrap")).toBe("hard");
  });

  it("passes autoComplete as an attribute", () => {
    const App = cc(() => Textarea({ autoComplete: "on" }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("autocomplete")).toBe("on");
  });
});

// ─── Usage / Displaying a text area ──────────────────────────────────────

describe("Textarea — Usage / Displaying a text area", () => {
  it("renders an empty textarea by default", () => {
    const App = cc(() => Textarea({}));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("renders a textarea with rows and cols", () => {
    const App = cc(() => Textarea({ rows: 4, cols: 40 }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("rows")).toBe("4");
    expect(textarea.getAttribute("cols")).toBe("40");
  });
});

// ─── Usage / Providing an initial value for a text area ──────────────────

describe("Textarea — Usage / Providing an initial value for a text area", () => {
  it("uses defaultValue as the initial text content", () => {
    const App = cc(() =>
      Textarea({
        name: "postContent",
        defaultValue: "I really enjoyed biking yesterday!",
        rows: 4,
        cols: 40,
      }),
    );
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("I really enjoyed biking yesterday!");
    expect(textarea.getAttribute("name")).toBe("postContent");
  });
});

// ─── Usage / Reading the textarea value when submitting a form ────────────

describe("Textarea — Usage / Reading the textarea value when submitting a form", () => {
  it("renders a textarea with a name inside a form", () => {
    const App = cc(() =>
      el(
        "form",
        { method: "post" },
        el("label", {}, "Post title: ", el("input", { name: "postTitle" })),
        el(
          "label",
          {},
          "Edit your post:",
          Textarea({
            name: "postContent",
            defaultValue: "I really enjoyed biking yesterday!",
            rows: 4,
            cols: 40,
          }),
        ),
        el("button", { type: "submit" }, "Save post"),
      ),
    );
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.getAttribute("name")).toBe("postContent");
    expect(textarea.value).toBe("I really enjoyed biking yesterday!");
  });
});

// ─── Usage / Controlling a text area with a state variable ─────────────────

describe("Textarea — Usage / Controlling a text area with a state variable", () => {
  it("updates the textarea value when state changes via onChange", async () => {
    const App = cc(() => {
      const [postContent, setPostContent] = useState("_Hello,_ **Markdown**!");
      return Textarea({
        value: postContent,
        onInput: (e: any) => setPostContent(e.target.value),
      });
    });
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("_Hello,_ **Markdown**!");

    // Simulate user typing
    textarea.value = "Updated content";
    textarea.dispatchEvent(new (win as any).Event("input", { bubbles: true }));
    await tick();

    expect(textarea.value).toBe("Updated content");
  });

  it("reactively updates controlled value when state changes externally", async () => {
    let setContent: (v: string) => void;

    const App = cc(() => {
      const [content, setValue] = useState("initial");
      setContent = setValue;
      return Textarea({
        value: content,
        onChange: () => {},
      });
    });

    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("initial");

    setContent!("changed");
    await tick();

    expect(textarea.value).toBe("changed");
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Textarea — Caveats", () => {
  it("throws when both value and defaultValue are provided", () => {
    expect(() => Textarea({ value: "x", defaultValue: "y" })).toThrow(
      /must be either controlled or uncontrolled/,
    );
  });

  it("throws when children are provided", () => {
    expect(() => Textarea({ children: "some content" } as any)).toThrow(
      /does not accept children/,
    );
  });

  it("does not throw when only defaultValue is provided", () => {
    const App = cc(() => Textarea({ defaultValue: "safe" }));
    expect(() => mount(App, container)).not.toThrow();
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("safe");
  });

  it("does not throw when only value is provided", () => {
    const App = cc(() => Textarea({ value: "safe" }));
    expect(() => mount(App, container)).not.toThrow();
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("safe");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Textarea — Edge cases", () => {
  it("allows controlled textarea with empty string value", () => {
    const App = cc(() => {
      const [value] = useState("");
      return Textarea({ value });
    });
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("allows uncontrolled textarea with empty string defaultValue", () => {
    const App = cc(() => Textarea({ defaultValue: "" }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("treats null value as uncontrolled", () => {
    const App = cc(() => Textarea({ value: null as any }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("");
  });

  it("cleans up reactive effect on unmount", async () => {
    let setContent: (v: string) => void;

    const App = cc(() => {
      const [content, setValue] = useState("hello");
      setContent = setValue;
      return Textarea({
        value: content,
        onChange: () => {},
      });
    });

    const app = mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    expect(textarea.value).toBe("hello");

    app.unmount();

    // After unmount, updating state should not throw
    setContent!("world");
    await tick();
    expect(() => setContent!("!")).not.toThrow();
  });

  it("handles rapid controlled value changes", async () => {
    let setContent: (v: string) => void;

    const App = cc(() => {
      const [content, setValue] = useState("a");
      setContent = setValue;
      return Textarea({
        value: content,
        onChange: () => {},
      });
    });

    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;

    setContent!("b");
    setContent!("c");
    setContent!("d");
    await tick();

    expect(textarea.value).toBe("d");
  });

  it("preserves user ref callback", () => {
    let refEl: Element | null = null;
    const App = cc(() =>
      Textarea({
        value: "test",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    mount(App, container);
    expect(refEl).toBeTruthy();
    expect(refEl!.tagName.toLowerCase()).toBe("textarea");
  });

  it("calls user ref with null on unmount", () => {
    let refEl: Element | null = "initial" as any;
    const App = cc(() =>
      Textarea({
        value: "test",
        ref: (el: Element | null) => {
          refEl = el;
        },
      }),
    );
    const app = mount(App, container);
    expect(refEl).toBeTruthy();
    app.unmount();
    expect(refEl).toBeNull();
  });

  it("handles controlled value initialized to null by coercing to empty string", () => {
    const App = cc(() => Textarea({ value: null as any, onChange: () => {} }));
    mount(App, container);
    const textarea = container.querySelector(
      "textarea",
    ) as unknown as HTMLTextAreaElement;
    // null is treated as uncontrolled (hasValue = false), so value is ""
    expect(textarea.value).toBe("");
  });
});
