/**
 * Comprehensive tests for `useActionState`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

globalThis.__DEV__ = true;

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  useActionState,
  startTransition,
  useOptimistic,
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

// ─── Reference: useActionState(reducerAction, initialState, permalink?) ───

describe("useActionState — Reference", () => {
  it("returns [state, dispatchAction, isPending] with initialState on first render", () => {
    // Covers: Reference / Returns — initial state matches initialState
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, _p: unknown) => prev + 1, 0);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBe(0);
    expect(typeof api[1]).toBe("function");
    expect(api[2]()).toBe(false);
  });

  it("ignores initialState after dispatchAction is invoked for the first time", async () => {
    // Covers: Reference / Parameters / initialState — ignored after first dispatch
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, p: number) => prev + p, 10);
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBe(10);

    startTransition(() => {
      api[1](5);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(15);
  });

  it("accepts optional permalink parameter", () => {
    // Covers: Reference / Parameters / permalink
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, _p: unknown) => prev, 0, "/cart");
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toBe(0);
    expect(api[2]()).toBe(false);
  });

  it("state matches the value returned by reducerAction after dispatch", async () => {
    // Covers: Reference / Returns — state matches reducerAction return value
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: string, p: string) => prev + p, "a");
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1]("b");
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe("ab");
  });

  it("isPending is true while an async action is pending", async () => {
    // Covers: Reference / Returns — isPending reflects awaiting status
    let api: any;
    let resolveAction: ((value: number) => void) | undefined;
    const App = cc(() => {
      api = useActionState(async (prev: number, _p: unknown) => {
        return new Promise<number>((res) => {
          resolveAction = res;
        });
      }, 0);
      return el("div");
    });
    mount(App, container);
    expect(api[2]()).toBe(false);

    startTransition(() => {
      api[1](null);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[2]()).toBe(true);

    resolveAction!(42);
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[2]()).toBe(false);
    expect(api[0]()).toBe(42);
  });

  it("dispatchAction has stable identity across renders", () => {
    // Covers: Reference / Caveats — dispatchAction has a stable identity
    // NOTE: In Sinwan setup runs once per instance, so identity is naturally stable.
    const dispatchers: any[] = [];
    const App = cc(() => {
      const [, dispatch] = useActionState(
        (prev: number, _p: unknown) => prev,
        0,
      );
      dispatchers.push(dispatch);
      return el("div");
    });
    mount(App, container);
    expect(dispatchers.length).toBe(1);
    expect(typeof dispatchers[0]).toBe("function");
  });
});

// ─── reducerAction function ───────────────────────────────────────────────

describe("useActionState — reducerAction function", () => {
  it("receives previousState as first argument (initially initialState)", async () => {
    // Covers: reducerAction / Parameters / previousState
    const receivedStates: number[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, p: number) => {
        receivedStates.push(prev);
        return prev + p;
      }, 100);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](10);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(receivedStates[0]).toBe(100);
    expect(api[0]()).toBe(110);

    startTransition(() => {
      api[1](5);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(receivedStates[1]).toBe(110);
    expect(api[0]()).toBe(115);
  });

  it("receives actionPayload as second argument", async () => {
    // Covers: reducerAction / Parameters / actionPayload
    const receivedPayloads: unknown[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, p: unknown) => {
        receivedPayloads.push(p);
        return prev;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1]({ type: "ADD", value: 5 });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(receivedPayloads[0]).toEqual({ type: "ADD", value: 5 });
  });

  it("can be synchronous", async () => {
    // Covers: reducerAction / Caveats — reducerAction can be sync
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, p: number) => prev + p, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](3);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(3);
    expect(api[2]()).toBe(false);
  });

  it("can be asynchronous and perform side effects", async () => {
    // Covers: reducerAction / Caveats — reducerAction can be async
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        return prev + p;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](7);
    });
    expect(api[2]()).toBe(true);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(7);
    expect(api[2]()).toBe(false);
  });

  it("return type matches initialState type", () => {
    // Covers: reducerAction / Caveats — return type must match initialState type
    // NOTE: This is primarily a TypeScript compile-time check.
    // We verify at runtime that a complex state shape works correctly.
    interface State {
      count: number;
      error: string | null;
    }
    let api: any;
    const App = cc(() => {
      api = useActionState(
        (prev: State, p: number): State => ({
          count: prev.count + p,
          error: null,
        }),
        { count: 0, error: null },
      );
      return el("div");
    });
    mount(App, container);
    expect(api[0]()).toEqual({ count: 0, error: null });
  });

  it("queues and executes multiple calls sequentially", async () => {
    // Covers: Reference / Caveats — React queues multiple calls sequentially
    const callOrder: number[] = [];
    const resolveQueue: ((value: number) => void)[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        callOrder.push(p);
        const idx = callOrder.length - 1;
        return new Promise<number>((res) => {
          resolveQueue[idx] = res;
        });
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](1);
      api[1](2);
      api[1](3);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));

    // All three are queued, only the first is running
    expect(api[2]()).toBe(true);
    expect(callOrder).toEqual([1]);

    resolveQueue[0](10);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(callOrder).toEqual([1, 2]);

    resolveQueue[1](20);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(callOrder).toEqual([1, 2, 3]);

    resolveQueue[2](30);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(30);
    expect(api[2]()).toBe(false);
  });

  it("each queued call receives the result of the previous call", async () => {
    // Covers: Reference / Caveats — each call receives result of previous
    const receivedStates: number[] = [];
    const resolveQueue: ((value: number) => void)[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        receivedStates.push(prev);
        const idx = receivedStates.length - 1;
        return new Promise<number>((res) => {
          resolveQueue[idx] = res;
        });
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](1);
      api[1](2);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));

    resolveQueue[0](100);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    // Second action should have started with prev=100
    expect(receivedStates[1]).toBe(100);

    resolveQueue[1](200);
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(200);
  });
});

// ─── Usage ────────────────────────────────────────────────────────────────

describe("useActionState — Usage / Adding state to an Action", () => {
  it("basic async increment example", async () => {
    // Covers: Usage / Adding state to an Action
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, _p: unknown) => {
        await new Promise((res) => setTimeout(res, 10));
        return prev + 1;
      }, 0);
      return el("span", {}, api[0]);
    });
    mount(App, container);

    startTransition(() => {
      api[1](null);
    });
    expect(api[2]()).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    expect(api[0]()).toBe(1);
    expect(api[2]()).toBe(false);
    expect((container as any).textContent).toBe("1");
  });
});

describe("useActionState — Usage / Using multiple action types", () => {
  it("handles multiple action types via payload object", async () => {
    // Covers: Usage / Using multiple action types
    type Action = { type: "ADD" } | { type: "REMOVE" };
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, action: Action) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        switch (action.type) {
          case "ADD":
            return prev + 1;
          case "REMOVE":
            return Math.max(0, prev - 1);
        }
        return prev;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1]({ type: "ADD" });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(1);

    startTransition(() => {
      api[1]({ type: "ADD" });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(2);

    startTransition(() => {
      api[1]({ type: "REMOVE" });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(1);
  });
});

describe("useActionState — Usage / Using with useOptimistic", () => {
  it("combines with useOptimistic for immediate UI feedback", async () => {
    // Covers: Usage / Using with useOptimistic
    // NOTE: In React, useOptimistic auto-resets when the passthrough changes.
    // In Sinwan, setup runs once and components don't re-run, so the reset
    // is not automatic. We test that optimistic updates apply immediately.
    let api: any;
    let optimisticApi: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, action: { type: string }) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        return action.type === "ADD" ? prev + 1 : Math.max(0, prev - 1);
      }, 0);
      optimisticApi = useOptimistic(
        api[0](),
        (current: number, action: { type: string }) => {
          return action.type === "ADD" ? current + 1 : Math.max(0, current - 1);
        },
      );
      return el("div");
    });
    mount(App, container);

    // Before any dispatch, optimistic should match real state
    expect(optimisticApi[0]()).toBe(0);

    startTransition(() => {
      optimisticApi[1]({ type: "ADD" });
      api[1]({ type: "ADD" });
    });
    // Optimistic updates immediately
    expect(optimisticApi[0]()).toBe(1);

    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    // After action settles, real state is updated
    expect(api[0]()).toBe(1);
  });
});

describe("useActionState — Usage / Using with Action props", () => {
  it("can pass dispatchAction to an Action prop without manual startTransition", async () => {
    // Covers: Usage / Using with Action props
    let parentApi: any;
    let childAction: ((payload: { type: string }) => void) | undefined;
    const Child = cc((props: { action: (p: { type: string }) => void }) => {
      childAction = props.action;
      return el("div");
    });
    const Parent = cc(() => {
      parentApi = useActionState(async (prev: number, p: { type: string }) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        return p.type === "ADD" ? prev + 1 : prev;
      }, 0);
      return el("div", {}, Child({ action: parentApi[1] }));
    });
    mount(Parent, container);

    expect(typeof childAction).toBe("function");
    startTransition(() => {
      childAction!({ type: "ADD" });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(parentApi[0]()).toBe(1);
  });
});

describe("useActionState — Usage / Cancelling queued actions", () => {
  it("supports AbortController pattern to cancel pending actions", async () => {
    // Covers: Usage / Cancelling queued actions
    const rejectQueue: ((reason: Error) => void)[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState(
        async (
          prev: number,
          payload: { type: string; signal?: AbortSignal },
        ) => {
          try {
            await new Promise<void>((res, rej) => {
              const idx = rejectQueue.length;
              rejectQueue.push(rej);
              if (payload.signal) {
                const onAbort = () => {
                  payload.signal!.removeEventListener("abort", onAbort);
                  rej(new Error("Aborted"));
                };
                payload.signal.addEventListener("abort", onAbort, {
                  once: true,
                });
              }
            });
            return prev + 1;
          } catch (e) {
            // Docs pattern: catch abort and return fallback state
            return prev;
          }
        },
        0,
      );
      return el("div");
    });
    mount(App, container);

    const abort = new AbortController();
    startTransition(() => {
      api[1]({ type: "ADD", signal: abort.signal });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[2]()).toBe(true);

    abort.abort();
    await new Promise((r) => queueMicrotask(() => r(null)));

    // The action caught the abort and returned prev, so queue continues
    expect(api[0]()).toBe(0);
    expect(api[2]()).toBe(false);
  });
});

describe("useActionState — Usage / Using with <form> Action props", () => {
  it("accepts FormData as payload when used with forms", async () => {
    // Covers: Usage / Using with <form> Action props
    let api: any;
    const App = cc(() => {
      api = useActionState(
        async (prev: { name: string | null }, formData: FormData) => {
          const name = formData.get("name") as string | null;
          await new Promise((res) => queueMicrotask(() => res(null)));
          return { name };
        },
        { name: null },
      );
      return el("div");
    });
    mount(App, container);

    const fd = new FormData();
    fd.append("name", "Alice");

    startTransition(() => {
      api[1](fd);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toEqual({ name: "Alice" });
  });
});

describe("useActionState — Usage / Handling errors", () => {
  it("returns known errors as part of state for inline display", async () => {
    // Covers: Usage / Handling errors — known errors returned as state
    interface State {
      count: number;
      error: string | null;
    }
    let api: any;
    const App = cc(() => {
      api = useActionState(
        async (prev: State, quantity: number): Promise<State> => {
          await new Promise((res) => queueMicrotask(() => res(null)));
          if (quantity > 5) {
            return {
              ...prev,
              error: `Quantity not available: ${quantity}`,
            };
          }
          return { count: prev.count + quantity, error: null };
        },
        { count: 0, error: null },
      );
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](10);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toEqual({
      count: 0,
      error: "Quantity not available: 10",
    });
  });

  it("cancels queued actions and rejects promises when reducerAction throws", async () => {
    // Covers: Usage / Handling errors — unknown errors throw and cancel queue
    // Also: Troubleshooting / My actions are being skipped
    let api: any;
    let action2Promise: Promise<number> | undefined;
    let shouldThrow = false;
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        if (shouldThrow) {
          throw new Error("Unexpected error");
        }
        return prev + p;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](1);
      action2Promise = api[1](2);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(1);

    // Now throw on the second action
    shouldThrow = true;
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    // The error should have cancelled everything and reset isPending
    expect(api[2]()).toBe(false);

    // The action2 promise should reject with the original error
    let rejectedError: Error | undefined;
    try {
      await action2Promise!;
    } catch (e) {
      rejectedError = e as Error;
    }
    expect(rejectedError).toBeDefined();
    expect(rejectedError!.message).toBe("Unexpected error");
  });
});

// ─── Troubleshooting ───────────────────────────────────────────────────────

describe("useActionState — Troubleshooting", () => {
  it("logs an error when async dispatchAction is called outside startTransition", async () => {
    // Covers: Troubleshooting / async-function-outside-transition
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...args: any[]) => {
      errors.push(args.join(" "));
    };

    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, _p: unknown) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        return prev + 1;
      }, 0);
      return el("div");
    });
    mount(App, container);

    // Call dispatchAction OUTSIDE startTransition
    api[1](null);
    await new Promise((r) => queueMicrotask(() => r(null)));

    console.error = originalError;

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("outside of a transition");
  });

  it("does not log error for sync dispatchAction outside startTransition", async () => {
    // Covers: Troubleshooting / async-function-outside-transition
    // NOTE: React only warns for async actions.
    const originalError = console.error;
    const errors: string[] = [];
    console.error = (...args: any[]) => {
      errors.push(args.join(" "));
    };

    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, _p: unknown) => prev + 1, 0);
      return el("div");
    });
    mount(App, container);

    api[1](null);
    await new Promise((r) => queueMicrotask(() => r(null)));

    console.error = originalError;

    expect(errors.length).toBe(0);
  });

  it("reducerAction receives previousState as first arg, formData as second", async () => {
    // Covers: Troubleshooting / My Action cannot read form data
    const args: unknown[] = [];
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, formData: FormData) => {
        args.push({ prev, formData });
        await new Promise((res) => queueMicrotask(() => res(null)));
        return prev + 1;
      }, 0);
      return el("div");
    });
    mount(App, container);

    const fd = new FormData();
    fd.append("x", "1");
    startTransition(() => {
      api[1](fd);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(args.length).toBe(1);
    expect((args[0] as any).prev).toBe(0);
    expect((args[0] as any).formData).toBeInstanceOf(FormData);
  });

  it("supports reset by dispatching a reset signal", async () => {
    // Covers: Troubleshooting / My state doesn't reset
    const initialState = { name: "", error: null };
    let api: any;
    const App = cc(() => {
      api = useActionState(
        async (prev: typeof initialState, payload: FormData | null) => {
          await new Promise((res) => queueMicrotask(() => res(null)));
          if (payload === null) {
            return initialState;
          }
          const name = payload.get("name") as string;
          return { name, error: null };
        },
        initialState,
      );
      return el("div");
    });
    mount(App, container);

    const fd = new FormData();
    fd.append("name", "Bob");
    startTransition(() => {
      api[1](fd);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toEqual({ name: "Bob", error: null });

    startTransition(() => {
      api[1](null);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toEqual({ name: "", error: null });
  });
});

// ─── dispatchAction Promise return ────────────────────────────────────────

describe("useActionState — dispatchAction Promise return", () => {
  it("returns a Promise from dispatchAction that resolves with the new state", async () => {
    // Covers: docs examples showing `await dispatchAction(...)`
    let api: any;
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        return prev + p;
      }, 0);
      return el("div");
    });
    mount(App, container);

    let resolvedValue: number | undefined;
    startTransition(() => {
      api[1](5).then((val: number) => {
        resolvedValue = val;
      });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(resolvedValue).toBe(5);
  });

  it("returns a rejecting Promise when reducerAction throws", async () => {
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, _p: unknown) => {
        if (prev > 0) throw new Error("Boom");
        return prev + 1;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](null);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));

    let rejectedError: Error | undefined;
    startTransition(() => {
      api[1](null).catch((e: Error) => {
        rejectedError = e;
      });
    });
    await new Promise((r) => queueMicrotask(() => r(null)));

    expect(rejectedError).toBeDefined();
    expect(rejectedError!.message).toBe("Boom");
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("useActionState — Edge cases", () => {
  it("handles empty payload gracefully", async () => {
    let api: any;
    const App = cc(() => {
      api = useActionState((prev: number, _p: undefined) => prev + 1, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](undefined);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(1);
  });

  it("handles null payload gracefully", async () => {
    let api: any;
    const App = cc(() => {
      api = useActionState(
        (prev: number | null, _p: null) => (prev === null ? 0 : prev + 1),
        null,
      );
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](null);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(0);
  });

  it("handles boundary values", async () => {
    let api: any;
    const App = cc(() => {
      api = useActionState(
        (prev: number, p: number) => prev + p,
        Number.MAX_SAFE_INTEGER,
      );
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      api[1](1);
    });
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(api[0]()).toBe(Number.MAX_SAFE_INTEGER + 1);
  });

  it("dispatches multiple rapid actions and processes all sequentially", async () => {
    // Stress test for sequential queuing
    let api: any;
    const results: number[] = [];
    const App = cc(() => {
      api = useActionState(async (prev: number, p: number) => {
        await new Promise((res) => queueMicrotask(() => res(null)));
        results.push(p);
        return prev + p;
      }, 0);
      return el("div");
    });
    mount(App, container);

    startTransition(() => {
      for (let i = 1; i <= 10; i++) {
        api[1](i);
      }
    });

    // Wait for all to process
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => queueMicrotask(() => r(null)));
    }

    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(api[0]()).toBe(55); // 1+2+...+10
    expect(api[2]()).toBe(false);
  });
});
