/**
 * Comprehensive tests for `memo`.
 *
 * Tests are organised to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { memo } from "../../../../src/integrations/react/_shared.ts";
import { REACT_MEMO_TYPE } from "../../../../src/integrations/react/_internal/symbols.ts";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import type { SinwanElement } from "../../../../src/types.ts";

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

/** Build a simple SinwanElement for use in memo caching tests. */
function box(props: Record<string, unknown> = {}): SinwanElement {
  return { tag: "div", props, children: [] };
}

/** Simulate multiple renders of a component by re-invoking under the same instance. */
function simulateRenders<P>(
  Component: (props: P) => unknown,
  propsList: P[],
): unknown[] {
  const dummy = createComponentInstance(() => null as any, {}, null);
  const results: unknown[] = [];
  withInstance(dummy, () => {
    for (const props of propsList) {
      results.push(Component(props));
    }
  });
  return results;
}

// ─── Reference ─────────────────────────────────────────────────────────────

describe("memo — Reference", () => {
  it("accepts a Component and an optional arePropsEqual function", () => {
    const Inner = (props: { x: number }) => el("div", {}, props.x);
    expect(() => memo(Inner)).not.toThrow();
    expect(() => memo(Inner, () => true)).not.toThrow();
  });

  it("returns a MemoExoticComponent", () => {
    const Inner = (props: { x: number }) => el("div", {}, props.x);
    const Memoed = memo(Inner);
    expect(typeof Memoed).toBe("function");
  });

  it("sets $$typeof to REACT_MEMO_TYPE", () => {
    const Inner = (props: { x: number }) => el("div", {}, props.x);
    const Memoed = memo(Inner);
    expect((Memoed as any).$$typeof).toBe(REACT_MEMO_TYPE);
  });

  it("exposes the original Component on .type", () => {
    const Inner = (props: { x: number }) => el("div", {}, props.x);
    const Memoed = memo(Inner);
    expect((Memoed as any).type).toBe(Inner);
  });

  it("sets displayName to the wrapped component's name", () => {
    function NamedComponent(props: { x: number }) {
      return el("div", {}, props.x);
    }
    const Memoed = memo(NamedComponent);
    expect((Memoed as any).displayName).toBe("NamedComponent");
  });

  it("falls back to 'Memo' when the wrapped component has no name", () => {
    const Memoed = memo((props: { x: number }) => el("div", {}, props.x));
    expect((Memoed as any).displayName).toBe("Memo");
  });
});

// ─── Usage / Skipping re-rendering when props are unchanged ─────────────────

describe("memo — Usage / Skipping re-rendering when props are unchanged", () => {
  it("returns the cached result when props are shallow-equal", () => {
    let calls = 0;
    const Inner = (props: { x: number }) => {
      calls++;
      return box({ "data-x": props.x });
    };
    const Memoed = memo(Inner);

    const [r1, r2, r3] = simulateRenders(Memoed, [
      { x: 1 },
      { x: 1 },
      { x: 2 },
    ]);

    expect(r1).toBe(r2);
    expect(r3).not.toBe(r2);
    expect(calls).toBe(2);
  });

  it("uses Object.is for shallow comparison by default", () => {
    let calls = 0;
    const Inner = (props: { a: number; b: number }) => {
      calls++;
      return box({ sum: props.a + props.b });
    };
    const Memoed = memo(Inner);

    // NaN === NaN via Object.is
    const [r1, r2] = simulateRenders(Memoed, [
      { a: NaN, b: 1 },
      { a: NaN, b: 1 },
    ]);
    expect(r1).toBe(r2);
    expect(calls).toBe(1);

    // -0 !== +0 via Object.is
    calls = 0;
    const [r3, r4] = simulateRenders(Memoed, [
      { a: 0, b: 1 },
      { a: -0, b: 1 },
    ]);
    expect(calls).toBe(2);
    expect(r3).not.toBe(r4);
  });

  it("does not skip when any prop changes", () => {
    let calls = 0;
    const Inner = (props: { a: number; b: string }) => {
      calls++;
      return box({ val: `${props.a}-${props.b}` });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { a: 1, b: "x" },
      { a: 1, b: "y" },
    ]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });

  it("does not skip when a prop is a new object with the same shape", () => {
    let calls = 0;
    const Inner = (props: { obj: { id: number } }) => {
      calls++;
      return box({ id: props.obj.id });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { obj: { id: 1 } },
      { obj: { id: 1 } },
    ]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });

  it("skips when a prop is the same object reference", () => {
    let calls = 0;
    const obj = { id: 1 };
    const Inner = (props: { obj: { id: number } }) => {
      calls++;
      return box({ id: props.obj.id });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [{ obj }, { obj }]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);
  });

  it("skips when a prop is the same function reference", () => {
    let calls = 0;
    const fn = () => 42;
    const Inner = (props: { onClick: () => number }) => {
      calls++;
      return box({ handler: props.onClick });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { onClick: fn },
      { onClick: fn },
    ]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);
  });

  it("does not skip when a prop is a new function definition", () => {
    let calls = 0;
    const Inner = (props: { onClick: () => number }) => {
      calls++;
      return box({ handler: props.onClick });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { onClick: () => 1 },
      { onClick: () => 1 },
    ]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });
});

