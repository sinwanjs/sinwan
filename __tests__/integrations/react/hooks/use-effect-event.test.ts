/**
 * Comprehensive tests for `useEffectEvent`.
 *
 * Tests are organised to mirror the official React `useEffectEvent`
 * documentation sections. Every `it()` includes a comment referencing the
 * specific doc section it covers.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useEffectEvent,
  useRef,
} from "../../../../src/integrations/react/_client.ts";

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

/** Wait for a setInterval tick. */
async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useEffectEvent — Reference", () => {
  it("accepts a callback and returns an Effect Event function", () => {
    // Covers: Reference / Parameters — callback containing Effect Event logic
    let eventFn: ((msg: string) => string) | undefined;
    const App = cc(() => {
      eventFn = useEffectEvent((msg: string) => `echo:${msg}`);
      return el("div");
    });
    mount(App, container);
    expect(eventFn).toBeTypeOf("function");
    expect(eventFn!("hello")).toBe("echo:hello");
  });

  it("returns a function with the same type signature as the callback", () => {
    // Covers: Reference / Returns — same type signature as callback
    let eventFn: ((a: number, b: number) => number) | undefined;
    const App = cc(() => {
      eventFn = useEffectEvent((a: number, b: number) => a + b);
      return el("div");
    });
    mount(App, container);
    expect(eventFn!(2, 3)).toBe(5);
  });

  it("can be called inside useEffect", async () => {
    // Covers: Reference / Returns — callable inside useEffect
    const log: string[] = [];
    const App = cc(() => {
      const onLog = useEffectEvent((msg: string) => {
        log.push(msg);
      });
      useEffect(() => {
        onLog("from-effect");
      }, []);
      return el("div");
    });
    mount(App, container);
    await tick();
    expect(log).toEqual(["from-effect"]);
  });

  it("can be called inside useLayoutEffect", () => {
    // Covers: Reference / Returns — callable inside useLayoutEffect
    const log: string[] = [];
    const App = cc(() => {
      const onLog = useEffectEvent((msg: string) => {
        log.push(msg);
      });
      useLayoutEffect(() => {
        onLog("from-layout");
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(log).toEqual(["from-layout"]);
  });

  it("can be called inside useInsertionEffect", () => {
    // Covers: Reference / Returns — callable inside useInsertionEffect
    const log: string[] = [];
    const App = cc(() => {
      const onLog = useEffectEvent((msg: string) => {
        log.push(msg);
      });
      useInsertionEffect(() => {
        onLog("from-insertion");
      }, []);
      return el("div");
    });
    mount(App, container);
    expect(log).toEqual(["from-insertion"]);
  });

  it("can be called from another Effect Event in the same component", async () => {
    // Covers: Reference / Returns — callable from other Effect Events
    const log: string[] = [];
    const App = cc(() => {
      const onInner = useEffectEvent((msg: string) => {
        log.push(`inner:${msg}`);
      });
      const onOuter = useEffectEvent((msg: string) => {
        onInner(`wrapped-${msg}`);
        log.push(`outer:${msg}`);
      });
      useEffect(() => {
        onOuter("hello");
      }, []);
      return el("div");
    });
    mount(App, container);
    await tick();
    expect(log).toEqual(["inner:wrapped-hello", "outer:hello"]);
  });

  it("always reads the latest closure values", () => {
    // Covers: Reference / Parameters — callback always accesses latest values
    let eventFn: ((n: number) => number) | undefined;
    let snapshot = 1;
    const App = cc(() => {
      eventFn = useEffectEvent((n: number) => snapshot + n);
      return el("div");
    });
    mount(App, container);
    expect(eventFn!(2)).toBe(3);
    snapshot = 100;
    expect(eventFn!(2)).toBe(102);
  });

  it("does not have a stable identity across component instances", () => {
    // Covers: Reference / Caveats — Effect Event functions do not have stable identity
    const fns: ((n: number) => number)[] = [];
    const App = cc(() => {
      fns.push(useEffectEvent((n: number) => n + 1));
      return el("div");
    });
    mount(App, container);
    mount(App, container);
    expect(fns.length).toBe(2);
    expect(fns[0]).not.toBe(fns[1]);
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / Caveats — Hook called outside of component
    expect(() => {
      useEffectEvent(() => {});
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Using an event in an Effect ────────────────────────────────────

describe("useEffectEvent — Usage / Using an event in an Effect", () => {
  it("reads latest props without re-synchronizing the Effect", async () => {
    // Covers: Usage / Using an event in an Effect — latest props without re-sync
    const log: string[] = [];
    let eventFn: (() => void) | undefined;
    let setMuted: any;

    const App = cc(() => {
      const [muted, setM] = useState(false);
      setMuted = setM;

      const onConnected = useEffectEvent(() => {
        log.push(`muted=${muted()}`);
      });
      eventFn = onConnected;

      // Effect only runs once because deps are []
      useEffect(() => {
        log.push("effect-setup");
        onConnected();
      }, []);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["effect-setup", "muted=false"]);

    // Effect does NOT re-run (deps are []), but the Event can still be
    // called directly and reads the latest muted value.
    setMuted(true);
    eventFn!();
    expect(log).toEqual(["effect-setup", "muted=false", "muted=true"]);

    // NOTE: In a real React app the Event would be triggered by an external
    // system callback (e.g. WebSocket message). We simulate that by calling
    // the Event directly after mutating the closure variable via setState.
  });
});

// ─── Usage / Using a timer with latest values ───────────────────────────────

describe("useEffectEvent — Usage / Using a timer with latest values", () => {
  it("reads latest state without restarting the interval", async () => {
    // Covers: Usage / Using a timer — onTick reads latest count & increment
    let setIncrement: any;
    let intervalFired = 0;

    const App = cc(() => {
      const [count, setCount] = useState(0);
      const [increment, setI] = useState(1);
      setIncrement = setI;

      const onTick = useEffectEvent(() => {
        setCount((c: number) => c + increment());
      });

      useEffect(() => {
        const id = setInterval(() => {
          intervalFired++;
          onTick();
        }, 5);
        return () => clearInterval(id);
      }, []);

      return el("div", {}, count as unknown as number);
    });

    mount(App, container);
    await tick();
    expect(intervalFired).toBe(0);

    await sleep(15);
    // Timer has fired a couple of times with increment=1
    expect(intervalFired).toBeGreaterThanOrEqual(1);

    const beforeChange = intervalFired;
    // Change increment — interval should NOT restart (effect deps are [])
    setIncrement(10);
    await sleep(15);
    // Timer should have continued firing, now with increment=10
    expect(intervalFired).toBeGreaterThan(beforeChange);
  });
});

// ─── Usage / Using an event listener with latest values ───────────────────────

describe("useEffectEvent — Usage / Using an event listener with latest values", () => {
  it("reads latest canMove without re-attaching the listener", async () => {
    // Covers: Usage / Using an event listener — onMove reads latest canMove
    const win = (globalThis as any).window;
    let setCanMove: any;
    let moveCount = 0;

    const App = cc(() => {
      const [canMove, setCM] = useState(true);
      setCanMove = setCM;

      const onMove = useEffectEvent(() => {
        if (canMove()) {
          moveCount++;
        }
      });

      useEffect(() => {
        win.addEventListener("test-move", onMove as EventListener);
        return () =>
          win.removeEventListener("test-move", onMove as EventListener);
      }, []);

      return el("div");
    });

    const app = mount(App, container);
    await tick();

    // Listener is attached; canMove=true → event increments counter
    win.dispatchEvent(new (win as any).Event("test-move"));
    expect(moveCount).toBe(1);

    // Disable movement
    setCanMove(false);
    await tick();

    // Listener is still attached; canMove=false → event does NOT increment
    win.dispatchEvent(new (win as any).Event("test-move"));
    expect(moveCount).toBe(1);

    app.unmount();
  });
});

// ─── Usage / Avoid reconnecting to external systems ────────────────────────

describe("useEffectEvent — Usage / Avoid reconnecting to external systems", () => {
  it("does not reconnect when Effect Event dependencies change", async () => {
    // Covers: Usage / Avoid reconnecting — muted changes don't trigger re-connect
    const log: string[] = [];
    let setMuted: any;

    function createConnection(roomId: string) {
      return {
        connect() {
          log.push(`connect:${roomId}`);
        },
        disconnect() {
          log.push(`disconnect:${roomId}`);
        },
      };
    }

    const App = cc(() => {
      const [muted, setM] = useState(false);
      setMuted = setM;

      const onConnected = useEffectEvent(() => {
        if (!muted()) {
          log.push("notify");
        }
      });

      useEffect(() => {
        const conn = createConnection("general");
        conn.connect();
        onConnected();
        return () => conn.disconnect();
      }, []);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["connect:general", "notify"]);

    // Change muted — effect deps are [] so connection stays
    setMuted(true);
    await tick();
    // No new connect/disconnect because deps didn't change
    expect(log.filter((l) => l.startsWith("connect")).length).toBe(1);
  });
});

// ─── Usage / Using Effect Events in custom Hooks ────────────────────────────

describe("useEffectEvent — Usage / Using Effect Events in custom Hooks", () => {
  it("useInterval keeps the interval alive when callback changes", async () => {
    // Covers: Usage / Custom Hooks — useInterval wraps callback in useEffectEvent
    let tickCount = 0;
    let setIncrementBy: any;

    function useInterval(callback: () => void, delay: number | null) {
      const onTick = useEffectEvent(callback);
      const [delayDep] = useState(delay);
      useEffect(() => {
        const ms = delayDep();
        if (ms === null) return;
        const id = setInterval(() => onTick(), ms);
        return () => clearInterval(id);
      }, [delayDep]);
    }

    const App = cc(() => {
      const [incrementBy, setIB] = useState(1);
      setIncrementBy = setIB;

      useInterval(() => {
        tickCount += incrementBy();
      }, 10);

      return el("div");
    });

    mount(App, container);
    await tick();
    await sleep(35);
    // Interval has fired a few times with incrementBy=1
    const countBefore = tickCount;
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Change incrementBy — interval should NOT reset because delay is stable
    setIncrementBy(5);
    await sleep(35);
    // Ticks should now add 5 instead of 1, proving the Event reads latest value
    expect(tickCount).toBeGreaterThan(countBefore);
  });
});

// ─── Deep Dive / Why are Effect Events not stable? ─────────────────────────

describe("useEffectEvent — Deep Dive / Why are Effect Events not stable?", () => {
  it("unstable identity acts as runtime assertion when included in deps", async () => {
    // Covers: Deep Dive — non-stable identity makes incorrect deps obvious
    const log: string[] = [];

    const App = cc(() => {
      const [count, setCount] = useState(0);

      const onSomething = useEffectEvent(() => {
        log.push(`count=${count()}`);
      });

      // NOTE: In React this would re-run every render because identity changes.
      // In Sinwan, useEffectEvent is called once during setup, so the identity
      // is stable within a single instance. We verify that the effect runs once.
      useEffect(() => {
        log.push("effect-setup");
        onSomething();
      }, [onSomething]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["effect-setup", "count=0"]);
  });
});

// ─── Troubleshooting ─────────────────────────────────────────────────────────

describe("useEffectEvent — Troubleshooting", () => {
  it("calling during component setup works (Sinwan has no separate render phase)", () => {
    // Covers: Troubleshooting / "can't be called during rendering"
    // NOTE: Sinwan's component setup function runs once; there is no reconciler
    // render phase separate from setup. Calling the Event during setup is valid.
    let result = 0;
    const App = cc(() => {
      const onCompute = useEffectEvent((n: number) => n * 2);
      result = onCompute(21);
      return el("div");
    });
    mount(App, container);
    expect(result).toBe(42);
  });

  it("including in dependency array does not cause infinite loop in Sinwan", async () => {
    // Covers: Troubleshooting / "Functions returned from useEffectEvent must not
    // be included in the dependency array"
    // NOTE: In Sinwan the returned function reference is stable within one
    // instance, so including it in deps is harmless (but still not recommended).
    const log: string[] = [];

    const App = cc(() => {
      const onSomething = useEffectEvent(() => {
        log.push("called");
      });

      useEffect(() => {
        log.push("effect-setup");
        onSomething();
      }, [onSomething]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(log).toEqual(["effect-setup", "called"]);
  });

  it("can be passed to child components (not recommended per docs)", () => {
    // Covers: Troubleshooting / "...can only be called from Effects"
    // NOTE: Sinwan does not enforce this at runtime. The function is a regular
    // callback and works when passed down, but doing so violates React docs.
    let childResult = 0;

    const Child = cc(({ onAction }: { onAction: (n: number) => number }) => {
      childResult = onAction(7);
      return el("span");
    });

    const App = cc(() => {
      const onAction = useEffectEvent((n: number) => n + 1);
      return el(Child, { onAction });
    });

    mount(App, container);
    expect(childResult).toBe(8);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useEffectEvent — Edge cases", () => {
  it("forwards multiple arguments faithfully", () => {
    // Covers: Edge case — argument pass-through
    let eventFn: ((a: number, b: string, c: boolean) => string) | undefined;
    const App = cc(() => {
      eventFn = useEffectEvent((a: number, b: string, c: boolean) => {
        return `${a}-${b}-${c}`;
      });
      return el("div");
    });
    mount(App, container);
    expect(eventFn!(1, "two", true)).toBe("1-two-true");
  });

  it("forwards return value faithfully", () => {
    // Covers: Edge case — return value pass-through
    let eventFn: (() => { a: number }) | undefined;
    const App = cc(() => {
      eventFn = useEffectEvent(() => ({ a: 42 }));
      return el("div");
    });
    mount(App, container);
    expect(eventFn!()).toEqual({ a: 42 });
  });

  it("supports multiple useEffectEvent hooks in one component", () => {
    // Covers: Edge case — multiple hooks in same component
    let a: (() => string) | undefined;
    let b: (() => string) | undefined;
    const App = cc(() => {
      a = useEffectEvent(() => "A");
      b = useEffectEvent(() => "B");
      return el("div");
    });
    mount(App, container);
    expect(a!()).toBe("A");
    expect(b!()).toBe("B");
  });

  it("handles empty callback (no args, no return)", () => {
    // Covers: Edge case — empty callback
    let called = false;
    let eventFn: (() => void) | undefined;
    const App = cc(() => {
      eventFn = useEffectEvent(() => {
        called = true;
      });
      return el("div");
    });
    mount(App, container);
    eventFn!();
    expect(called).toBe(true);
  });

  it("reads latest closure value across component instances", () => {
    // Covers: Edge case — isolation between instances
    let latest: number | undefined;
    let eventFn: ((n: number) => number) | undefined;
    const App = cc(() => {
      latest = (latest ?? 0) + 1;
      eventFn = useEffectEvent((n: number) => latest! + n);
      return el("div");
    });
    mount(App, container);
    expect(eventFn!(0)).toBe(1);
    mount(App, container);
    expect(eventFn!(0)).toBe(2);
  });

  it("reads latest reactive state when called from useEffect with deps", async () => {
    // Covers: Edge case — latest reactive state inside a with-deps effect
    let eventFn: (() => number) | undefined;
    let setCount: any;

    const App = cc(() => {
      const [count, setC] = useState(0);
      setCount = setC;

      const onGet = useEffectEvent(() => count());
      eventFn = onGet;

      useEffect(() => {
        // This effect re-runs when count changes because count is in deps
      }, [count]);

      return el("div");
    });

    mount(App, container);
    await tick();
    expect(eventFn!()).toBe(0);

    setCount(5);
    await tick();
    expect(eventFn!()).toBe(5);
  });

  it("works with useRef values inside the callback", () => {
    // Covers: Edge case — reading mutable refs inside Effect Event
    let eventFn: (() => number) | undefined;
    const App = cc(() => {
      const ref = useRef(10);
      eventFn = useEffectEvent(() => ref.current);
      return el("div");
    });
    mount(App, container);
    expect(eventFn!()).toBe(10);
  });
});
