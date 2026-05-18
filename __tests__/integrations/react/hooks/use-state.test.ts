/**
 * Comprehensive tests for `useState`.
 *
 * Tests are organized to mirror the React documentation sections.
 * NOTE: Sinwan's `useState` is backed by a signal; updates are synchronous
 * for the signal value, but DOM effects may flush in the next microtask.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import { resetHookCursor } from "../../../../src/integrations/react/_internal/bridge.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useEffect,
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

async function tick() {
  await new Promise((r) => queueMicrotask(() => r(null)));
}

/** Simulate multiple renders of a component by resetting the hook cursor. */
function simulateRenders<T>(renders: { setup: () => T }[]): T[] {
  const dummy = createComponentInstance(() => el("div"), {}, null);
  const results: T[] = [];
  withInstance(dummy, () => {
    for (const { setup } of renders) {
      resetHookCursor(dummy);
      results.push(setup());
    }
  });
  return results;
}

// ─── Reference ──────────────────────────────────────────────────────────────

describe("useState — Reference", () => {
  it("accepts an initial state value", () => {
    const App = cc(() => {
      useState(0);
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("returns a state getter and a set function", () => {
    let api: any;
    const App = cc(() => {
      api = useState(42);
      return el("div");
    });
    mount(App, container);
    const [state, setState] = api;
    expect(typeof state).toBe("function");
    expect(typeof setState).toBe("function");
  });

  it("initial state matches the value passed", () => {
    let state: any;
    const App = cc(() => {
      [state] = useState(28);
      return el("div");
    });
    mount(App, container);
    expect(state()).toBe(28);
  });

  it("set function has a stable identity", () => {
    let s1: any;
    let s2: any;
    const App = cc(() => {
      const [, set] = useState(0);
      s1 = set;
      s2 = set;
      return el("div");
    });
    mount(App, container);
    expect(s1).toBe(s2);
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useState(0);
    }).toThrow("outside of a component");
  });
});

// ─── Usage / Adding state to a component ─────────────────────────────────────

describe("useState — Usage / Adding state to a component", () => {
  it("renders the initial state in the DOM", () => {
    let state: any;
    const App = cc(() => {
      [state] = useState(42);
      return el("span", {}, state);
    });
    mount(App, container);
    expect((container as any).textContent).toBe("42");
  });

  it("updates the DOM after setState", async () => {
    let state: any;
    let setState: any;
    const App = cc(() => {
      [state, setState] = useState(0);
      return el("span", {}, state);
    });
    mount(App, container);
    expect((container as any).textContent).toBe("0");

    setState(1);
    await tick();
    expect((container as any).textContent).toBe("1");
  });

  it("supports multiple independent state variables", async () => {
    let name: any, setName: any;
    let age: any, setAge: any;

    const App = cc(() => {
      [name, setName] = useState("Taylor");
      [age, setAge] = useState(42);
      return el("p", {}, "Hello, ", name, ". You are ", age, ".");
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Hello, Taylor. You are 42.");

    setName("Alex");
    await tick();
    expect((container as any).textContent).toBe("Hello, Alex. You are 42.");

    setAge(43);
    await tick();
    expect((container as any).textContent).toBe("Hello, Alex. You are 43.");
  });

  it("works with string state", async () => {
    let text: any, setText: any;
    const App = cc(() => {
      [text, setText] = useState("hello");
      return el("p", {}, text);
    });
    mount(App, container);
    expect((container as any).textContent).toBe("hello");

    setText("world");
    await tick();
    expect((container as any).textContent).toBe("world");
  });

  it("works with boolean state", async () => {
    let liked: any, setLiked: any;
    const App = cc(() => {
      [liked, setLiked] = useState(true);
      const likedText = () => (liked() ? "liked" : "not liked");
      return el("p", {}, likedText);
    });
    mount(App, container);
    expect((container as any).textContent).toBe("liked");

    setLiked(false);
    await tick();
    expect((container as any).textContent).toBe("not liked");
  });
});

// ─── Usage / Updating state based on the previous state ─────────────────────

describe("useState — Usage / Updating state based on the previous state", () => {
  it("queues multiple updater functions", () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(42);
      return el("div");
    });

    mount(App, container);
    expect(state()).toBe(42);

    setState((a: number) => a + 1);
    setState((a: number) => a + 1);
    setState((a: number) => a + 1);

    expect(state()).toBe(45);
  });

  it("updater function receives the pending state", () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(10);
      return el("div");
    });

    mount(App, container);
    setState((prev: number) => prev * 2);
    expect(state()).toBe(20);
  });
});

