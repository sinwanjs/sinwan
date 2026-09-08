/**
 * Unit tests for softHideInstance / softShowInstance in src/component/instance.ts.
 *
 * These cover the Activity soft-hide/soft-show paths that are hard to reach
 * through the full render pipeline:
 *   - softHideInstance recursing into child instances
 *   - softHideInstance firing _disposeHooks (onDispose)
 *   - softShowInstance guard when hooks are already registered
 *   - softShowInstance setup error path (handleComponentError)
 *   - softShowInstance recursing into child instances
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import {
  createComponentInstance,
  softHideInstance,
  softShowInstance,
  withInstance,
  setCurrentInstance,
  getCurrentInstance,
  type ComponentInstance,
} from "../src/component/instance.ts";
import {
  onMounted,
  onUnmounted,
  onDispose,
  onError,
} from "../src/component/lifecycle.ts";
import type { SinwanComponent, SinwanNode } from "../src/types.ts";

let win: InstanceType<typeof Window>;
beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
});

/** A no-op component function used as a stand-in SinwanComponent. */
const noopComponent: SinwanComponent<any> = () =>
  ({
    tag: "div",
    props: { children: [] },
    children: [],
  }) as unknown as SinwanNode;

function makeInstance(
  component: SinwanComponent<any> = noopComponent,
  parent: ComponentInstance | null = null,
): ComponentInstance {
  const inst = createComponentInstance(component, {}, parent);
  if (parent) parent.children.push(inst);
  return inst;
}

// ─── softHideInstance ──────────────────────────────────────

describe("softHideInstance", () => {
  it("recurses into child instances (fires child onUnmounted)", () => {
    const log: string[] = [];
    const parent = makeInstance();
    const child = makeInstance(undefined, parent);

    withInstance(child, () => {
      onUnmounted(() => log.push("child unmounted"));
    });
    child.isMounted = true;
    parent.isMounted = true;

    softHideInstance(parent);

    expect(log).toEqual(["child unmounted"]);
  });

  it("fires _disposeHooks (onDispose) during soft-hide", () => {
    const log: string[] = [];
    const inst = makeInstance();
    withInstance(inst, () => {
      onDispose(() => log.push("disposed"));
      onUnmounted(() => log.push("unmounted"));
    });
    inst.isMounted = true;

    softHideInstance(inst);

    // onUnmounted fires first, then onDispose (effects torn down).
    expect(log).toEqual(["unmounted", "disposed"]);
  });

  it("fires dispose hooks for both parent and child on soft-hide", () => {
    const log: string[] = [];
    const parent = makeInstance();
    const child = makeInstance(undefined, parent);

    withInstance(parent, () => onDispose(() => log.push("parent disposed")));
    withInstance(child, () => onDispose(() => log.push("child disposed")));
    parent.isMounted = true;
    child.isMounted = true;

    softHideInstance(parent);

    // Children first: child dispose fires before parent dispose.
    expect(log).toEqual(["child disposed", "parent disposed"]);
  });
});

// ─── softShowInstance ──────────────────────────────────────

describe("softShowInstance", () => {
  it("recurses into child instances (re-runs child setup + mounted)", () => {
    const log: string[] = [];
    const parent = makeInstance(() => {
      onMounted(() => log.push("parent mounted"));
      return { tag: "div", props: { children: [] }, children: [] } as any;
    });
    const child = makeInstance(() => {
      onMounted(() => log.push("child mounted"));
      return { tag: "span", props: { children: [] }, children: [] } as any;
    }, parent);

    // Start in a soft-hidden state: mounted once, then hidden so hooks are
    // cleared and isMounted is false.
    parent.isMounted = true;
    child.isMounted = true;
    softHideInstance(parent);

    softShowInstance(parent);

    // Parent setup runs first (registers parent mounted), then child soft-show
    // runs child setup, then mounted hooks fire. Child mounted fires during
    // child soft-show (before parent mounted fires at the parent level).
    expect(log).toContain("child mounted");
    expect(log).toContain("parent mounted");
  });

  it("skips re-running setup when hooks are already registered (guard)", () => {
    let setupRuns = 0;
    const inst = makeInstance(() => {
      setupRuns++;
      onMounted(() => {});
      return { tag: "div", props: { children: [] }, children: [] } as any;
    });

    // Simulate the guarded state: not mounted, but hooks already present from
    // a previous soft-show that registered them without completing the mount.
    inst.isMounted = false;
    inst._mountedHooks.push(() => {});

    softShowInstance(inst);

    // Guard returned early — setup was NOT re-invoked.
    expect(setupRuns).toBe(0);
  });

  it("handles a setup error via handleComponentError without throwing out", () => {
    const errors: Error[] = [];
    const parent = makeInstance();
    withInstance(parent, () => onError((err: Error) => errors.push(err)));

    const boom = makeInstance(() => {
      throw new Error("soft-show boom");
    }, parent);

    // soft-hidden state.
    boom.isMounted = false;

    // Must not throw out of softShowInstance; the error bubbles to the
    // parent's onError handler via handleComponentError.
    expect(() => softShowInstance(boom)).not.toThrow();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("soft-show boom");
  });

  it("does not re-show an already-mounted instance", () => {
    let setupRuns = 0;
    const inst = makeInstance(() => {
      setupRuns++;
      onMounted(() => {});
      return { tag: "div", props: { children: [] }, children: [] } as any;
    });
    inst.isMounted = true;

    softShowInstance(inst);

    expect(setupRuns).toBe(0);
  });
});

// ─── current instance restoration ──────────────────────────

describe("softShowInstance restores the current instance", () => {
  it("restores the previous current instance after soft-show", () => {
    const inst = makeInstance(() => {
      onMounted(() => {});
      return { tag: "div", props: { children: [] }, children: [] } as any;
    });
    inst.isMounted = true;
    softHideInstance(inst);

    // Set a sentinel current instance so we can verify restoration.
    const sentinel = makeInstance();
    setCurrentInstance(sentinel);

    softShowInstance(inst);

    // After soft-show, the current instance is restored to the sentinel.
    expect(getCurrentInstance()).toBe(sentinel);
    setCurrentInstance(null);
  });
});
