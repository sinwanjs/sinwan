/**
 * Comprehensive tests for `lazy`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { lazy } from "../../../../src/integrations/react/_shared.ts";
import { Suspense } from "../../../../src/integrations/react/_client.ts";
import { REACT_LAZY_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";

let container: HTMLElement;
beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
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

/** Wait for the next microtask flush (effects + promise resolutions). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Create a deferred promise that can be resolved or rejected manually. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("lazy — Reference", () => {
  it("returns a lazy exotic component with $$typeof", () => {
    const Lazy = lazy(async () => ({
      default: ((p: any) => el("span", p)) as any,
    }));
    expect((Lazy as any).$$typeof).toBe(REACT_LAZY_TYPE);
    expect(typeof Lazy).toBe("function");
  });

  it("calls load only once and caches the result", async () => {
    let loadCount = 0;
    const { promise, resolve } = createDeferred<{ default: any }>();

    const Lazy = lazy(() => {
      loadCount++;
      return promise;
    });

    // First call throws the pending promise
    try {
      (Lazy as any)({});
    } catch (e: any) {
      expect(e).toBeInstanceOf(Promise);
    }
    expect(loadCount).toBe(1);

    // Second call still throws the same promise, load is not called again
    try {
      (Lazy as any)({});
    } catch (e: any) {
      expect(e).toBeInstanceOf(Promise);
    }
    expect(loadCount).toBe(1);

    resolve({ default: ((p: any) => el("span", p)) as any });
    await tick();

    // After resolution renders directly
    const result = (Lazy as any)({ v: 42 });
    expect(result).toEqual(el("span", { v: 42 }));
    expect(loadCount).toBe(1);
  });

  it("renders the resolved .default component", async () => {
    const Lazy = lazy(async () => ({
      default: ((p: { text: string }) => el("p", {}, p.text)) as any,
    }));

    let promise: Promise<any>;
    try {
      (Lazy as any)({ text: "hello" });
    } catch (e: any) {
      promise = e;
    }

    await promise!;

    const result = (Lazy as any)({ text: "hello" });
    expect(result).toEqual(el("p", {}, "hello"));
  });
});

// ─── Usage / Lazy-loading components with Suspense ─────────────────────────

describe("lazy — Usage / Lazy-loading with Suspense", () => {
  it("shows fallback while lazy component is loading, then swaps to content", async () => {
    const { promise, resolve } = createDeferred<{ default: any }>();

    const LazyComp = lazy(() => promise);

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("div", { "data-testid": "fallback" }, "Loading…"),
        },
        el(LazyComp as any, { "data-testid": "lazy-content" }),
      ),
    );

    mount(App, container);

    // Fallback should be visible while the lazy component loads
    expect(container.querySelector('[data-testid="fallback"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="lazy-content"]')).toBeNull();

    // Resolve the lazy load
    resolve({
      default: ((p: any) => el("span", p, "loaded")) as any,
    });
    await tick();

    // Content should now be visible and fallback removed
    expect(container.textContent).toContain("loaded");
    expect(container.querySelector('[data-testid="fallback"]')).toBeNull();
  });

  it("loads code on first render and is cached afterwards", async () => {
    let loadCount = 0;
    const { promise, resolve } = createDeferred<{ default: any }>();

    const LazyComp = lazy(() => {
      loadCount++;
      return promise;
    });

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(LazyComp as any, {}),
      ),
    );

    mount(App, container);
    expect(loadCount).toBe(1);

    resolve({
      default: (() => el("div", {}, "content")) as any,
    });
    await tick();

    expect(container.textContent).toContain("content");
    expect(loadCount).toBe(1); // still only once
  });

  it("works with deeply nested lazy components inside Suspense", async () => {
    const { promise, resolve } = createDeferred<{ default: any }>();

    const LazyInner = lazy(() => promise);

    const Wrapper = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "inner-loading"),
        },
        el(LazyInner as any, {}),
      ),
    );

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "outer-loading"),
        },
        el(Wrapper as any, {}),
      ),
    );

    mount(App, container);

    // Inner Suspense should handle its own lazy component
    expect(container.textContent).toContain("inner-loading");
    expect(container.textContent).not.toContain("outer-loading");

    resolve({
      default: (() => el("span", {}, "deep-content")) as any,
    });
    await tick();

    expect(container.textContent).toContain("deep-content");
    expect(container.textContent).not.toContain("loading");
  });
});

// ─── Troubleshooting ────────────────────────────────────────────────────────

describe("lazy — Troubleshooting", () => {
  it("removes fallback when the resolved component throws during render", async () => {
    // NOTE: Sinwan does not have React-style error boundaries.
    // When a lazy-loaded component throws during render, renderComponentToDOM
    // catches the error and renders an empty placeholder. Suspense sees this
    // as a successful render and removes the fallback.
    const { promise, resolve } = createDeferred<{ default: any }>();

    const LazyComp = lazy(() => promise);

    const App = cc(() =>
      el(
        Suspense as any,
        {
          fallback: el("p", {}, "loading"),
        },
        el(LazyComp as any, {}),
      ),
    );

    mount(App, container);
    expect(container.textContent).toContain("loading");

    // Resolve with a component that throws during render
    resolve({
      default: (() => {
        throw new Error("load failed");
      }) as any,
    });
    await tick();

    // Fallback is removed; an empty placeholder is rendered instead
    expect(container.textContent).not.toContain("loading");
  });

  it("throws the load rejection reason on the next render attempt", async () => {
    const { promise, reject } = createDeferred<{ default: any }>();

    const LazyComp = lazy(() => promise);

    // First render throws the pending promise
    let thrown: unknown;
    try {
      (LazyComp as any)({});
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Promise);

    // Reject the load promise
    reject(new Error("module not found"));
    await tick();

    // Next call throws the rejection reason
    expect(() => (LazyComp as any)({})).toThrow("module not found");
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("lazy — Edge cases", () => {
  it("throws the same promise instance on repeated calls while pending", () => {
    const { promise } = createDeferred<{ default: any }>();

    const LazyComp = lazy(() => promise);

    let thrown1: unknown;
    let thrown2: unknown;

    try {
      (LazyComp as any)({});
    } catch (e) {
      thrown1 = e;
    }

    try {
      (LazyComp as any)({});
    } catch (e) {
      thrown2 = e;
    }

    expect(thrown1).toBe(thrown2);
    expect(thrown1).toBeInstanceOf(Promise);
  });

  it("renders the resolved component with correct props", async () => {
    const LazyComp = lazy(async () => ({
      default: ((p: { name: string; count: number }) =>
        el("div", {}, `${p.name}:${p.count}`)) as any,
    }));

    let promise: Promise<any>;
    try {
      (LazyComp as any)({ name: "test", count: 5 });
    } catch (e: any) {
      promise = e;
    }

    await promise!;

    const result = (LazyComp as any)({ name: "test", count: 5 });
    expect(result).toEqual(el("div", {}, "test:5"));
  });

  it("handles lazy component that resolves to a fragment-like return", async () => {
    const LazyComp = lazy(async () => ({
      default: (() => [el("span", {}, "a"), el("span", {}, "b")]) as any,
    }));

    let promise: Promise<any>;
    try {
      (LazyComp as any)({});
    } catch (e: any) {
      promise = e;
    }

    await promise!;

    const result = (LazyComp as any)({});
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});
