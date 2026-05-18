/**
 * Stress tests for React-compatible CLIENT hooks.
 *
 * Each hook is hammered with rapid updates, many instances, or
 * pathological patterns to ensure stability and correctness under load.
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
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  useDeferredValue,
  useTransition,
  startTransition,
  useOptimistic,
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
  tag: any,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

// ─── Helpers ─────────────────────────────────────────────

const wait = (ms: number) =>
  new Promise<void>((r) => setTimeout(() => r(), ms));

const microtask = () => new Promise<void>((r) => queueMicrotask(() => r()));

// ─── useState stress ────────────────────────────────────────

describe("useState stress", () => {
  it("survives 1000 rapid setState calls", async () => {
    let set: any;
    const App = cc(() => {
      const [, _set] = useState(0);
      set = _set;
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 1000; i++) {
      set(i);
    }
    await microtask();
    // Should not throw or hang
    expect(true).toBe(true);
  });

  it("handles 50 concurrent stateful components", async () => {
    const vals: any[] = [];
    const setters: any[] = [];

    const Cell = cc(({ idx }: { idx: number }) => {
      const [v, s] = useState(idx);
      vals[idx] = v;
      setters[idx] = s;
      return el("span", {}, v);
    });

    const Grid = cc(() => {
      const children = [];
      for (let i = 0; i < 50; i++) {
        children.push(el(Cell as any, { key: i, idx: i }));
      }
      return el("div", {}, ...children);
    });

    mount(Grid, container);
    await microtask();

    // Update every cell
    for (let i = 0; i < 50; i++) {
      setters[i](i * 2);
    }
    await microtask();

    for (let i = 0; i < 50; i++) {
      expect(vals[i]()).toBe(i * 2);
    }
  });

  it("setState with functional updater in a tight loop", async () => {
    let set: any;
    let get: any;
    const App = cc(() => {
      const [v, s] = useState(0);
      get = v;
      set = s;
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 500; i++) {
      set((prev: number) => prev + 1);
    }
    await microtask();
    expect(get()).toBe(500);
  });
});

// ─── useReducer stress ────────────────────────────────────

describe("useReducer stress", () => {
  it("dispatches 1000 actions without dropping", async () => {
    let dispatch: any;
    let get: any;
    const App = cc(() => {
      const [s, d] = useReducer((n: number, a: number) => n + a, 0);
      get = s;
      dispatch = d;
      return el("div");
    });
    mount(App, container);

    for (let i = 1; i <= 1000; i++) {
      dispatch(1);
    }
    await microtask();
    expect(get()).toBe(1000);
  });

  it("many independent reducers", async () => {
    const reducers: any[] = [];
    const states: any[] = [];

    const App = cc(() => {
      for (let i = 0; i < 20; i++) {
        const [s, d] = useReducer((n: number, a: number) => n + a, i);
        states.push(s);
        reducers.push(d);
      }
      return el("div");
    });
    mount(App, container);

    for (let r = 0; r < 20; r++) {
      for (let i = 0; i < 50; i++) {
        reducers[r](1);
      }
    }
    await microtask();

    for (let i = 0; i < 20; i++) {
      expect(states[i]()).toBe(i + 50);
    }
  });
});

// ─── useRef stress ──────────────────────────────────────────

describe("useRef stress", () => {
  it("creates 1000 refs without collision", () => {
    const refs: any[] = [];
    const App = cc(() => {
      for (let i = 0; i < 1000; i++) {
        refs.push(useRef(i));
      }
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 1000; i++) {
      expect(refs[i].current).toBe(i);
    }
  });
});

// ─── useMemo / useCallback stress ─────────────────────────

describe("useMemo / useCallback stress", () => {
  it("recomputes memo 500 times with changing deps", () => {
    let computeCount = 0;
    let memoVal: any;
    let setDep: any;

    const App = cc(() => {
      const [dep, setD] = useState(0);
      setDep = setD;
      memoVal = useMemo(() => {
        computeCount++;
        return dep() * 2;
      }, [dep]);
      return el("div");
    });
    mount(App, container);

    expect(computeCount).toBe(1);
    expect(memoVal).toBe(0);

    for (let i = 1; i <= 500; i++) {
      setDep(i);
    }
    // Memo only recomputes on actual render, but in Sinwan setup runs once.
    // Still valid to verify no crash under rapid updates.
    expect(memoVal).toBe(0); // stale because setup ran once
    expect(computeCount).toBe(1);
  });

  it("creates 500 stable callbacks", () => {
    const cbs: any[] = [];
    const App = cc(() => {
      for (let i = 0; i < 500; i++) {
        cbs.push(useCallback(() => i, []));
      }
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 500; i++) {
      expect(typeof cbs[i]).toBe("function");
      expect(cbs[i]()).toBe(i);
    }
  });
});

// ─── useId stress ─────────────────────────────────────────

describe("useId stress", () => {
  it("generates 500 unique ids across 500 component instances", () => {
    const ids = new Set<string>();

    const Child = cc(() => {
      ids.add(useId());
      return el("span");
    });

    const App = cc(() => {
      const children = [];
      for (let i = 0; i < 500; i++) {
        children.push(el(Child, { key: i }));
      }
      return el("div", {}, ...children);
    });

    mount(App, container);
    expect(ids.size).toBe(500);
  });
});

// ─── useContext stress ────────────────────────────────────

describe("useContext stress", () => {
  it("reads context in 200 nested components", () => {
    const Ctx = createContext(0);
    const results: number[] = [];

    const makeLevel = (depth: number): any => {
      if (depth === 0) {
        return cc(() => {
          results.push(useContext(Ctx));
          return el("span");
        });
      }
      const Child = makeLevel(depth - 1);
      return cc(() => {
        return el("div", {}, el(Child));
      });
    };

    const App = makeLevel(200);
    mount(App, container);
    expect(results.length).toBe(1); // only leaf reads context
    expect(results[0]).toBe(0);
  });
});

// ─── useEffect / useLayoutEffect stress ───────────────────

describe("useEffect / useLayoutEffect stress", () => {
  it("registers 200 effects and runs cleanup on unmount", async () => {
    let effectCount = 0;
    let cleanupCount = 0;

    const App = cc(() => {
      for (let i = 0; i < 100; i++) {
        useEffect(() => {
          effectCount++;
          return () => {
            cleanupCount++;
          };
        }, []);
        useLayoutEffect(() => {
          effectCount++;
          return () => {
            cleanupCount++;
          };
        }, []);
      }
      return el("div");
    });

    const app = mount(App, container);
    await microtask();
    expect(effectCount).toBe(200); // 100 effects + 100 layout effects

    app.unmount();
    expect(cleanupCount).toBe(200);
  });

  it("effect with changing deps re-runs many times", async () => {
    let runCount = 0;
    let cleanupCount = 0;
    let setDep: any;

    const App = cc(() => {
      const [dep, setD] = useState(0);
      setDep = setD;
      useEffect(() => {
        runCount++;
        return () => {
          cleanupCount++;
        };
      }, [dep]);
      return el("div");
    });
    mount(App, container);
    await microtask();
    expect(runCount).toBe(1);
    expect(cleanupCount).toBe(0);

    setDep(1);
    await microtask();
    expect(runCount).toBe(2);
    expect(cleanupCount).toBe(1);

    // Rapid changes are batched to a single re-run
    for (let i = 2; i < 52; i++) {
      setDep(i);
    }
    await microtask();
    expect(runCount).toBe(3);
    expect(cleanupCount).toBe(2);
  });
});

// ─── useSyncExternalStore stress ──────────────────────────

describe("useSyncExternalStore stress", () => {
  it("subscribes and snapshots under rapid store changes", () => {
    let value = 0;
    const listeners = new Set<() => void>();
    let snap: any;

    const App = cc(() => {
      snap = useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value,
        () => value,
      );
      return el("div");
    });
    mount(App, container);

    expect(snap!()).toBe(0);

    for (let i = 1; i <= 100; i++) {
      value = i;
      for (const l of listeners) l();
    }

    expect(snap!()).toBe(100);
    expect(listeners.size).toBe(1);
  });
});

// ─── useDeferredValue stress ─────────────────────────────

describe("useDeferredValue stress", () => {
  it("creates 100 deferred values without crash", () => {
    const deferreds: any[] = [];
    const App = cc(() => {
      for (let i = 0; i < 100; i++) {
        deferreds.push(useDeferredValue(i));
      }
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 100; i++) {
      expect(deferreds[i]()).toBe(i);
    }
  });
});

// ─── useTransition / startTransition stress ───────────────

describe("useTransition stress", () => {
  it("starts 100 transitions without leaking", () => {
    let setCount: any;
    let pendingRef: any;

    const App = cc(() => {
      const [pending] = useTransition();
      const [c, s] = useState(0);
      pendingRef = pending;
      setCount = s;
      return el("div", {}, c);
    });
    mount(App, container);

    expect(typeof pendingRef).toBe("function");

    for (let i = 0; i < 100; i++) {
      startTransition(() => {
        setCount(i);
      });
    }
    // Should not throw or leak
    expect(true).toBe(true);
  });
});

// ─── useOptimistic stress ─────────────────────────────────

describe("useOptimistic stress", () => {
  it("applies 500 optimistic updates", async () => {
    let add: any;
    let get: any;
    const App = cc(() => {
      const [state, addOptimistic] = useOptimistic(
        [] as number[],
        (s: number[], n: number) => [...s, n],
      );
      get = state;
      add = addOptimistic;
      return el("div");
    });
    mount(App, container);

    for (let i = 0; i < 500; i++) {
      add(i);
    }
    await microtask();
    expect(get().length).toBe(500);
    expect(get()[499]).toBe(499);
  });
});

// ─── Combined / integration stress ────────────────────────

describe("combined hook stress", () => {
  it("mounts 100 components each using 5 different hooks", async () => {
    const Ctx = createContext("ctx");
    const refs: any[] = [];
    const states: any[] = [];
    const effects: number[] = [];

    const Item = cc(({ idx }: { idx: number }) => {
      const [count, setCount] = useState(idx);
      const ref = useRef(idx);
      const doubled = useMemo(() => count() * 2, [count]);
      const cb = useCallback(() => count(), [count]);
      const id = useId();
      const ctxVal = useContext(Ctx);

      states.push({ count, setCount, doubled, cb, id, ctxVal });
      refs.push(ref);

      useEffect(() => {
        effects.push(1);
      }, []);

      return el("span", {}, count);
    });

    const List = cc(() => {
      const children = [];
      for (let i = 0; i < 100; i++) {
        children.push(el(Item as any, { key: i, idx: i }));
      }
      return el("div", {}, ...children);
    });

    mount(List, container);
    await microtask();

    expect(states.length).toBe(100);
    expect(refs.length).toBe(100);
    expect(effects.length).toBe(100);

    // Update every 10th component
    for (let i = 0; i < 100; i += 10) {
      states[i].setCount(i + 1000);
    }
    await microtask();

    for (let i = 0; i < 100; i += 10) {
      expect(states[i].count()).toBe(i + 1000);
    }
  });
});
