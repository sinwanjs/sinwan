/**
 * Comprehensive tests for `captureOwnerStack`.
 *
 * Tests are organised to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { onError } from "../../../../src/component/lifecycle.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { captureOwnerStack } from "../../../../src/integrations/react/capture-owner-stack.ts";
import { useEffect } from "../../../../src/integrations/react/use-effect.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

/** Wait for the next microtask flush (effects schedule via queueMicrotask). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("captureOwnerStack — Reference", () => {
  it("accepts no parameters", () => {
    expect(captureOwnerStack).toBeDefined();
    expect(typeof captureOwnerStack).toBe("function");
    expect(captureOwnerStack.length).toBe(0);
  });

  it("returns string | null", () => {
    // Outside any component → null
    const result = captureOwnerStack();
    expect(result).toBeNull();

    // Inside a component → string (when there is an owner)
    let captured: string | null = null;
    const Leaf = cc(function Leaf() {
      captured = captureOwnerStack();
      return el("span");
    });
    const Root = cc(function Root() {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });
    mount(Root, container);
    expect(typeof captured).toBe("string");
    expect(captured!).toContain("Root");
  });

  it("returns null when no instance is active", () => {
    // Covers: Reference / Returns — If no Owner Stack is available, null
    expect(captureOwnerStack()).toBeNull();
  });

  it("returns null when called in a setTimeout (outside React-controlled fn)", async () => {
    // Covers: Troubleshooting / The Owner Stack is null — call happened
    // outside of a React controlled function e.g. in a setTimeout callback.
    let result: string | null = "initial";
    const App = cc(() => {
      setTimeout(() => {
        result = captureOwnerStack();
      }, 0);
      return el("div");
    });
    mount(App, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(result).toBeNull();
  });
});

// ─── Usage / Enhance a custom error overlay ───────────────────────────────

describe("captureOwnerStack — Usage / Enhance a custom error overlay", () => {
  it("returns an owner stack when called during component render", () => {
    let stack: string | null = null;

    const Inner = cc(function Inner() {
      stack = captureOwnerStack();
      return el("span");
    });

    const Outer = cc(function Outer() {
      return el("div", {}, { tag: Inner, props: {}, children: [] } as any);
    });

    mount(Outer, container);
    expect(typeof stack).toBe("string");
    expect(stack!).toContain("Outer");
  });

  it("returns an owner stack when called inside useEffect", async () => {
    let stack: string | null = null;

    const Leaf = cc(function Leaf() {
      useEffect(() => {
        stack = captureOwnerStack();
      });
      return el("span");
    });

    const Root = cc(function Root() {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });

    mount(Root, container);
    await tick();
    expect(typeof stack).toBe("string");
    expect(stack!).toContain("Root");
  });

  it("returns an owner stack inside an error handler", () => {
    let capturedStack: string | null = null;
    const errors: Error[] = [];

    const Broken = cc(function Broken() {
      throw new Error("Oops!");
    });

    const Boundary = cc(function Boundary() {
      onError((err) => {
        errors.push(err);
        capturedStack = captureOwnerStack();
      });
      return el("div", {}, { tag: Broken, props: {}, children: [] } as any);
    });

    const Root = cc(function Root() {
      return el("div", {}, { tag: Boundary, props: {}, children: [] } as any);
    });

    mount(Root, container);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toBe("Oops!");
    expect(typeof capturedStack).toBe("string");
    expect(capturedStack!).toContain("Root");
    expect(capturedStack!).not.toContain("Boundary");
  });
});

// ─── Troubleshooting / The Owner Stack is null ─────────────────────────────

describe("captureOwnerStack — Troubleshooting / The Owner Stack is null", () => {
  it("returns null in a custom DOM event handler", () => {
    let captured: string | null = "initial";

    const handler = () => {
      captured = captureOwnerStack();
    };
    container.addEventListener("click", handler);
    (container as any).dispatchEvent(new (window as any).Event("click"));
    container.removeEventListener("click", handler);
    expect(captured).toBeNull();
  });

  it("returns null in a fetch callback (simulated)", async () => {
    let captured: string | null = "initial";

    const App = cc(() => {
      // Simulating a fetch callback that runs later
      queueMicrotask(() => {
        captured = captureOwnerStack();
      });
      return el("div");
    });

    mount(App, container);
    await tick();
    // After the microtask, current instance is cleared
    expect(captured).toBeNull();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("captureOwnerStack — Edge cases", () => {
  it("excludes the current component from the stack", () => {
    let stack: string | null = null;

    const Leaf = cc(function Leaf() {
      stack = captureOwnerStack();
      return el("span");
    });

    const Branch = cc(function Branch() {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });

    mount(Branch, container);
    expect(typeof stack).toBe("string");
    // The leaf component itself should NOT appear
    expect(stack!).not.toContain("Leaf");
    // Its owner should appear
    expect(stack!).toContain("Branch");
  });

  it("returns null for a root component (no owners)", () => {
    let stack: string | null = "initial";

    const Root = cc(function Root() {
      stack = captureOwnerStack();
      return el("div");
    });

    mount(Root, container);
    expect(stack).toBeNull();
  });

  it("walks multiple levels of ownership", () => {
    const stacks: (string | null)[] = [];

    const Level3 = cc(function Level3() {
      stacks.push(captureOwnerStack());
      return el("span");
    });

    const Level2 = cc(function Level2() {
      return el("div", {}, { tag: Level3, props: {}, children: [] } as any);
    });

    const Level1 = cc(function Level1() {
      return el("div", {}, { tag: Level2, props: {}, children: [] } as any);
    });

    mount(Level1, container);
    expect(stacks.length).toBe(1);
    const stack = stacks[0]!;
    expect(stack).toContain("Level1");
    expect(stack).toContain("Level2");
    expect(stack).not.toContain("Level3");
  });

  it("uses _displayName when available", () => {
    let stack: string | null = null;

    const Leaf = cc(function Leaf() {
      stack = captureOwnerStack();
      return el("span");
    });

    const DisplayNamed = cc(function DisplayNamed() {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });
    (DisplayNamed as any)._displayName = "MyCustomName";

    mount(DisplayNamed, container);
    expect(stack!).toContain("MyCustomName");
    expect(stack!).not.toContain("DisplayNamed");
    expect(stack!).not.toContain("Leaf");
  });

  it("falls back to function name when _displayName is absent", () => {
    let stack: string | null = null;

    const Leaf = cc(function Leaf() {
      stack = captureOwnerStack();
      return el("span");
    });

    const KnownName = cc(function KnownName() {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });

    mount(KnownName, container);
    expect(stack!).toContain("KnownName");
    expect(stack!).not.toContain("Leaf");
  });

  it("falls back to AnonymousComponent for unnamed components", () => {
    let stack: string | null = null;

    const Leaf = cc(function Leaf() {
      stack = captureOwnerStack();
      return el("span");
    });

    const UnnamedOwner = cc(function () {
      return el("div", {}, { tag: Leaf, props: {}, children: [] } as any);
    });

    mount(UnnamedOwner, container);
    expect(stack!).toContain("AnonymousComponent");
    expect(stack!).not.toContain("Leaf");
  });

  it("formats frames like a stack trace", () => {
    let stack: string | null = null;

    const Child = cc(function Child() {
      stack = captureOwnerStack();
      return el("span");
    });

    const Parent = cc(function Parent() {
      return el("div", {}, { tag: Child, props: {}, children: [] } as any);
    });

    mount(Parent, container);
    expect(stack!).toMatch(/^    at Parent$/m);
  });

  it("returns null again after unmount", () => {
    let captured: string | null = null;

    const App = cc(() => {
      captured = captureOwnerStack();
      return el("div");
    });

    const app = mount(App, container);
    expect(captured).toBeNull(); // root has no owners

    app.unmount();
    // After unmount, getCurrentInstance should be cleared
    expect(captureOwnerStack()).toBeNull();
  });
});
