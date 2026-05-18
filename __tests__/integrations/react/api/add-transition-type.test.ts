/**
 * Comprehensive tests for `addTransitionType`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  addTransitionType,
  getActiveTransitionTypes,
  startTransition,
  useTransition,
  useState,
} from "../../../../src/integrations/react/_client.ts";
import { clearTransitionTypes } from "../../../../src/integrations/react/add-transition-type.ts";

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
  clearTransitionTypes();
});

const el = (
  tag: string | symbol | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
) => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

/** Wait for the next microtask flush (effects + deferred callbacks). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ────────────────────────────────────────────────────────────

describe("addTransitionType — Reference", () => {
  it("accepts a string type parameter", () => {
    expect(() => addTransitionType("my-type")).not.toThrow();
  });

  it("returns void", () => {
    const result = addTransitionType("void-test");
    expect(result).toBeUndefined();
  });

  it("records the type in active transition types", () => {
    addTransitionType("recorded");
    expect(getActiveTransitionTypes().has("recorded")).toBe(true);
  });
});

// ─── Usage / Adding the cause of a transition ───────────────────────────────

describe("addTransitionType — Usage / Adding the cause of a transition", () => {
  it("associates a type with the active transition inside startTransition", () => {
    startTransition(() => {
      addTransitionType("submit-click");
    });
    expect(getActiveTransitionTypes().has("submit-click")).toBe(true);
  });

  it("associates a type with the active transition inside useTransition", () => {
    let start: any;

    const App = cc(() => {
      [, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    start(() => {
      addTransitionType("navigate");
    });

    expect(getActiveTransitionTypes().has("navigate")).toBe(true);
  });

  it("allows multiple types in a single transition", () => {
    startTransition(() => {
      addTransitionType("type-a");
      addTransitionType("type-b");
    });
    const types = getActiveTransitionTypes();
    expect(types.has("type-a")).toBe(true);
    expect(types.has("type-b")).toBe(true);
    expect(types.size).toBe(2);
  });

  it("collects types from nested startTransition calls", () => {
    startTransition(() => {
      addTransitionType("outer");
      startTransition(() => {
        addTransitionType("inner");
      });
    });
    const types = getActiveTransitionTypes();
    expect(types.has("outer")).toBe(true);
    expect(types.has("inner")).toBe(true);
    expect(types.size).toBe(2);
  });

  it("collects types from deeply nested transitions", () => {
    startTransition(() => {
      addTransitionType("level-1");
      startTransition(() => {
        addTransitionType("level-2");
        startTransition(() => {
          addTransitionType("level-3");
        });
      });
    });
    const types = getActiveTransitionTypes();
    expect(types.has("level-1")).toBe(true);
    expect(types.has("level-2")).toBe(true);
    expect(types.has("level-3")).toBe(true);
    expect(types.size).toBe(3);
  });
});

// ─── Caveats ──────────────────────────────────────────────────────────────

describe("addTransitionType — Caveats", () => {
  it("clears types when a new top-level transition starts", () => {
    startTransition(() => {
      addTransitionType("old");
    });
    expect(getActiveTransitionTypes().has("old")).toBe(true);

    startTransition(() => {
      addTransitionType("new");
    });
    const types = getActiveTransitionTypes();
    expect(types.has("new")).toBe(true);
    expect(types.has("old")).toBe(false);
  });

  it("clears types when a new top-level useTransition starts", () => {
    let start: any;

    const App = cc(() => {
      [, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    start(() => {
      addTransitionType("first");
    });
    expect(getActiveTransitionTypes().has("first")).toBe(true);

    start(() => {
      addTransitionType("second");
    });
    const types = getActiveTransitionTypes();
    expect(types.has("second")).toBe(true);
    expect(types.has("first")).toBe(false);
  });

  it("does not clear types for nested transitions (outer still active)", () => {
    startTransition(() => {
      addTransitionType("outer");
      startTransition(() => {
        addTransitionType("inner");
      });
      // After nested transition, outer types should still be present
      expect(getActiveTransitionTypes().has("outer")).toBe(true);
      expect(getActiveTransitionTypes().has("inner")).toBe(true);
    });
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("addTransitionType — Edge cases", () => {
  it("handles duplicate type names gracefully (set semantics)", () => {
    startTransition(() => {
      addTransitionType("duplicate");
      addTransitionType("duplicate");
      addTransitionType("duplicate");
    });
    expect(getActiveTransitionTypes().size).toBe(1);
    expect(getActiveTransitionTypes().has("duplicate")).toBe(true);
  });

  it("allows empty string as a type", () => {
    startTransition(() => {
      addTransitionType("");
    });
    expect(getActiveTransitionTypes().has("")).toBe(true);
  });

  it("works when called outside a transition (no crash)", () => {
    expect(() => addTransitionType("no-transition")).not.toThrow();
    expect(getActiveTransitionTypes().has("no-transition")).toBe(true);
  });

  it("types added outside a transition are cleared by the next startTransition", () => {
    addTransitionType("orphan");
    expect(getActiveTransitionTypes().has("orphan")).toBe(true);

    startTransition(() => {
      addTransitionType("structured");
    });
    const types = getActiveTransitionTypes();
    expect(types.has("structured")).toBe(true);
    expect(types.has("orphan")).toBe(false);
  });

  it("works with async transitions", async () => {
    let start: any;

    const App = cc(() => {
      [, start] = useTransition();
      return el("div");
    });
    mount(App, container);

    let resolvePromise!: () => void;
    const promise = new Promise<void>((r) => {
      resolvePromise = r;
    });

    start(async () => {
      addTransitionType("async-type");
      await promise;
    });

    expect(getActiveTransitionTypes().has("async-type")).toBe(true);

    resolvePromise();
    await tick();

    // After async resolution, types are still available until next transition
    expect(getActiveTransitionTypes().has("async-type")).toBe(true);
  });

  it("interacts correctly with state updates inside transitions", () => {
    let setCount: any;
    let start: any;

    const App = cc(() => {
      const [, setC] = useState(0);
      [, start] = useTransition();
      setCount = setC;
      return el("div");
    });
    mount(App, container);

    start(() => {
      addTransitionType("state-update");
      setCount(42);
    });

    expect(getActiveTransitionTypes().has("state-update")).toBe(true);
  });

  it("returns a set-like object from getActiveTransitionTypes", () => {
    addTransitionType("set-test");
    const types = getActiveTransitionTypes();
    expect(types instanceof Set).toBe(true);
    expect(types.has("set-test")).toBe(true);
    expect(types.size).toBe(1);
  });
});