// ─── Usage / Specifying a custom comparison function ────────────────────────

describe("memo — Usage / Specifying a custom comparison function", () => {
  it("uses the provided arePropsEqual instead of shallowEqual", () => {
    let calls = 0;
    const Inner = (props: { items: number[] }) => {
      calls++;
      return box({ count: props.items.length });
    };
    const arePropsEqual = (
      prev: { items: number[] },
      next: { items: number[] },
    ) => prev.items.length === next.items.length;
    const Memoed = memo(Inner, arePropsEqual);

    const [r1, r2] = simulateRenders(Memoed, [
      { items: [1, 2] },
      { items: [3, 4] },
    ]);
    expect(calls).toBe(1); // custom comparer says they're equal
    expect(r1).toBe(r2);
  });

  it("re-renders when the custom comparison returns false", () => {
    let calls = 0;
    const Inner = (props: { x: number }) => {
      calls++;
      return box({ x: props.x });
    };
    const arePropsEqual = () => false;
    const Memoed = memo(Inner, arePropsEqual);

    const [r1, r2] = simulateRenders(Memoed, [{ x: 1 }, { x: 1 }]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });

  it("passes prev and next props in the correct order", () => {
    const order: string[] = [];
    const Inner = (props: { x: number }) => box({ x: props.x });
    const arePropsEqual = (prev: { x: number }, next: { x: number }) => {
      order.push(`prev=${prev.x}`, `next=${next.x}`);
      return prev.x === next.x;
    };
    const Memoed = memo(Inner, arePropsEqual);

    simulateRenders(Memoed, [{ x: 1 }, { x: 2 }]);
    expect(order).toEqual(["prev=1", "next=2"]);
  });
});

// ─── Caveats / Pitfalls ─────────────────────────────────────────────────────

describe("memo — Caveats", () => {
  it("treats new arrays as different props even with same contents", () => {
    let calls = 0;
    const Inner = (props: { items: string[] }) => {
      calls++;
      return box({ items: props.items });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { items: ["a"] },
      { items: ["a"] },
    ]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });

  it("treats new objects as different props even with same shape", () => {
    let calls = 0;
    const Inner = (props: { config: { enabled: boolean } }) => {
      calls++;
      return box({ config: props.config });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { config: { enabled: true } },
      { config: { enabled: true } },
    ]);
    expect(calls).toBe(2);
    expect(r1).not.toBe(r2);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("memo — Edge cases", () => {
  it("handles empty props object", () => {
    let calls = 0;
    const Inner = () => {
      calls++;
      return box();
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [{}, {}]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);
  });

  it("handles null and undefined prop values", () => {
    let calls = 0;
    const Inner = (props: { value: null | undefined | string }) => {
      calls++;
      return box({ value: props.value });
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [
      { value: null },
      { value: null },
    ]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);

    const [r3, r4] = simulateRenders(Memoed, [
      { value: undefined },
      { value: undefined },
    ]);
    expect(r3).toBe(r4);
  });

  it("caches per component instance, not globally", () => {
    let calls = 0;
    const Inner = (props: { x: number }) => {
      calls++;
      return box({ "data-x": props.x });
    };
    const Memoed = memo(Inner);

    // Two separate instances with DIFFERENT props
    const instanceA = createComponentInstance(() => null as any, {}, null);
    const instanceB = createComponentInstance(() => null as any, {}, null);

    let resultA: any;
    let resultB: any;

    withInstance(instanceA, () => {
      resultA = Memoed({ x: 1 });
    });
    withInstance(instanceB, () => {
      resultB = Memoed({ x: 2 });
    });

    // Each instance cached independently
    expect(calls).toBe(2);
    expect(resultA.props["data-x"]).toBe(1);
    expect(resultB.props["data-x"]).toBe(2);

    // Re-invoke under the same instances with the SAME props
    withInstance(instanceA, () => {
      const cachedA = Memoed({ x: 1 });
      expect(cachedA).toBe(resultA);
    });
    withInstance(instanceB, () => {
      const cachedB = Memoed({ x: 2 });
      expect(cachedB).toBe(resultB);
    });

    // No additional calls because each instance saw the same props
    expect(calls).toBe(2);
  });

  it("handles components that return null", () => {
    let calls = 0;
    const Inner = () => {
      calls++;
      return null;
    };
    const Memoed = memo(Inner);

    const [r1, r2] = simulateRenders(Memoed, [{}, {}]);
    expect(calls).toBe(1);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
  });

  it("handles components that return a string", () => {
    let calls = 0;
    const Inner = (props: { text: string }) => {
      calls++;
      return props.text;
    };
    const Memoed = memo(Inner as any);

    const [r1, r2] = simulateRenders(Memoed, [{ text: "hi" }, { text: "hi" }]);
    expect(calls).toBe(1);
    expect(r1).toBe("hi");
    expect(r2).toBe(r1);
  });

  it("handles components that return a number", () => {
    let calls = 0;
    const Inner = (props: { n: number }) => {
      calls++;
      return props.n;
    };
    const Memoed = memo(Inner as any);

    const [r1, r2] = simulateRenders(Memoed, [{ n: 42 }, { n: 42 }]);
    expect(calls).toBe(1);
    expect(r1).toBe(42);
    expect(r2).toBe(r1);
  });

  it("preserves children prop in comparison", () => {
    let calls = 0;
    const Inner = (props: { children?: string }) => {
      calls++;
      return box({ child: props.children });
    };
    const Memoed = memo(Inner);

    // simulateRenders creates a fresh instance each call, so the
    // second batch starts with an empty cache.
    const [r1, r2] = simulateRenders(Memoed, [
      { children: "a" },
      { children: "a" },
    ]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);

    const [r3, r4] = simulateRenders(Memoed, [
      { children: "a" },
      { children: "b" },
    ]);
    // Two calls: first "a" (new instance, cache miss), then "b" (cache miss)
    expect(calls).toBe(3);
    expect(r3).not.toBe(r4);
  });

  it("works when mounted via the renderer", () => {
    let renderCount = 0;
    const Inner = cc((props: { name: string }) => {
      renderCount++;
      return el("span", {}, props.name);
    });
    const Memoed = memo(Inner as any);

    const App = cc(() => {
      return el("div", {}, el(Memoed as any, { name: "Taylor" }));
    });

    mount(App, container);
    expect(container.textContent).toBe("Taylor");
    expect(renderCount).toBe(1);
  });
});
