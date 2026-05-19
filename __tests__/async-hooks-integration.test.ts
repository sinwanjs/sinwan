/**
 * Sinwan Test App — Async Component Hooks Integration Test
 *
 * This integration test verifies async component hooks behavior
 * in the context of a real Sinwan application with SSR and hydration.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/index.ts";
import { cc } from "../src/component/create.ts";
import { mount } from "../src/renderer/mount.ts";
import { useState } from "../src/integrations/react/use-state.ts";
import { onMounted } from "../src/component/lifecycle.ts";

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
): any {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

describe("Sinwan Test App — Async Hooks Integration", () => {
  it("✅ React hooks work in async component with data fetching pattern", async () => {
    // Simulate a real-world data fetching component
    const DataComponent = cc(async () => {
      const [data, setData] = useState<string | null>(null);
      const [loading, setLoading] = useState(true);

      // Simulate async data fetch
      await new Promise((resolve) => setTimeout(resolve, 10));

      setData("Fetched Data");
      setLoading(false);

      // Return signal for reactive updates
      return el(
        "div",
        {},
        loading() ? el("div", {}, "Loading...") : el("div", {}, data()),
      );
    });

    const app = mount(DataComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should show the fetched data
    expect(container.textContent).toBe("Fetched Data");

    app.unmount();
  });

  it("✅ Sinwan signals work in async component with complex state", async () => {
    // Test a more complex async component with multiple signals
    const ComplexAsyncComponent = cc(async () => {
      const users = signal<any[]>([]);
      const loading = signal(true);
      const error = signal<string | null>(null);

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 10));

      try {
        users.value = [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ];
        loading.value = false;
      } catch (err) {
        error.value = "Failed to fetch";
        loading.value = false;
      }

      if (error.value) {
        return el("div", {}, `Error: ${error.value}`);
      }

      if (loading.value) {
        return el("div", {}, "Loading users...");
      }

      return el(
        "div",
        {},
        users.value.map((user: any) =>
          el("div", {}, `${user.id}: ${user.name}`),
        ),
      );
    });

    const app = mount(ComplexAsyncComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should show the users
    expect(container.textContent).toContain("1: Alice");
    expect(container.textContent).toContain("2: Bob");

    app.unmount();
  });

  it("✅ Lifecycle hooks work in async component when called before await", async () => {
    // Test that onMounted works when called before await
    let mountedCalled = false;
    let dataLoaded = false;

    const AsyncWithLifecycle = cc(async () => {
      const data = signal<string | null>(null);

      onMounted(() => {
        mountedCalled = true;
        data.value = "Loaded on mount";
      });

      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      dataLoaded = true;

      return el("div", {}, data);
    });

    const app = mount(AsyncWithLifecycle, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Both should be true
    expect(mountedCalled).toBe(true);
    expect(dataLoaded).toBe(true);
    expect(container.textContent).toBe("Loaded on mount");

    app.unmount();
  });

  it("✅ Mixed React hooks and Sinwan signals in async component", async () => {
    // Test using both React hooks and Sinwan signals together
    const MixedComponent = cc(async () => {
      // React hook
      const [reactCount, setReactCount] = useState(0);

      // Sinwan signal
      const sinwanCount = signal(0);

      // Simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update both
      setReactCount(5);
      sinwanCount.value = 10;

      return el(
        "div",
        {},
        el("div", {}, `React: ${reactCount()}`),
        el("div", {}, `Sinwan: ${sinwanCount.value}`),
      );
    });

    const app = mount(MixedComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Both should work
    expect(container.textContent).toContain("React: 5");
    expect(container.textContent).toContain("Sinwan: 10");

    app.unmount();
  });

  it("✅ Sequential async operations with state updates", async () => {
    // Test multiple sequential async operations
    const SequentialAsyncComponent = cc(async () => {
      const step = signal(1);
      const results = signal<string[]>([]);

      // Step 1
      await new Promise((resolve) => setTimeout(resolve, 10));
      step.value = 2;
      results.value = [...results.value, "Step 1 complete"];

      // Step 2
      await new Promise((resolve) => setTimeout(resolve, 10));
      step.value = 3;
      results.value = [...results.value, "Step 2 complete"];

      // Step 3
      await new Promise((resolve) => setTimeout(resolve, 10));
      step.value = 4;
      results.value = [...results.value, "Step 3 complete"];

      return el(
        "div",
        {},
        el("div", {}, `Step: ${step.value}`),
        el("div", {}, results.value.join(", ")),
      );
    });

    const app = mount(SequentialAsyncComponent, container);

    // Wait for all async operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should show final state
    expect(container.textContent).toContain("Step: 4");
    expect(container.textContent).toContain("Step 1 complete");
    expect(container.textContent).toContain("Step 2 complete");
    expect(container.textContent).toContain("Step 3 complete");

    app.unmount();
  });

  it("✅ Error handling in async components with React hooks", async () => {
    // Test error handling with React hooks
    const ErrorComponent = cc(async () => {
      const [error, setError] = useState<string | null>(null);
      const [data, setData] = useState<string | null>(null);

      try {
        // Simulate failing async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("API Error");
      } catch (err: any) {
        setError(err.message);
      }

      if (error()) {
        return el("div", {}, `Error: ${error()}`);
      }

      return el("div", {}, data() || "No data");
    });

    const app = mount(ErrorComponent, container);

    // Wait for async component to resolve
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should show error
    expect(container.textContent).toContain("Error: API Error");

    app.unmount();
  });
});
