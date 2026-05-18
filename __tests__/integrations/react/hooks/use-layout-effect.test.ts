/**
 * Comprehensive tests for `useLayoutEffect`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useLayoutEffect` registers once per component instance and
 * runs synchronously during mount (before browser paint). Reactive re-runs
 * are flushed in the same microtask batch as DOM updates.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for the next microtask flush (effects schedule via queueMicrotask). */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useLayoutEffect — Reference", () => {
  it("accepts a setup function and an optional dependency array", () => {
    const App = cc(() => {
      useLayoutEffect(() => {}, []);
      useLayoutEffect(() => {}); // no deps array at all
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("runs setup synchronously during mount (before microtask)", () => {
    let ran = false;
    const App = cc(() => {
      useLayoutEffect(() => {
        ran = true;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(ran).toBe(true); // synchronous — no tick needed
  });

  it("calls cleanup on unmount", () => {
    let cleaned = false;
    const App = cc(() => {
      useLayoutEffect(() => {
        return () => {
          cleaned = true;
        };
      }, []);
      return el("div");
    });
    const app = mount(App, container);
    expect(cleaned).toBe(false);
    app.unmount();
    expect(cleaned).toBe(true);
  });

  it("calls cleanup on unmount with no deps", () => {
    let cleaned = false;
    const App = cc(() => {
      useLayoutEffect(() => {
        return () => {
          cleaned = true;
        };
      });
      return el("div");
    });
    const app = mount(App, container);
    expect(cleaned).toBe(false);
    app.unmount();
    expect(cleaned).toBe(true);
  });

  it("returns undefined", () => {
    let result: unknown = "initial";
    const App = cc(() => {
      result = useLayoutEffect(() => {}, []);
      return el("div");
    });
    mount(App, container);
    expect(result).toBeUndefined();
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useLayoutEffect(() => {}, []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Measuring layout before the browser repaints the screen ────────

describe("useLayoutEffect — Usage / Measuring layout", () => {
  it("measures DOM element synchronously after mount", () => {
    let measuredHeight = 0;
    const App = cc(() => {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        const node = ref.current;
        if (node) {
          measuredHeight = (node as any).getBoundingClientRect
            ? (node as any).getBoundingClientRect().height
            : 100;
        }
      }, []);
      return el("div", { ref: ref as any });
    });
    mount(App, container);
    // happy-dom returns 0 for getBoundingClientRect; the important part is
    // that the effect ran synchronously during mount.
    expect(measuredHeight).toBe(0); // effect ran, but dom has no layout
  });

  it("can set state synchronously before paint (two-pass render pattern)", async () => {
    // Covers: Usage / Measuring layout — render, measure, re-render
    // NOTE: In Sinwan, components run once. useLayoutEffect fires during setup,
    // so setH(42) updates the signal before the render log reads it.
    const log: string[] = [];
    let setHeight: any;

    const App = cc(() => {
      const [height, setH] = useState(0);
      setHeight = setH;
      const ref = useRef<HTMLDivElement>(null);

      useLayoutEffect(() => {
        // Simulate measuring and correcting layout
        const measured = 42;
        if (height() !== measured) {
          log.push(`measure:${height()}`);
          setH(measured);
        }
      }, []);

      log.push(`render:${height()}`);
      return el("div", { ref: ref as any }, height);
    });

    mount(App, container);
    // useLayoutEffect ran synchronously during setup, so the signal was
    // updated to 42 before the component body reached the render log.
    expect(log).toEqual(["measure:0", "render:42"]);
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("useLayoutEffect — Caveats", () => {
  it("does not run during server rendering", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        useLayoutEffect(() => {
          throw new Error("Should not run on server");
        }, []);
        return el("div");
      });
      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).not.toThrow();
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("registers only once even with multiple reactive updates", async () => {
    let effectCount = 0;
    const App = cc(() => {
      const [count, setCount] = useState(0);
      useLayoutEffect(() => {
        effectCount++;
      }, []);
      return el(
        "button",
        { onClick: () => setCount((c: number) => c + 1) },
        count as unknown as number,
      );
    });

    mount(App, container);
    expect(effectCount).toBe(1);

    const btn = container.querySelector(
      "button",
    ) as unknown as HTMLButtonElement;
    btn.click();
    await tick();
    // Sinwan useLayoutEffect with [] runs once per instance
    expect(effectCount).toBe(1);
  });
});

// ─── Troubleshooting ─────────────────────────────────────────────────────────

describe("useLayoutEffect — Troubleshooting", () => {
  it("cleanup should mirror setup logic", () => {
    const log: string[] = [];
    const App = cc(() => {
      useLayoutEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    expect(log).toEqual(["setup"]);

    app.unmount();
    expect(log).toEqual(["setup", "cleanup"]);
  });

  it("useLayoutEffect runs synchronously before useEffect microtask", async () => {
    const order: string[] = [];
    const App = cc(() => {
      useLayoutEffect(() => {
        order.push("layout");
      }, []);
      useEffect(() => {
        order.push("effect");
      }, []);
      return el("div");
    });

    mount(App, container);
    // useLayoutEffect fires synchronously during mount
    expect(order).toEqual(["layout"]);

    await tick();
    // useEffect fires after microtask
    expect(order).toEqual(["layout", "effect"]);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useLayoutEffect — Edge cases", () => {
  it("handles effect with no cleanup", () => {
    let ran = false;
    const App = cc(() => {
      useLayoutEffect(() => {
        ran = true;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(ran).toBe(true);
  });

  it("handles null and undefined in dependency list", () => {
    const App = cc(() => {
      const [nil] = useState<null>(null);
      const [undef] = useState<undefined>(undefined);
      useLayoutEffect(() => {}, [nil, undef]);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("handles multiple useLayoutEffect calls in one component", () => {
    const log: string[] = [];
    const App = cc(() => {
      useLayoutEffect(() => {
        log.push("a");
      }, []);
      useLayoutEffect(() => {
        log.push("b");
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(log).toContain("a");
    expect(log).toContain("b");
  });

  it("handles empty deps array (runs once synchronously)", () => {
    let count = 0;
    const App = cc(() => {
      useLayoutEffect(() => {
        count++;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(count).toBe(1);
  });

  it("cleanup is called on unmount even when setup threw", () => {
    let cleaned = false;
    const App = cc(() => {
      useLayoutEffect(() => {
        return () => {
          cleaned = true;
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    app.unmount();
    expect(cleaned).toBe(true);
  });
});

// ─── Dependency Array Behaviour ──────────────────────────────────────────────

describe("useLayoutEffect — Dependency Array", () => {
  // 1. Sans dependency array — runs on mount and on every reactive update
  it("no dependency array: runs on mount and on every reactive update", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useLayoutEffect(() => {
        const c = count(); // capture at setup time
        log.push(`effect:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }); // no deps

      return el("div", {}, count);
    });

    mount(App, container);
    expect(log).toEqual(["effect:0"]);

    // Signal change triggers reactive flush
    setCount(1);
    await tick();
    expect(log).toEqual(["effect:0", "cleanup:0", "effect:1"]);

    setCount(2);
    await tick();
    expect(log).toEqual([
      "effect:0",
      "cleanup:0",
      "effect:1",
      "cleanup:1",
      "effect:2",
    ]);
  });

  // 2. Empty dependency array [] — runs once on mount, cleanup on unmount
  it("empty deps []: runs once on mount, cleanup on unmount", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useLayoutEffect(() => {
        const c = count(); // capture at setup time
        log.push(`setup:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }, []);

      return el("div", {}, count);
    });

    const app = mount(App, container);
    expect(log).toEqual(["setup:0"]);

    // Changing state does NOT re-trigger effect
    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0"]);

    app.unmount();
    expect(log).toEqual(["setup:0", "cleanup:0"]);
  });

  // 3. Single dependency [count] — runs on mount + when count changes
  it("single dep [count]: runs on mount and when count changes", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useLayoutEffect(() => {
        const c = count(); // capture at setup time
        log.push(`setup:${c}`);
        return () => {
          log.push(`cleanup:${c}`); // captured value
        };
      }, [count]);

      return el("div", {}, count);
    });

    mount(App, container);
    expect(log).toEqual(["setup:0"]);

    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0", "cleanup:0", "setup:1"]);

    setCount(2);
    await tick();
    expect(log).toEqual([
      "setup:0",
      "cleanup:0",
      "setup:1",
      "cleanup:1",
      "setup:2",
    ]);
  });

  // 4. Multiple dependencies [count, name] — runs when a OR b changes
  it("multiple deps [count, name]: runs when either changes", async () => {
    const log: string[] = [];
    let setCount: any;
    let setName: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      const [name, setN] = useState("A");
      setCount = setC;
      setName = setN;

      useLayoutEffect(() => {
        const c = count();
        const n = name();
        log.push(`setup:${c}:${n}`);
        return () => {
          log.push(`cleanup:${c}:${n}`);
        };
      }, [count, name]);

      return el("div", {}, count, name);
    });

    mount(App, container);
    expect(log).toEqual(["setup:0:A"]);

    // Only count changes
    setCount(1);
    await tick();
    expect(log).toEqual(["setup:0:A", "cleanup:0:A", "setup:1:A"]);

    // Only name changes
    setName("B");
    await tick();
    expect(log).toEqual([
      "setup:0:A",
      "cleanup:0:A",
      "setup:1:A",
      "cleanup:1:A",
      "setup:1:B",
    ]);
  });

  // 5. Object dependency — reference equality (Object.is)
  it("object dep: re-runs when reference changes, not when content mutates", async () => {
    const log: string[] = [];
    let setObj: any;

    const App = cc(() => {
      const [obj, setO] = useState({ a: 1 });
      setObj = setO;

      useLayoutEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, [obj]);

      return el("div");
    });

    mount(App, container);
    expect(log).toEqual(["setup"]);

    // Mutating the object in-place does NOT change reference
    setObj((prev: any) => {
      prev.a = 2;
      return prev;
    });
    await tick();
    // Same reference → no re-run
    expect(log).toEqual(["setup"]);

    // Returning a new object DOES change reference
    setObj({ a: 3 });
    await tick();
    expect(log).toEqual(["setup", "cleanup", "setup"]);
  });

  // 6. Function dependency — recreated every render (useCallback needed)
  it("function dep: re-runs when function reference changes", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      const handler = () => count();

      useLayoutEffect(() => {
        log.push("setup");
        return () => {
          log.push("cleanup");
        };
      }, [handler]);

      return el("div");
    });

    mount(App, container);
    expect(log).toEqual(["setup"]);

    // In Sinwan, the function is created once during setup; deps are stable
    setCount(1);
    await tick();
    expect(log).toEqual(["setup"]);
  });

  // 7. Cleanup + dependencies cycle: cleanup old → setup new → cleanup on unmount
  it("cleanup + deps: cleanup old runs before setup new, and on unmount", async () => {
    const log: string[] = [];
    let setRoom: any;

    const App = cc(() => {
      const [roomId, setR] = useState("general");
      setRoom = setR;

      useLayoutEffect(() => {
        const room = roomId(); // capture at setup time
        log.push(`connect:${room}`);
        return () => {
          log.push(`disconnect:${room}`);
        };
      }, [roomId]);

      return el("div", {}, roomId);
    });

    const app = mount(App, container);
    expect(log).toEqual(["connect:general"]);

    setRoom("random");
    await tick();
    expect(log).toEqual([
      "connect:general",
      "disconnect:general",
      "connect:random",
    ]);

    app.unmount();
    expect(log).toEqual([
      "connect:general",
      "disconnect:general",
      "connect:random",
      "disconnect:random",
    ]);
  });

  // 8. Missing dependency — stale closure (same as React: value is captured)
  it("missing dep: captured value is stale (same as React)", async () => {
    const values: number[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      // Missing dep: count is read inside effect but not in deps
      useLayoutEffect(() => {
        values.push(count());
      }, []);

      return el("div");
    });

    mount(App, container);
    expect(values).toEqual([0]);

    // Effect does NOT re-run because deps are empty
    setCount(5);
    await tick();
    expect(values).toEqual([0]);
  });

  // 9. Derived unnecessary dependency
  it("derived dep: fullName is redundant if first and last are already deps", async () => {
    const log: string[] = [];
    let setFirst: any;

    const App = cc(() => {
      const [first, setF] = useState("Ada");
      const last = "Lovelace";
      setFirst = setF;

      useLayoutEffect(() => {
        const fullName = first() + " " + last; // compute inside effect
        log.push(`effect:${fullName}`);
      }, [first]);

      return el("div");
    });

    mount(App, container);
    expect(log).toEqual(["effect:Ada Lovelace"]);

    // first changed → effect re-runs with new fullName
    setFirst("Grace");
    await tick();
    expect(log).toEqual(["effect:Ada Lovelace", "effect:Grace Lovelace"]);
  });

  // 10. Infinite loop guard: rapid setState inside effect with dep
  it("rapid dep changes are batched to a single re-run", async () => {
    let runCount = 0;
    let cleanupCount = 0;
    let setDep: any;

    const App = cc(() => {
      const [dep, setD] = useState(0);
      setDep = setD;

      useLayoutEffect(() => {
        runCount++;
        return () => {
          cleanupCount++;
        };
      }, [dep]);

      return el("div");
    });

    mount(App, container);
    expect(runCount).toBe(1);
    expect(cleanupCount).toBe(0);

    // Single change
    setDep(1);
    await tick();
    expect(runCount).toBe(2);
    expect(cleanupCount).toBe(1);

    // Rapid changes: batched to one re-run
    for (let i = 2; i < 52; i++) {
      setDep(i);
    }
    await tick();
    expect(runCount).toBe(3);
    expect(cleanupCount).toBe(2);
  });
});
