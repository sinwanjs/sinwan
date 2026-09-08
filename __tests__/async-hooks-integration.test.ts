/**
 * Sinwan Test App — Async Component Hooks Integration Test
 *
 * This integration test verifies async component hooks behavior
 * in the context of a real Sinwan application with SSR and hydration.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { cc } from "../src/component/create.ts";
import { mount, render } from "../src/renderer/mount.ts";
import { useState } from "../src/react/use-state.ts";
import { onMounted } from "../src/component/lifecycle.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";
import type { AppInstance } from "../src/renderer/types.ts";

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
  tag: SinwanElement["tag"],
  props: Record<string, unknown> = {},
  ...children: SinwanNode[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag, props: finalProps, children };
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

describe("controlled async renderer ownership", () => {
  it("does not render or attach refs when an async root resolves after unmount", async () => {
    const pending = Promise.withResolvers<string>();
    const refs: Array<Element | null> = [];
    const AsyncRoot = cc(async () => {
      const text = await pending.promise;
      return el("p", { ref: (node: Element | null) => refs.push(node) }, text);
    });
    const app = mount(AsyncRoot, container);
    try {
      app.unmount();
      pending.resolve("late");
      await nextTick();
      expect(container.innerHTML).toBe("");
      expect(refs).toEqual([]);
    } finally {
      pending.resolve("cleanup");
      await nextTick();
      app.unmount();
      container.remove();
    }
  });

  it("does not overwrite a replacement root when the previous async mount resolves", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncRoot = cc(async () => el("p", {}, await pending.promise));
    const previous = mount(AsyncRoot, container);
    let replacement: AppInstance | undefined;
    try {
      replacement = mount(
        cc(() => el("strong", {}, "current")),
        container,
      );
      const currentNode = container.querySelector("strong");
      pending.resolve("obsolete");
      await nextTick();
      expect(container.textContent).toBe("current");
      expect(container.querySelector("strong")).toBe(currentNode);
    } finally {
      pending.resolve("cleanup");
      await nextTick();
      previous.unmount();
      replacement?.unmount();
      container.remove();
    }
  });

  it("keeps promise siblings in source order when they resolve in reverse order", async () => {
    const first = Promise.withResolvers<SinwanElement>();
    const second = Promise.withResolvers<SinwanElement>();
    const app = render(
      ["before", first.promise, "between", second.promise, "after"],
      container,
    );
    try {
      second.resolve(el("b", {}, "second"));
      await nextTick();
      expect(container.textContent).toBe("beforebetweensecondafter");
      const secondNode = container.querySelector("b");
      first.resolve(el("i", {}, "first"));
      await nextTick();
      expect(container.textContent).toBe("beforefirstbetweensecondafter");
      expect(container.querySelector("b")).toBe(secondNode);
    } finally {
      first.resolve(el("i"));
      second.resolve(el("b"));
      await nextTick();
      app.unmount();
      container.remove();
    }
  });

  it("ignores a superseded promise after a newer reactive child has resolved", async () => {
    const previous = Promise.withResolvers<SinwanElement>();
    const latest = Promise.withResolvers<SinwanElement>();
    const useLatest = signal(false);
    const refs: Array<Element | null> = [];
    const app = render(
      () => (useLatest.value ? latest.promise : previous.promise),
      container,
    );
    try {
      useLatest.value = true;
      await nextTick();
      latest.resolve(el("strong", {}, "latest"));
      await nextTick();
      const current = container.querySelector("strong");
      previous.resolve(
        el("i", { ref: (node: Element | null) => refs.push(node) }, "stale"),
      );
      await nextTick();
      expect(container.textContent).toBe("latest");
      expect(container.querySelector("strong")).toBe(current);
      expect(refs).toEqual([]);
    } finally {
      previous.resolve(el("i"));
      latest.resolve(el("strong"));
      await nextTick();
      app.unmount();
      container.remove();
    }
  });

  it("defers a nested async component's mounted hook until its DOM exists", async () => {
    const pending = Promise.withResolvers<string>();
    const observed: Array<string | null> = [];
    const AsyncChild = cc(async () => {
      onMounted(() => {
        observed.push(container.querySelector("span")?.textContent ?? null);
      });
      return el("span", {}, await pending.promise);
    });
    const app = mount(
      cc(() => el("div", {}, el(AsyncChild))),
      container,
    );
    try {
      expect(observed).toEqual([]);
      pending.resolve("ready");
      await nextTick();
      expect(observed).toEqual(["ready"]);
    } finally {
      pending.resolve("cleanup");
      await nextTick();
      app.unmount();
      container.remove();
    }
  });

  it("does not set up descendants returned by a nested async component after owner unmount", async () => {
    const pending = Promise.withResolvers<void>();
    let childSetups = 0;
    const Child = cc(() => {
      childSetups++;
      return el("span", {}, "late child");
    });
    const AsyncChild = cc(async () => {
      await pending.promise;
      return el(Child);
    });
    const app = mount(
      cc(() => el("div", {}, el(AsyncChild))),
      container,
    );
    try {
      app.unmount();
      pending.resolve();
      await nextTick();
      expect(childSetups).toBe(0);
      expect(container.innerHTML).toBe("");
    } finally {
      pending.resolve();
      await nextTick();
      app.unmount();
      container.remove();
    }
  });

  it("resolves independent async roots out of order without crossing DOM or hook ownership", async () => {
    const otherContainer = doc.createElement("div");
    doc.body.appendChild(otherContainer);
    const firstPending = Promise.withResolvers<string>();
    const secondPending = Promise.withResolvers<string>();
    const mounted: string[] = [];
    const First = cc(async () => {
      onMounted(() => {
        mounted.push(`first:${container.textContent}`);
      });
      return el("p", {}, await firstPending.promise);
    });
    const Second = cc(async () => {
      onMounted(() => {
        mounted.push(`second:${otherContainer.textContent}`);
      });
      return el("p", {}, await secondPending.promise);
    });
    const first = mount(First, container);
    let second: AppInstance | undefined;
    try {
      second = mount(Second, otherContainer);
      secondPending.resolve("two");
      await nextTick();
      expect(container.textContent).toBe("");
      expect(otherContainer.textContent).toBe("two");
      expect(mounted).toEqual(["second:two"]);
      firstPending.resolve("one");
      await nextTick();
      expect(container.textContent).toBe("one");
      expect(otherContainer.textContent).toBe("two");
      expect(mounted).toEqual(["second:two", "first:one"]);
      first.unmount();
      expect(otherContainer.textContent).toBe("two");
    } finally {
      firstPending.resolve("cleanup");
      secondPending.resolve("cleanup");
      await nextTick();
      first.unmount();
      second?.unmount();
      container.remove();
      otherContainer.remove();
    }
  });

  it("updates the public app root descriptor after an async component resolves", async () => {
    const pending = Promise.withResolvers<string>();
    const app = mount(
      cc(async () => el("p", {}, await pending.promise)),
      container,
    );
    try {
      expect(app.root.type).toBe("text");
      pending.resolve("ready");
      await nextTick();
      expect(container.textContent).toBe("ready");
      expect(app.root.type).toBe("element");
      if (app.root.type === "element") {
        expect(app.root.node).toBe(container.querySelector("p") as Element);
      }
    } finally {
      pending.resolve("cleanup");
      await nextTick();
      app.unmount();
      container.remove();
    }
  });
});