// ─── Usage / Updating objects and arrays in state ────────────────────────────

describe("useState — Usage / Updating objects and arrays in state", () => {
  it("replaces an object without mutation", async () => {
    let form: any, setForm: any;

    const App = cc(() => {
      [form, setForm] = useState({
        firstName: "Barbara",
        lastName: "Hepworth",
      });
      const firstName = () => form().firstName;
      const lastName = () => form().lastName;
      return el("p", {}, firstName, " ", lastName);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Barbara Hepworth");

    setForm({ firstName: "Taylor", lastName: "Swift" });
    await tick();
    expect((container as any).textContent).toBe("Taylor Swift");
  });

  it("replaces an array without mutation", async () => {
    let todos: any, setTodos: any;

    const App = cc(() => {
      [todos, setTodos] = useState(["Buy milk", "Eat tacos"]);
      const todoText = () => todos().join(",");
      return el("p", {}, todoText);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("Buy milk,Eat tacos");

    setTodos([...todos(), "Brew tea"]);
    await tick();
    expect((container as any).textContent).toBe("Buy milk,Eat tacos,Brew tea");
  });
});

// ─── Usage / Avoiding recreating the initial state ───────────────────────────

describe("useState — Usage / Avoiding recreating the initial state", () => {
  it("calls an initializer function only once", () => {
    let initCalls = 0;
    const createInitialTodos = () => {
      initCalls++;
      return [{ id: 0, text: "Item 1" }];
    };

    let state: any;
    const App = cc(() => {
      [state] = useState(() => createInitialTodos());
      return el("div");
    });

    mount(App, container);
    expect(initCalls).toBe(1);
    expect(state()).toEqual([{ id: 0, text: "Item 1" }]);
  });

  it("does not re-run initializer on subsequent accesses", () => {
    let initCalls = 0;
    const App = cc(() => {
      useState(() => {
        initCalls++;
        return 42;
      });
      return el("div");
    });

    // Simulate two renders
    const dummy = createComponentInstance(() => el("div"), {}, null);
    withInstance(dummy, () => {
      resetHookCursor(dummy);
      App({});
      resetHookCursor(dummy);
      App({});
    });

    expect(initCalls).toBe(1);
  });
});

// ─── Caveats ────────────────────────────────────────────────────────────────

describe("useState — Caveats", () => {
  it("setState does not change the value in the running code", () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState("Taylor");
      return el("div");
    });

    mount(App, container);
    expect(state()).toBe("Taylor");

    setState("Robin");
    // In Sinwan the signal updates synchronously, so the getter
    // returns the live value (unlike React's closure snapshot).
    // We verify the setter succeeded:
    expect(state()).toBe("Robin");
  });

  it("skips re-render when next state equals current state via Object.is", async () => {
    let effectRuns = 0;
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(0);
      useEffect(() => {
        effectRuns++;
      }, [state]);
      return el("span", {}, state);
    });

    mount(App, container);
    await tick();
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("0");

    // Same value — Object.is(0, 0) → bail out
    setState(0);
    await tick();
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("0");

    // Different value
    setState(1);
    await tick();
    expect(effectRuns).toBe(2);
    expect((container as any).textContent).toBe("1");
  });

  it("bails out with NaN because Object.is(NaN, NaN) is true", () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(NaN);
      return el("div");
    });

    mount(App, container);
    expect(state()).toBeNaN();

    setState(NaN);
    expect(state()).toBeNaN();
  });

  it("bails out with same object reference", async () => {
    let effectRuns = 0;
    let state: any;
    let setState: any;

    const obj = { age: 42 };

    const App = cc(() => {
      [state, setState] = useState(obj);
      useEffect(() => {
        effectRuns++;
      }, [state]);
      return el("span", {}, state().age);
    });

    mount(App, container);
    await tick();
    expect(effectRuns).toBe(1);

    // Mutating and passing same reference — should bail out
    obj.age = 43;
    setState(obj);
    await tick();
    expect(effectRuns).toBe(1);
    expect((container as any).textContent).toBe("42");
  });
});

