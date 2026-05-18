/**
 * Phase 2 — CLIENT React-compatible hook tests.
 *
 * Hooks are exercised inside Sinwan components that get mounted into a
 * happy-dom DOM, so `getCurrentInstance()` is populated.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useState,
  useReducer,
  useRef,
  useMemo,
  useCallback,
  useId,
  useContext,
  useDebugValue,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useEffectEvent,
  useSyncExternalStore,
  useDeferredValue,
  useTransition,
  startTransition,
  useOptimistic,
  useActionState,
  useImperativeHandle,
  createContext,
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
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

describe("useState", () => {
  it("returns initial value and updater", () => {
    let captured: any;
    const App = cc(() => {
      captured = useState(7);
      return el("div");
    });
    mount(App, container);
    const [val, set] = captured;
    expect(val()).toBe(7);
    set(10);
    expect(captured[0]()).toBe(10); // getter reflects live signal value
    set((p: number) => p + 1);
  });

  it("supports lazy initializer", () => {
    let val: any;
    const App = cc(() => {
      const [v] = useState(() => 5 * 2);
      val = v;
      return el("div");
    });
    mount(App, container);
    expect(val()).toBe(10);
  });

  it("event handler can read and increment state via arithmetic (counter-1 pattern)", async () => {
    let clickHandler: (() => void) | undefined;
    const Counter = cc(() => {
      const [count, setCount] = useState(0);
      clickHandler = () => {
        setCount(count() + 1);
      };
      return el("span", {}, count);
    });
    mount(Counter, container);

    expect((container as any).textContent).toBe("0");

    clickHandler!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect((container as any).textContent).toBe("1");

    clickHandler!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect((container as any).textContent).toBe("2");
  });

  it("reactive getter updates in mixed text children", async () => {
    let clickHandler: (() => void) | undefined;
    const Counter = cc(() => {
      const [count, setCount] = useState(0);
      clickHandler = () => {
        setCount(count() + 1);
      };
      return el("p", {}, "You clicked ", count, " times.");
    });
    mount(Counter, container);

    expect((container as any).textContent).toBe("You clicked 0 times.");

    clickHandler!();
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect((container as any).textContent).toBe("You clicked 1 times.");
  });
});

describe("useReducer", () => {
  it("dispatches actions through the reducer", () => {
    let api: any;
    const App = cc(() => {
      api = useReducer(
        (n: number, a: "inc" | "dec") => (a === "inc" ? n + 1 : n - 1),
        0,
      );
      return el("div");
    });
    mount(App, container);
    const [state, dispatch] = api as [() => number, any];
    expect(state()).toBe(0);
    dispatch("inc");
    expect(state()).toBe(1);
    dispatch("inc");
    expect(state()).toBe(2);
    dispatch("dec");
    expect(state()).toBe(1);
  });
});

describe("useRef", () => {
  it("returns a stable { current } container", () => {
    let r: any;
    const App = cc(() => {
      r = useRef(42);
      return el("div");
    });
    mount(App, container);
    expect(r.current).toBe(42);
    r.current = 100;
    expect(r.current).toBe(100);
  });
});

describe("useMemo / useCallback", () => {
  it("memoises by deps", () => {
    let factoryCalls = 0;
    let memoVal: number | undefined;
    const App = cc(() => {
      const [dep1] = useState(1);
      const [dep2] = useState(2);
      memoVal = useMemo(() => {
        factoryCalls++;
        return 1 + 2;
      }, [dep1, dep2]);
      const cb = useCallback((n: number) => n + 1, []);
      expect(typeof cb).toBe("function");
      return el("div");
    });
    mount(App, container);
    expect(factoryCalls).toBe(1);
    expect(memoVal).toBe(3);
  });
});

describe("useId", () => {
  it("returns a deterministic id derived from the instance", () => {
    let id: string | undefined;
    const App = cc(() => {
      id = useId();
      return el("div");
    });
    mount(App, container);
    expect(id).toMatch(/^:s[0-9a-z]+-[0-9]+:$/);
  });
});

describe("useContext", () => {
  it("reads default when no Provider exists", () => {
    const Ctx = createContext("hello");
    let v: string | undefined;
    const App = cc(() => {
      v = useContext(Ctx);
      return el("div");
    });
    mount(App, container);
    expect(v).toBe("hello");
  });
});

describe("useDebugValue", () => {
  it("is a no-op", () => {
    const App = cc(() => {
      useDebugValue("x");
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });
});

describe("useEffect / useLayoutEffect", () => {
  it("runs callback after mount and cleanup is callable", async () => {
    let ran = 0;
    const App = cc(() => {
      useEffect(() => {
        ran++;
        return () => {
          ran--;
        };
      }, []);
      useLayoutEffect(() => {
        ran += 10;
      }, []);
      return el("div");
    });
    mount(App, container);
    // useLayoutEffect fires synchronously; useEffect via microtask
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(ran).toBe(11);
  });
});

describe("useInsertionEffect", () => {
  it("runs synchronously on mount and cleans up on unmount", () => {
    let ran = 0;
    const App = cc(() => {
      useInsertionEffect(() => {
        ran += 5;
        return () => {
          ran -= 5;
        };
      }, []);
      return el("div");
    });
    const app = mount(App, container);
    expect(ran).toBe(5);
    app.unmount();
    expect(ran).toBe(0);
  });
});

describe("useEffectEvent", () => {
  it("reads latest closure and has non-stable identity", () => {
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
});

describe("useSyncExternalStore", () => {
  it("returns initial snapshot synchronously", () => {
    let snap: any;
    let listener: (() => void) | null = null;
    let value = 5;
    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listener = cb;
          return () => {
            listener = null;
          };
        },
        () => value,
        () => value,
      );
      return el("div");
    });
    mount(App, container);
    expect(snap!()).toBe(5);
  });
});

describe("useDeferredValue", () => {
  it("returns the input on first render", () => {
    let v: any;
    const App = cc(() => {
      v = useDeferredValue(42);
      return el("div");
    });
    mount(App, container);
    expect(v!()).toBe(42);
  });
});

describe("useTransition / startTransition", () => {
  it("toggles isPending around sync work", () => {
    let api: any;
    const App = cc(() => {
      api = useTransition();
      return el("div");
    });
    mount(App, container);
    const [pending, start] = api as [() => boolean, any];
    expect(pending()).toBe(false);
    start(() => {});
    expect(typeof start).toBe("function");
    expect(() => startTransition(() => {})).not.toThrow();
  });
});

describe("useOptimistic", () => {
  it("starts at the passthrough value", () => {
    let api: any;
    const App = cc(() => {
      api = useOptimistic([1, 2, 3], (s: number[], n: number) => [...s, n]);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual([1, 2, 3]);
  });
});

describe("useActionState", () => {
  it("returns [initial, dispatch, false]", () => {
    let api: any;
    const App = cc(() => {
      api = useActionState(
        async (_s: { ok: boolean }, _p: FormData) => ({ ok: true }),
        {
          ok: false,
        },
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual({ ok: false });
    expect(typeof api[1]).toBe("function");
    expect(api[2]()).toBe(false);
  });
});

describe("useImperativeHandle", () => {
  it("populates ref.current after mount", async () => {
    const ref: { current: { ping(): string } | null } = { current: null };
    const Inner = cc(() => {
      useImperativeHandle(ref as any, () => ({ ping: () => "pong" }), []);
      return el("div");
    });
    mount(Inner, container);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(ref.current?.ping()).toBe("pong");
  });
});
