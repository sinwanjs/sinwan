/**
 * Comprehensive tests for `<Form>`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Form,
  Input,
  Button,
  useFormStatus,
} from "../../../../src/integrations/react/_client.ts";
import { _setFormStatus } from "../../../../src/integrations/react/use-form-status.ts";
import { _resolveFormAction } from "../../../../src/integrations/react/elements.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  _setFormStatus({
    pending: false,
    data: null,
    method: null,
    action: null,
  });
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

describe("Form — Reference", () => {
  it("renders a native <form> with string action", () => {
    const App = cc(() =>
      Form({ action: "/search", method: "get", children: el("input") }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(form.getAttribute("action")).toBe("/search");
    expect(form.getAttribute("method")).toBe("get");
  });

  it("renders a native <form> with function action", () => {
    const App = cc(() => Form({ action: () => {}, children: el("input") }));
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    expect(form).toBeTruthy();
    expect(form.getAttribute("method")).toBe("post");
  });
});

// ─── Props ───────────────────────────────────────────────────────────────

describe("Form — Props", () => {
  it("forces method=post when action is a function regardless of method prop", () => {
    const App = cc(() =>
      Form({ action: () => {}, method: "get", children: el("input") }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
  });

  it("preserves method prop when action is a string", () => {
    const App = cc(() =>
      Form({ action: "/search", method: "get", children: el("input") }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("get");
  });

  it("calls onSubmit before preventing default when action is a function", () => {
    let submitted = false;
    const App = cc(() =>
      Form({
        action: () => {},
        onSubmit: () => {
          submitted = true;
        },
        children: el("input"),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(submitted).toBe(true);
  });
});

// ─── Usage / Handle form submission on the client ────────────────────────

describe("Form — Usage / Handle form submission on the client", () => {
  it("passes FormData to the action function", async () => {
    let received: FormData | null = null;
    const App = cc(() =>
      Form({
        action: (fd: FormData) => {
          received = fd;
        },
        children: el("input", { name: "query" }),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(received).toBeInstanceOf((globalThis as any).FormData);
  });

  it("resets the form after a sync action succeeds", async () => {
    let resetCalled = false;
    const App = cc(() =>
      Form({
        action: () => {},
        children: el("input", { name: "q", value: "x" }),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    const originalReset = form.reset.bind(form);
    form.reset = () => {
      resetCalled = true;
      originalReset();
    };
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(resetCalled).toBe(true);
  });

  it("resets the form after an async action succeeds", async () => {
    let resolveAction: (() => void) | undefined;
    let resetCalled = false;
    const App = cc(() =>
      Form({
        action: async () => {
          await new Promise<void>((res) => {
            resolveAction = res;
          });
        },
        children: el("input", { name: "q", value: "x" }),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    const originalReset = form.reset.bind(form);
    form.reset = () => {
      resetCalled = true;
      originalReset();
    };
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(resetCalled).toBe(false);
    resolveAction!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(resetCalled).toBe(true);
  });
});

// ─── Usage / Display a pending state during form submission ──────────────

describe("Form — Usage / Display a pending state", () => {
  it("drives useFormStatus while an async action is in flight", async () => {
    let resolveAction: (() => void) | undefined;
    let status: any;

    const Submit = cc(() => {
      status = useFormStatus();
      return el("button", { type: "submit", disabled: status.pending }, "Go");
    });

    const App = cc(() =>
      Form({
        action: async () => {
          await new Promise<void>((res) => {
            resolveAction = res;
          });
        },
        children: el(Submit as any, {}),
      }),
    );

    mount(App, container);
    expect(status.pending()).toBe(false);

    const form = container.querySelector("form") as unknown as HTMLFormElement;
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );

    expect(status.pending()).toBe(true);
    expect(status.method()).toBe("post");
    expect(typeof status.action()).toBe("function");

    resolveAction!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
  });
});

// ─── Usage / Handling multiple submission types ────────────────────────

describe("Form — Usage / Handling multiple submission types", () => {
  it("Button with function formAction overrides the form action", async () => {
    let formActionCalled = false;
    let buttonActionCalled = false;

    const App = cc(() =>
      Form({
        action: () => {
          formActionCalled = true;
        },
        children: Button({
          type: "submit",
          formAction: () => {
            buttonActionCalled = true;
          },
          children: "Save",
        }),
      }),
    );

    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;

    const event = new (win as any).Event("submit", {
      bubbles: true,
      cancelable: true,
    });
    (event as any).submitter = button;
    form.dispatchEvent(event);

    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(buttonActionCalled).toBe(true);
    expect(formActionCalled).toBe(false);
  });

  it("Input with function formAction overrides the form action", async () => {
    let formActionCalled = false;
    let inputActionCalled = false;

    const App = cc(() =>
      Form({
        action: () => {
          formActionCalled = true;
        },
        children: Input({
          type: "submit",
          formAction: () => {
            inputActionCalled = true;
          },
        }),
      }),
    );

    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    const input = container.querySelector(
      "input",
    ) as unknown as HTMLInputElement;

    const event = new (win as any).Event("submit", {
      bubbles: true,
      cancelable: true,
    });
    (event as any).submitter = input;
    form.dispatchEvent(event);

    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(inputActionCalled).toBe(true);
    expect(formActionCalled).toBe(false);
  });

  it("falls back to form action when submitter has no function formAction", async () => {
    let formActionCalled = false;

    const App = cc(() =>
      Form({
        action: () => {
          formActionCalled = true;
        },
        children: el("button", { type: "submit" }, "Go"),
      }),
    );

    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );

    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(formActionCalled).toBe(true);
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("Form — Caveats", () => {
  it("uses POST when action is a function even if method=get is passed", () => {
    const App = cc(() =>
      Form({
        action: () => {},
        method: "get",
        children: el("input"),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("Form — Edge cases", () => {
  it("handles rapid submissions sequentially", async () => {
    let callCount = 0;
    const App = cc(() =>
      Form({
        action: async () => {
          callCount++;
          await new Promise<void>((res) => queueMicrotask(() => res()));
        },
        children: el("button", { type: "submit" }, "Go"),
      }),
    );
    mount(App, container);
    const form = container.querySelector("form") as unknown as HTMLFormElement;

    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );

    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(callCount).toBe(2);
  });

  it("Button registers function formAction via ref", () => {
    const App = cc(() =>
      Button({
        type: "submit",
        formAction: () => {},
        children: "Go",
      }),
    );
    mount(App, container);
    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.getAttribute("data-sinwan-formaction")).toBe("");
    expect(_resolveFormAction(button)).toBeInstanceOf(Function);
  });

  it("Input registers function formAction via ref", () => {
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

  it("returns undefined for unregistered elements", () => {
    const div = win.document.createElement("div") as unknown as Element;
    expect(_resolveFormAction(div)).toBeUndefined();
  });
});
