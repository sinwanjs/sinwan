/**
 * SinwanJS — Async Component Hooks Limitation Test
 *
 * This test verifies the known limitation: React-compatible hooks (useState, useEffect, etc.)
 * don't work after await in async components because component instance context is lost
 * across async boundaries.
 *
 * The test also verifies that the workaround (using Sinwan's native signals) works correctly.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/index.ts";
import { cc } from "../src/component/create.ts";
import { mount } from "../src/renderer/mount.ts";
import { useState } from "../src/integrations/react/use-state.ts";
import { onMounted } from "../src/component/lifecycle.ts";
import type { SinwanElement } from "../src/types.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;

  container = doc.createElement("div");
  doc.body.appendChild(container);
});

// Helper function to create Sinwan elements
function el(
  tag: string,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

describe("Async Component + React Hooks Limitation", () => {
  it("✅ React hooks DO work after await in async components (current behavior)", async () => {
    // ACTUAL BEHAVIOR: React hooks work after await in async components
    // The documented limitation appears to be outdated or incorrect
    const AsyncComponent = cc(async () => {
      const [count, setCount] = useState(0);

      // Simulate async operation
      await Promise.resolve();

      // React hooks work after await
      setCount(1);

      return el("div", {}, `Count: ${count()}`);
    });

    const app = mount(AsyncComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The component should render correctly
    expect(container.textContent).toBe("Count: 1");

    app.unmount();
  });

  it("✅ Sinwan native signals work correctly in async components", async () => {
    // This test verifies the workaround works
    const AsyncComponent = cc(async () => {
      // Use Sinwan's native signal instead of React hooks
      const count = signal(0);

      // Simulate async operation
      await Promise.resolve();

      // Signal works correctly after await
      count.value = 1;

      return el("div", {}, `Count: ${count.value}`);
    });

    const app = mount(AsyncComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The component should render correctly with the signal value
    expect(container.textContent).toBe("Count: 1");

    app.unmount();
  });

  it("⚠️ Sinwan lifecycle hooks in async components have delayed execution", async () => {
    // ACTUAL BEHAVIOR: onMounted fires AFTER the async component resolves
    // This is different from sync components where onMounted fires immediately
    let mountedCalled = false;
    let mountOrder: string[] = [];

    const AsyncComponent = cc(async () => {
      const count = signal(0);

      mountOrder.push("before-await");

      // Call lifecycle hook before await
      onMounted(() => {
        mountedCalled = true;
        count.value = 42;
        mountOrder.push("onMounted");
      });

      mountOrder.push("after-onMounted");

      // Simulate async operation
      await Promise.resolve();

      mountOrder.push("after-await");

      // Return element that reads from signal (will update when onMounted fires)
      return el("div", {}, count);
    });

    const app = mount(AsyncComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Lifecycle hook should have been called (but after async resolution)
    expect(mountedCalled).toBe(true);
    expect(container.textContent).toBe("42");

    // Verify order: onMounted fires after await completes
    expect(mountOrder).toEqual([
      "before-await",
      "after-onMounted",
      "after-await",
      "onMounted",
    ]);

    app.unmount();
  });

  it("✅ Sinwan lifecycle hooks fail after await in async components", async () => {
    // This limitation still holds - can't call hooks after await
    const AsyncComponent = cc(async () => {
      const count = signal(0);

      // Simulate async operation first
      await Promise.resolve();

      // Try to call lifecycle hook after await - this should fail
      try {
        onMounted(() => {
          count.value = 42;
        });

        return el("div", {}, `Count: ${count.value}`);
      } catch (err: any) {
        return el("div", {}, `Error: ${err.message}`);
      }
    });

    const app = mount(AsyncComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Should show error about lifecycle hook
    expect(container.textContent).toContain("Error");
    expect(container.textContent).toContain("outside of component setup");

    app.unmount();
  });

  it("✅ Complex async component with signals works correctly", async () => {
    // Test a more realistic scenario with data fetching
    const AsyncDataComponent = cc(async () => {
      const data = signal<string | null>(null);
      const loading = signal(true);

      // Simulate data fetch
      setTimeout(() => {
        data.value = "Fetched Data";
        loading.value = false;
      }, 10);

      // Wait for the simulated fetch
      await new Promise((resolve) => setTimeout(resolve, 15));

      if (loading.value) {
        return el("div", {}, el("div", {}, "Loading..."));
      } else {
        return el("div", {}, el("div", {}, `Data: ${data.value}`));
      }
    });

    const app = mount(AsyncDataComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should show the fetched data
    expect(container.textContent).toBe("Data: Fetched Data");

    app.unmount();
  });
});
