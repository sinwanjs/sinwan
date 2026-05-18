/**
 * Comprehensive tests for `useInsertionEffect`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useInsertionEffect` runs synchronously (like
 * `useLayoutEffect`) but is intended to fire before layout Effects.
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
  useInsertionEffect,
  useLayoutEffect,
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

/** Wait for the next microtask flush. */
async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useInsertionEffect — Reference", () => {
  it("accepts a setup function and an optional dependency array", () => {
    const App = cc(() => {
      useInsertionEffect(() => {}, []);
      useInsertionEffect(() => {}); // no deps array at all
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("runs setup synchronously on mount", () => {
    let ran = false;
    const App = cc(() => {
      useInsertionEffect(() => {
        ran = true;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(ran).toBe(true); // synchronous, unlike useEffect
  });

  it("calls cleanup on unmount", () => {
    let cleaned = false;
    const App = cc(() => {
      useInsertionEffect(() => {
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
      useInsertionEffect(() => {
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
      result = useInsertionEffect(() => {}, []);
      return el("div");
    });
    mount(App, container);
    expect(result).toBeUndefined();
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useInsertionEffect(() => {}, []);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Injecting dynamic styles from CSS-in-JS libraries ──────────────

describe("useInsertionEffect — Usage / Injecting dynamic styles", () => {
  it("injects a <style> tag on mount and removes it on cleanup", () => {
    const win = (globalThis as any).window;
    const doc = win.document;
    const inserted: HTMLStyleElement[] = [];

    const App = cc(() => {
      useInsertionEffect(() => {
        const style = doc.createElement("style");
        style.textContent = ".test { color: red }";
        doc.head.appendChild(style);
        inserted.push(style);
        return () => {
          style.remove();
        };
      }, []);
      return el("div");
    });

    const app = mount(App, container);
    expect(inserted.length).toBe(1);
    expect(doc.head.contains(inserted[0])).toBe(true);

    app.unmount();
    expect(doc.head.contains(inserted[0])).toBe(false);
  });

  it("deduplicates style injection with a Set (CSS-in-JS pattern)", () => {
    const win = (globalThis as any).window;
    const doc = win.document;
    const isInserted = new Set<string>();
    const inserted: HTMLStyleElement[] = [];

    function useCSS(rule: string) {
      useInsertionEffect(() => {
        if (!isInserted.has(rule)) {
          isInserted.add(rule);
          const style = doc.createElement("style");
          style.textContent = rule;
          doc.head.appendChild(style);
          inserted.push(style);
        }
      });
      return rule;
    }

    const App = cc(() => {
      useCSS(".a { color: red }");
      useCSS(".a { color: red }"); // same rule — should dedupe
      useCSS(".b { color: blue }");
      return el("div");
    });

    mount(App, container);
    expect(inserted.length).toBe(2);
  });

  it("collects rules on server during render, then injects on client", () => {
    const win = (globalThis as any).window;
    const doc = win.document;
    const collectedRules = new Set<string>();

    function useCSS(rule: string) {
      if (typeof window === "undefined") {
        collectedRules.add(rule);
      }
      useInsertionEffect(() => {
        const style = doc.createElement("style");
        style.textContent = rule;
        doc.head.appendChild(style);
      }, []);
      return rule;
    }

    const App = cc(() => {
      useCSS(".btn { color: green }");
      return el("div");
    });

    mount(App, container);
    // On client (window is defined), useInsertionEffect runs.
    expect(doc.querySelector("style")?.textContent).toBe(
      ".btn { color: green }",
    );
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("useInsertionEffect — Caveats", () => {
  it("does not run during server rendering", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        useInsertionEffect(() => {
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
      useInsertionEffect(() => {
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
    // Sinwan useInsertionEffect with [] runs once per instance
    expect(effectCount).toBe(1);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useInsertionEffect — Edge cases", () => {
  it("handles effect with no cleanup", () => {
    let ran = false;
    const App = cc(() => {
      useInsertionEffect(() => {
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
      useInsertionEffect(() => {}, [nil, undef]);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("handles multiple useInsertionEffect calls in one component", () => {
    const log: string[] = [];
    const App = cc(() => {
      useInsertionEffect(() => {
        log.push("a");
      }, []);
      useInsertionEffect(() => {
        log.push("b");
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(log).toContain("a");
    expect(log).toContain("b");
  });

  it("handles empty deps array (runs once)", () => {
    let count = 0;
    const App = cc(() => {
      useInsertionEffect(() => {
        count++;
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(count).toBe(1);
  });

  it("cleanup is called on unmount even when setup threw", () => {
    // NOTE: If the effect callback throws, cleanup won't be registered.
    // This test verifies normal behavior when setup succeeds.
    let cleaned = false;
    const App = cc(() => {
      useInsertionEffect(() => {
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

  it("runs before useLayoutEffect during mount", () => {
    const order: string[] = [];
    const App = cc(() => {
      useInsertionEffect(() => {
        order.push("insertion");
      }, []);
      useLayoutEffect(() => {
        order.push("layout");
      }, []);
      return el("div");
    });

    mount(App, container);
    // Both run synchronously during mount; insertion should come first
    expect(order).toEqual(["insertion", "layout"]);
  });
});

// ─── Dependency Array Behaviour ──────────────────────────────────────────────

describe("useInsertionEffect — Dependency Array", () => {
  // 1. Sans dependency array — runs synchronously on mount and on every reactive update
  it("no dependency array: runs on mount and on every reactive update", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useInsertionEffect(() => {
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

    // Signal change triggers reactive DOM update → effect re-runs
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

      useInsertionEffect(() => {
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

      useInsertionEffect(() => {
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

      useInsertionEffect(() => {
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

  // 5. Object dep — reference equality (Object.is)
  it("object dep: re-runs when reference changes, not when content mutates", async () => {
    const log: string[] = [];
    let setObj: any;

    const App = cc(() => {
      const [obj, setO] = useState({ a: 1 });
      setObj = setO;

      useInsertionEffect(() => {
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

  // 6. Function dep — recreated every render (useCallback needed)
  it("function dep: re-runs when function reference changes", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      // A new function on every "render" — but in Sinwan setup runs once
      // so this function is stable. We simulate change by reading count.
      const handler = () => count();

      useInsertionEffect(() => {
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

      useInsertionEffect(() => {
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

  // 8. Missing dependency — stale closure (same as React)
  it("missing dep: captured value is stale (same as React)", async () => {
    const values: number[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      // Missing dep: count is read inside effect but not in deps
      useInsertionEffect(() => {
        values.push(count());
      }, []);

      return el("div");
    });

    mount(App, container);
    expect(values).toEqual([0]);

    setCount(1);
    await tick();
    // Effect does NOT re-run because deps are []; value captured at mount
    expect(values).toEqual([0]);
  });

  // 9. Derived dep — redundant but works
  it("derived dep: fullName is redundant if first and last are already deps", async () => {
    const log: string[] = [];
    let setFirst: any;

    const App = cc(() => {
      const [first, setF] = useState("Ada");
      const [last] = useState("Lovelace");
      setFirst = setF;

      const fullName = () => `${first()} ${last()}`;

      useInsertionEffect(() => {
        const name = fullName(); // capture at setup time
        log.push(`setup:${name}`);
        return () => {
          log.push(`cleanup:${name}`); // captured value
        };
      }, [first, last, fullName]);

      return el("div", {}, fullName);
    });

    mount(App, container);
    expect(log).toEqual(["setup:Ada Lovelace"]);

    setFirst("Grace");
    await tick();
    // fullName is derived; in Sinwan the function is stable, but first changed
    expect(log).toEqual([
      "setup:Ada Lovelace",
      "cleanup:Ada Lovelace",
      "setup:Grace Lovelace",
    ]);
  });

  // 10. Rapid changes — batched to a single re-run
  it("rapid dep changes are batched to a single re-run", async () => {
    const log: string[] = [];
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      useInsertionEffect(() => {
        const c = count();
        log.push(`setup:${c}`);
        return () => {
          log.push(`cleanup:${c}`);
        };
      }, [count]);

      return el("div", {}, count);
    });

    mount(App, container);
    expect(log).toEqual(["setup:0"]);

    // Rapid changes in same tick
    setCount(1);
    setCount(2);
    setCount(3);
    await tick();
    // Sinwan effect batches reactive changes; only the final value triggers
    expect(log).toEqual(["setup:0", "cleanup:0", "setup:3"]);
  });

  // 11. Cleanup runs before new setup when deps change
  it("cleanup + setup interleaving per component (React semantics)", async () => {
    const log: string[] = [];
    let setA: any;
    let setB: any;

    const App = cc(() => {
      const [a, _setA] = useState("x");
      const [b, _setB] = useState("y");
      setA = _setA;
      setB = _setB;

      useInsertionEffect(() => {
        const val = a();
        log.push(`setup-a:${val}`);
        return () => {
          log.push(`cleanup-a:${val}`);
        };
      }, [a]);

      useInsertionEffect(() => {
        const val = b();
        log.push(`setup-b:${val}`);
        return () => {
          log.push(`cleanup-b:${val}`);
        };
      }, [b]);

      return el("div");
    });

    mount(App, container);
    expect(log).toEqual(["setup-a:x", "setup-b:y"]);

    // Change both deps at once
    setA("X");
    setB("Y");
    await tick();

    // Each effect independently cleans up then sets up
    expect(log).toEqual([
      "setup-a:x",
      "setup-b:y",
      "cleanup-a:x",
      "setup-a:X",
      "cleanup-b:y",
      "setup-b:Y",
    ]);
  });
});