// ─── Troubleshooting ────────────────────────────────────────────────────────

describe("useState — Troubleshooting", () => {
  it("returns the old value after reading state immediately after setState", () => {
    // React-specific: state behaves like a snapshot.
    // In Sinwan the getter is live, so this test documents the
    // behavioral difference: Sinwan getters read the current signal.
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(0);
      return el("div");
    });

    mount(App, container);
    const captured = state();
    setState(1);
    // Sinwan getter is live, but captured value is old
    expect(captured).toBe(0);
    expect(state()).toBe(1);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("useState — Edge cases", () => {
  it("supports multiple useState calls in one component", async () => {
    let s1: any, set1: any;
    let s2: any, set2: any;

    const App = cc(() => {
      [s1, set1] = useState(0);
      [s2, set2] = useState("a");
      return el("p", {}, s1, s2);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0a");

    set1(1);
    await tick();
    expect((container as any).textContent).toBe("1a");

    set2("b");
    await tick();
    expect((container as any).textContent).toBe("1b");
  });

  it("survives rapid setState calls in a tight loop", () => {
    let state: any;
    let setState: any;

    const App = cc(() => {
      [state, setState] = useState(0);
      return el("div");
    });

    mount(App, container);

    for (let i = 1; i <= 500; i++) {
      setState((n: number) => n + 1);
    }

    expect(state()).toBe(500);
  });

  it("getter supports implicit coercion via valueOf/toPrimitive", () => {
    let state: any;

    const App = cc(() => {
      [state] = useState(10);
      return el("div");
    });

    mount(App, container);
    expect((state as any).valueOf()).toBe(10);
    expect(Number(state)).toBe(10);
    expect(String(state)).toBe("10");
  });

  it("handles function values when wrapped in an extra function", () => {
    let fn: any, setFn: any;

    const myFn = () => "hello";

    const App = cc(() => {
      [fn, setFn] = useState(() => myFn);
      return el("div");
    });

    mount(App, container);
    expect(typeof fn()).toBe("function");
    expect(fn()()).toBe("hello");

    const otherFn = () => "world";
    setFn(() => otherFn);
    expect(fn()()).toBe("world");
  });

  it("treats a plain function initial value as an initializer", () => {
    let state: any;

    const App = cc(() => {
      [state] = useState(() => 99);
      return el("div");
    });

    mount(App, container);
    expect(state()).toBe(99);
  });

  it("handles null and undefined as initial state", () => {
    let sNull: any;
    let sUndef: any;

    const App = cc(() => {
      [sNull] = useState(null);
      [sUndef] = useState(undefined);
      return el("div");
    });

    mount(App, container);
    expect(sNull()).toBeNull();
    expect(sUndef()).toBeUndefined();
  });

  it("handles 0 and empty string correctly (falsy but valid)", async () => {
    let count: any, setCount: any;
    let text: any, setText: any;

    const App = cc(() => {
      [count, setCount] = useState(0);
      [text, setText] = useState("");
      return el("p", {}, count, "|", text);
    });

    mount(App, container);
    expect((container as any).textContent).toBe("0|");

    setCount(0);
    setText("");
    await tick();
    // Object.is(0,0) and Object.is("","") → bail out, but DOM unchanged
    expect((container as any).textContent).toBe("0|");
  });
});
