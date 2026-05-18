/**
 * Comprehensive tests for `useFormStatus`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useFormStatus,
  Form,
} from "../../../../src/integrations/react/_client.ts";
import { _setFormStatus } from "../../../../src/integrations/react/use-form-status.ts";
import {
  getCurrentInstance,
  setCurrentInstance,
} from "../../../../src/component/instance.ts";

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

describe("useFormStatus — Reference", () => {
  it("returns not-pending by default when not inside a form", () => {
    let status: any;
    const App = cc(() => {
      status = useFormStatus();
      return el("div");
    });
    mount(App, container);
    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
    expect(status.method()).toBeNull();
    expect(status.action()).toBeNull();
  });

  it("throws when called outside a component", () => {
    const prev = getCurrentInstance();
    setCurrentInstance(null as any);
    expect(() => useFormStatus()).toThrow(/Hook called outside of a component/);
    setCurrentInstance(prev);
  });
});

// ─── Usage / Display a pending state during form submission ─────────────

describe("useFormStatus — Usage / Display a pending state", () => {
  it("reflects pending=true while an async form action is in flight", async () => {
    let resolveAction: (() => void) | undefined;
    let status: any;

    const Submit = cc(() => {
      status = useFormStatus();
      return el(
        "button",
        { type: "submit", disabled: status.pending },
        "Submit",
      );
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
    const button = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(status.pending()).toBe(false);

    // Trigger submit
    const formEl = container.querySelector(
      "form",
    ) as unknown as HTMLFormElement;
    formEl.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );

    // Status updates synchronously because the getter reads the signal directly
    expect(status.pending()).toBe(true);
    // DOM effect is flushed in a microtask, so wait one tick
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(button.disabled).toBe(true);

    resolveAction!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(status.pending()).toBe(false);
    expect(button.disabled).toBe(false);
  });
});

// ─── Usage / Read the form data being submitted ──────────────────────────

describe("useFormStatus — Usage / Read the form data", () => {
  it("exposes the FormData and method while pending", async () => {
    let status: any;

    const Submit = cc(() => {
      status = useFormStatus();
      return el("span", {}, status.data() ? status.data().get("name") : "");
    });

    const App = cc(() =>
      Form({
        action: async () => {},
        method: "post",
        children: el(Submit as any, {}),
      }),
    );

    mount(App, container);
    expect(status.data()).toBeNull();

    const fd = new FormData();
    fd.append("name", "Alice");

    _setFormStatus({
      pending: true,
      data: fd,
      method: "post",
      action: async () => {},
    });

    expect(status.pending()).toBe(true);
    expect(status.data()).toBeInstanceOf((globalThis as any).FormData);
    expect(status.data().get("name")).toBe("Alice");
    expect(status.method()).toBe("post");
    expect(typeof status.action()).toBe("function");

    _setFormStatus({
      pending: false,
      data: null,
      method: null,
      action: null,
    });

    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("useFormStatus — Caveats", () => {
  it("does not track a form rendered in the same component", () => {
    let status: any;
    const App = cc(() => {
      status = useFormStatus();
      return Form({
        action: "/submit",
        children: el("button", { type: "submit" }, "Go"),
      });
    });

    mount(App, container);
    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
    expect(status.method()).toBeNull();
    expect(status.action()).toBeNull();
  });

  it("only returns status for a parent form, not child forms", () => {
    let parentStatus: any;
    let childStatus: any;

    const InnerForm = cc(() => {
      childStatus = useFormStatus();
      return Form({
        action: "/inner",
        children: el("button", { type: "submit" }, "Inner"),
      });
    });

    const App = cc(() => {
      parentStatus = useFormStatus();
      return Form({
        action: "/outer",
        children: el(InnerForm as any, {}),
      });
    });

    mount(App, container);
    expect(parentStatus.pending()).toBe(false);
    expect(childStatus.pending()).toBe(false);
  });
});

// ─── Troubleshooting ─────────────────────────────────────────────────────

describe("useFormStatus — Troubleshooting", () => {
  it("pending is never true when hook is not inside a <form>", () => {
    let status: any;
    const App = cc(() => {
      status = useFormStatus();
      return el("div", {}, el("button", { type: "submit" }, "Orphan"));
    });

    mount(App, container);
    expect(status.pending()).toBe(false);
    expect(status.data()).toBeNull();
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("useFormStatus — Edge cases", () => {
  it("resets correctly after multiple rapid submissions", async () => {
    let callCount = 0;
    let status: any;

    const Submit = cc(() => {
      status = useFormStatus();
      return el("button", { type: "submit", disabled: status.pending }, "Go");
    });

    const App = cc(() =>
      Form({
        action: async () => {
          callCount++;
          await new Promise<void>((res) => queueMicrotask(() => res()));
        },
        children: el(Submit as any, {}),
      }),
    );

    mount(App, container);
    const formEl = container.querySelector(
      "form",
    ) as unknown as HTMLFormElement;

    formEl.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(status.pending()).toBe(true);

    formEl.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    expect(status.pending()).toBe(true);

    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(status.pending()).toBe(false);
    expect(callCount).toBe(2);
  });

  it("action is null when parent form uses a string action", () => {
    let status: any;
    const App = cc(() => {
      status = useFormStatus();
      return Form({
        action: "/post",
        children: el("button", { type: "submit" }, "Go"),
      });
    });
    mount(App, container);
    expect(status.action()).toBeNull();
  });
});
