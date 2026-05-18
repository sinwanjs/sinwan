/**
 * Comprehensive tests for `flushSync`.
 *
 * Tests mirror the React documentation sections.
 * NOTE: Sinwan uses a fine-grained scheduler; flushSync drains the
 * pending effect queue so that signal-driven DOM updates are applied
 * synchronously.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { signal } from "../../../../src/reactivity/signal.ts";
import { flushSync } from "../../../../src/integrations/react/flush-sync.ts";
import type { SinwanElement } from "../../../../src/types.ts";

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

/** Wait for the next microtask flush. */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("flushSync — Reference", () => {
  it("accepts a callback and returns its value", () => {
    expect(flushSync(() => 7)).toBe(7);
  });

  it("can be called without a callback", () => {
    expect(flushSync()).toBeUndefined();
  });

  it("throws when called on the server", () => {
    const prevWindow = (globalThis as any).window;
    const prevDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;
      expect(() => flushSync(() => {})).toThrow(
        /flushSync cannot run on the server/,
      );
    } finally {
      (globalThis as any).window = prevWindow;
      (globalThis as any).document = prevDocument;
    }
  });
});

// ─── Usage / Flushing updates synchronously ───────────────────────────────────

describe("flushSync — Usage", () => {
  it("flushes signal-driven DOM updates synchronously", () => {
    const count = signal(0);
    const App = cc(() => el("span", {}, count));
    mount(App, container);
    expect(container.textContent).toBe("0");

    flushSync(() => {
      count.value = 1;
    });

    // DOM should be updated immediately, without waiting for microtask
    expect(container.textContent).toBe("1");
  });

  it("flushes pending effects that were scheduled before the call", () => {
    const count = signal(0);
    const App = cc(() => el("span", {}, count));
    mount(App, container);

    count.value = 42;
    // Effect is queued but not yet run
    expect(container.textContent).toBe("0");

    flushSync(() => {});

    // Effect was flushed synchronously
    expect(container.textContent).toBe("42");
  });

  it("applies multiple signal changes in one flush", () => {
    const a = signal(0);
    const b = signal(0);
    const App = cc(() => el("span", {}, () => `${a.value}:${b.value}`));
    mount(App, container);

    flushSync(() => {
      a.value = 1;
      b.value = 2;
    });

    expect(container.textContent).toBe("1:2");
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────────

describe("flushSync — Caveats", () => {
  it("nested flushSync calls work correctly", () => {
    const count = signal(0);
    const App = cc(() => el("span", {}, count));
    mount(App, container);

    flushSync(() => {
      flushSync(() => {
        count.value = 1;
      });
      // Inner flushSync should have updated the DOM already
      expect(container.textContent).toBe("1");
      count.value = 2;
    });

    expect(container.textContent).toBe("2");
  });

  it("is a no-op when there are no pending updates", () => {
    expect(() => flushSync(() => {})).not.toThrow();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("flushSync — Edge cases", () => {
  it("works when called during component setup (no pending effects yet)", () => {
    const count = signal(0);
    let result: number | undefined;

    const App = cc(() => {
      // During setup there are no pending DOM effects yet,
      // but flushSync should not throw
      result = flushSync(() => 99);
      return el("span", {}, count.value);
    });

    mount(App, container);
    expect(result).toBe(99);
  });

  it("flushes reactive effects scheduled by the callback itself", () => {
    const count = signal(0);
    const App = cc(() => el("span", {}, count));
    mount(App, container);

    flushSync(() => {
      count.value = 5;
      // The DOM effect was scheduled by the signal setter;
      // flushScheduler() at the end of flushSync will run it
    });

    expect(container.textContent).toBe("5");
  });

  it("returns undefined when called without arguments", () => {
    const result = flushSync();
    expect(result).toBeUndefined();
  });

  it("callback may return void", () => {
    let ran = false;
    const result = flushSync(() => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(result).toBeUndefined();
  });
});
