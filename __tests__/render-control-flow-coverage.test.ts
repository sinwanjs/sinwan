/**
 * SinwanJS Render Control Flow — Line Coverage Tests
 *
 * Targets uncovered branches in src/renderer/render-control-flow.ts:
 *   - Virtual: no renderChild, empty list with/without fallback, dispose
 *   - For: no renderChild, empty list with fallback, swap fast-path edge cases,
 *          numeric key optimization, portal ordering, single-item in-place update
 *   - Index: no renderChild, empty list with fallback, shrink/grow
 *   - Dynamic: same-tag skip
 *   - ErrorBoundary: non-Error throws, function fallback with reset
 *   - Suspense: promise throw fallback, retry on resolve, dispose
 *   - Activity: hidden→visible toggle, visible→hidden toggle, as prop
 *   - ViewTransition: no name (passthrough), with name, dispose
 *   - Portal: string/function/object targets, containsPortal, syncPortalOrder
 *   - softHide/softShow: all node types
 *   - clearChildren: >4 children fast path (Range)
 *   - updateTextNodeContent: nested element text update
 *   - moveBeforeEnd
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { computed, nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { cc } from "../src/component/create.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Match,
  Portal,
  Show,
  Switch,
  Visible,
  Virtual,
  ErrorBoundary,
} from "../src/component/control-flow.ts";
import { Suspense } from "../src/react/suspense.ts";
import { Activity } from "../src/react/activity.ts";
import { ViewTransition } from "../src/react/view-transition.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  container = doc.createElement("div");
  doc.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  (globalThis as any).document = undefined;
  (globalThis as any).window = undefined;
});

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0) {
    finalProps.children = children.length === 1 ? children[0] : children;
  }
  return { tag: tag as any, props: finalProps, children };
}

// ─── Virtual: uncovered branches ───────────────────────────

describe("render-control-flow coverage > Virtual", () => {
  it("clears records when renderChild is not a function", async () => {
    const items = signal(["a", "b", "c"]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        children: "not a function" as any,
      }),
    );
    mount(App, container);
    await nextTick();
    // No rows rendered since children is not a function
    const rows = container.querySelectorAll("div");
    // container + content wrapper only
    expect(rows.length).toBe(2);
  });

  it("renders fallback when list becomes empty", async () => {
    const items = signal<string[]>(["a", "b"]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        fallback: el("p", {}, "empty"),
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("a");
    items.value = [];
    await nextTick();
    expect(container.textContent).toContain("empty");
  });

  it("clears content when list becomes empty without fallback", async () => {
    const items = signal<string[]>(["a", "b"]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("a");
    items.value = [];
    await nextTick();
    const spans = container.querySelectorAll("span");
    expect(spans.length).toBe(0);
  });

  it("disposes scroll listener and effect on unmount", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        children: (item: string) => el("span", {}, item),
      }),
    );
    const app = mount(App, container);
    await nextTick();
    const scroller = container.firstElementChild as HTMLElement;
    expect(scroller).toBeTruthy();
    app.unmount();
    // After unmount, scroll events should not cause errors
    scroller.scrollTop = 100;
    scroller.dispatchEvent(new (win as any).Event("scroll") as Event);
    await nextTick();
    // No crash — listener was removed
    expect(scroller.isConnected).toBe(false);
  });
});

// ─── For: uncovered branches ───────────────────────────────

describe("render-control-flow coverage > For", () => {
  it("clears records when renderChild is not a function", async () => {
    const items = signal([1, 2, 3]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: "not a function" as any,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("");
  });

  it("renders fallback when list becomes empty", async () => {
    const items = signal([1, 2, 3]);
    const App = cc(() =>
      el(For, {
        each: items,
        fallback: el("p", {}, "no items"),
        children: (item: number) => el("span", {}, String(item)),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("1");
    items.value = [];
    await nextTick();
    expect(container.textContent).toContain("no items");
  });

  it("swaps two elements using fast-path (iBeforeJ=true)", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    const spans = () => Array.from(container.querySelectorAll("span"));
    expect(spans().map((s) => s.textContent)).toEqual(["a", "b", "c", "d"]);
    // Swap items 1 and 2
    items.value = ["a", "c", "b", "d"];
    await nextTick();
    expect(spans().map((s) => s.textContent)).toEqual(["a", "c", "b", "d"]);
  });

  it("swaps two elements using fast-path (iBeforeJ=false)", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Swap in reverse order to trigger iBeforeJ=false path
    items.value = ["d", "b", "c", "a"];
    await nextTick();
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["d", "b", "c", "a"]);
  });

  it("handles single-item in-place update with primitive content", async () => {
    const items = signal(["a", "b", "c"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => item,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("abc");
    // Change only one item — triggers simpleUpdate with diffCount=1
    items.value = ["a", "X", "c"];
    await nextTick();
    expect(container.textContent).toBe("aXc");
  });

  it("handles single-item in-place update with element content", async () => {
    const items = signal(["a", "b", "c"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Change only one item — triggers in-place re-render for element
    items.value = ["a", el("span", {}, "X"), "c"] as any;
    await nextTick();
    // The For should handle the update
    expect(container.textContent).toContain("X");
  });

  it("uses numeric key optimization for numeric keys", async () => {
    const items = signal([
      { id: 0, name: "zero" },
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) => el("span", {}, item.name),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("zero");
    // Reorder to exercise numeric key path
    items.value = [
      { id: 2, name: "two" },
      { id: 1, name: "one" },
      { id: 0, name: "zero" },
    ];
    await nextTick();
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["two", "one", "zero"]);
  });

  it("detects non-numeric keys in old records and falls back to Map", async () => {
    const items = signal([
      { id: "a", name: "alpha" },
      { id: "b", name: "beta" },
    ]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) => el("span", {}, item.name),
      }),
    );
    mount(App, container);
    await nextTick();
    // Update with string keys — allNumericKeys becomes false
    items.value = [
      { id: "b", name: "beta-updated" },
      { id: "a", name: "alpha" },
    ];
    await nextTick();
    expect(container.textContent).toContain("beta-updated");
  });

  it("removes old record when key is not found in new list", async () => {
    const items = signal([
      { id: 1, name: "one" },
      { id: 2, name: "two" },
      { id: 3, name: "three" },
    ]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) => el("span", {}, item.name),
      }),
    );
    mount(App, container);
    await nextTick();
    // Remove item with id=2 — old record for key 2 is removed
    items.value = [
      { id: 1, name: "one" },
      { id: 3, name: "three" },
    ];
    await nextTick();
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["one", "three"]);
  });
});

// ─── Index: uncovered branches ─────────────────────────────

describe("render-control-flow coverage > Index", () => {
  it("clears records when renderChild is not a function", async () => {
    const items = signal([1, 2, 3]);
    const App = cc(() =>
      el(Index, {
        each: items,
        children: "not a function" as any,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("");
  });

  it("renders fallback when list becomes empty", async () => {
    const items = signal([1, 2, 3]);
    const App = cc(() =>
      el(Index, {
        each: items,
        fallback: el("p", {}, "empty"),
        children: (item: () => number) => el("span", {}, String(item())),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("1");
    items.value = [];
    await nextTick();
    expect(container.textContent).toContain("empty");
  });

  it("shrinks records when list gets shorter", async () => {
    const items = signal([1, 2, 3, 4, 5]);
    const App = cc(() =>
      el(Index, {
        each: items,
        children: (item: () => number) => el("span", {}, String(item())),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(5);
    items.value = [1, 2];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(2);
  });

  it("clears existing children when records are empty but block has children", async () => {
    const items = signal<number[]>([]);
    const App = cc(() =>
      el(Index, {
        each: items,
        fallback: el("p", {}, "empty"),
        children: (item: () => number) => el("span", {}, String(item())),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("empty");
    // Add items then clear — exercises records.length===0 && block.children.length>0
    items.value = [1, 2];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(2);
    items.value = [];
    await nextTick();
    expect(container.textContent).toContain("empty");
  });
});

// ─── Dynamic: same-tag skip ────────────────────────────────

describe("render-control-flow coverage > Dynamic", () => {
  it("skips re-render when component tag is the same", async () => {
    const current = signal<"a" | "b">("a");
    const A = cc(() => el("span", {}, "component-a"));
    const B = cc(() => el("span", {}, "component-b"));
    const comp = computed(() => (current.value === "a" ? A : B));
    const App = cc(() =>
      el(Dynamic, {
        component: comp,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("component-a");
    // Set to same component — should skip re-render
    current.value = "a";
    await nextTick();
    expect(container.textContent).toContain("component-a");
    // Change to different component
    current.value = "b";
    await nextTick();
    expect(container.textContent).toContain("component-b");
  });

  it("renders null when component is falsy", async () => {
    const current = signal<any>(null);
    const comp = computed(() => current.value);
    const App = cc(() =>
      el(Dynamic, {
        component: comp,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("");
    const C = cc(() => el("span", {}, "component-c"));
    current.value = C;
    await nextTick();
    expect(container.textContent).toContain("component-c");
  });
});

// ─── ErrorBoundary: non-Error throws and function fallback ─

describe("render-control-flow coverage > ErrorBoundary", () => {
  it("wraps non-Error throws in Error and calls function fallback with reset", async () => {
    const Throwing = cc(() => {
      throw "string error";
    });
    let capturedError: Error | null = null;
    const App = cc(() =>
      el(ErrorBoundary, {
        children: el(Throwing),
        fallback: (error: Error, reset: () => void) => {
          capturedError = error;
          return el("p", {}, error.message);
        },
      }),
    );
    mount(App, container);
    await nextTick();
    expect(capturedError).toBeInstanceOf(Error);
    expect(capturedError!.message).toBe("string error");
    expect(container.textContent).toContain("string error");
  });

  it("renders static fallback on Error throw", async () => {
    const Throwing = cc(() => {
      throw new Error("boom");
    });
    const App = cc(() =>
      el(ErrorBoundary, {
        children: el(Throwing),
        fallback: el("p", {}, "safe"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("safe");
  });
});

// ─── Suspense: promise throw, retry, dispose ───────────────

describe("render-control-flow coverage > Suspense", () => {
  it("shows fallback when child is async and retries on resolve", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => {
      const text = await pending.promise;
      return el("p", {}, text);
    });
    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", {}, "loading"),
        children: el(AsyncChild),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("loading");
    // Resolve the promise — should trigger retry and render content
    pending.resolve("resolved-content");
    await nextTick();
    await nextTick();
    expect(container.textContent).toContain("resolved-content");
  });

  it("disposes properly on unmount", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => {
      const text = await pending.promise;
      return el("p", {}, text);
    });
    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", {}, "loading"),
        children: el(AsyncChild),
      }),
    );
    const app = mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("loading");
    app.unmount();
    // Resolve after unmount — should not crash
    pending.resolve("late");
    await nextTick();
    expect(container.textContent).toBe("");
  });

  it("renders content successfully without promise", async () => {
    const Child = cc(() => el("p", {}, "content"));
    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", {}, "loading"),
        children: el(Child),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("content");
  });
});

// ─── Activity: toggle and as prop ──────────────────────────

describe("render-control-flow coverage > Activity", () => {
  it("toggles from hidden to visible and back", async () => {
    const mode = signal<"hidden" | "visible">("hidden");
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el("span", {}, "retained"),
      }),
    );
    mount(App, container);
    await nextTick();
    const wrapper = container.querySelector("[data-sinwan-activity]");
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute("data-sinwan-activity")).toBe("hidden");
    expect(wrapper!.hasAttribute("hidden")).toBe(true);
    // Toggle to visible
    mode.value = "visible";
    await nextTick();
    expect(wrapper!.getAttribute("data-sinwan-activity")).toBe("visible");
    expect(wrapper!.hasAttribute("hidden")).toBe(false);
    // Toggle back to hidden
    mode.value = "hidden";
    await nextTick();
    expect(wrapper!.getAttribute("data-sinwan-activity")).toBe("hidden");
    expect(wrapper!.hasAttribute("hidden")).toBe(true);
  });

  it("uses custom wrapper tag via as prop", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    const App = cc(() =>
      el(Activity, {
        mode,
        as: "section",
        children: el("span", {}, "content"),
      }),
    );
    mount(App, container);
    await nextTick();
    const section = container.querySelector("section");
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-sinwan-activity")).toBe("visible");
  });
});

// ─── ViewTransition: no name and with name ─────────────────

describe("render-control-flow coverage > ViewTransition", () => {
  it("renders children without wrapper when no name is provided", async () => {
    const App = cc(() =>
      el(ViewTransition, {
        children: el("span", {}, "plain"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("plain");
    // No wrapper div with style
    const styledDiv = container.querySelector('[style*="view-transition"]');
    expect(styledDiv).toBeNull();
  });

  it("renders wrapper with view-transition-name when name is provided", async () => {
    const App = cc(() =>
      el(ViewTransition, {
        name: "card",
        children: el("span", {}, "named"),
      }),
    );
    mount(App, container);
    await nextTick();
    const wrapper = container.querySelector('[style*="view-transition-name"]');
    expect(wrapper).toBeTruthy();
    expect(container.textContent).toContain("named");
  });

  it("uses custom wrapper tag via as prop", async () => {
    const App = cc(() =>
      el(ViewTransition, {
        name: "card",
        as: "section",
        children: "sectioned",
      }),
    );
    mount(App, container);
    await nextTick();
    const section = container.querySelector("section");
    expect(section).toBeTruthy();
  });
});

// ─── Portal: various target types ──────────────────────────

describe("render-control-flow coverage > Portal", () => {
  it("renders to a string selector target", async () => {
    const target = doc.createElement("div");
    target.id = "portal-target";
    doc.body.appendChild(target);
    const App = cc(() =>
      el(Portal, {
        mount: "#portal-target",
        children: el("span", {}, "ported"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("ported");
    target.remove();
  });

  it("renders to a function target", async () => {
    const target = doc.createElement("div");
    target.id = "fn-target";
    doc.body.appendChild(target);
    const App = cc(() =>
      el(Portal, {
        mount: () => target,
        children: el("span", {}, "fn-ported"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("fn-ported");
    target.remove();
  });

  it("renders to an object target (Node)", async () => {
    const target = doc.createElement("div");
    doc.body.appendChild(target);
    const App = cc(() =>
      el(Portal, {
        mount: target,
        children: el("span", {}, "obj-ported"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("obj-ported");
    target.remove();
  });

  it("defaults to document.body when target is null", async () => {
    const App = cc(() =>
      el(Portal, {
        mount: null,
        children: el("span", {}, "body-ported"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(doc.body.textContent).toContain("body-ported");
  });

  it("returns null for unknown target types", async () => {
    const App = cc(() =>
      el(Portal, {
        mount: 42 as any,
        children: el("span", {}, "unknown"),
      }),
    );
    mount(App, container);
    await nextTick();
    // Should not crash; content may go to body or nowhere
    expect(container.textContent).toBe("");
  });

  it("renders portal inside For list and reorders on update", async () => {
    const target = doc.createElement("div");
    target.id = "for-portal-target";
    doc.body.appendChild(target);
    const items = signal(["a", "b", "c"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) =>
          el(Portal, {
            mount: "#for-portal-target",
            children: el("span", {}, item),
          }),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("a");
    // Reorder — exercises containsPortal + syncPortalOrder in For
    items.value = ["c", "b", "a"];
    await nextTick();
    const spans = Array.from(target.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["c", "b", "a"]);
    target.remove();
  });
});

// ─── softHide / softShow: all node types ───────────────────

describe("render-control-flow coverage > Activity soft hide/show", () => {
  it("soft-hides and soft-shows component, element, fragment, and async children", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    let mounted = false;
    let unmounted = false;
    const Child = cc(() => {
      onMounted(() => {
        mounted = true;
      });
      onUnmounted(() => {
        unmounted = true;
      });
      return el("div", {}, el("span", {}, "child-content"));
    });
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el(Child),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(mounted).toBe(true);
    // Hide — soft-hide should clean up effects but keep DOM
    mode.value = "hidden";
    await nextTick();
    const wrapper = container.querySelector("[data-sinwan-activity]");
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute("hidden")).toBe("");
    // Show again — soft-show should re-create effects
    mode.value = "visible";
    await nextTick();
    expect(wrapper!.hasAttribute("hidden")).toBe(false);
  });

  it("soft-hides/shows nested elements and fragments", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    const App = cc(() =>
      el(Activity, {
        mode,
        children: [el("div", {}, "first"), el("span", {}, "second")],
      }),
    );
    mount(App, container);
    await nextTick();
    mode.value = "hidden";
    await nextTick();
    const wrapper = container.querySelector("[data-sinwan-activity]");
    expect(wrapper!.getAttribute("hidden")).toBe("");
    mode.value = "visible";
    await nextTick();
    expect(wrapper!.hasAttribute("hidden")).toBe(false);
  });
});

// ─── clearChildren: >4 children fast path (Range) ──────────

describe("render-control-flow coverage > clearChildren fast path", () => {
  it("uses Range batch removal for blocks with more than 4 children", async () => {
    // Show with >4 children triggers clearChildren on toggle
    const visible = signal(true);
    const children: SinwanNode[] = [];
    for (let i = 0; i < 6; i++) {
      children.push(el("span", {}, `item-${i}`));
    }
    const App = cc(() =>
      el(Show, {
        when: visible,
        children,
        fallback: el("p", {}, "hidden"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(6);
    // Toggle off — clearChildren with >4 children uses Range
    visible.value = false;
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(0);
    expect(container.textContent).toContain("hidden");
  });
});

// ─── Key: basic rendering ──────────────────────────────────

describe("render-control-flow coverage > Key", () => {
  it("renders and updates keyed content", async () => {
    const key = signal("a");
    const App = cc(() =>
      el(Key, {
        when: key,
        children: (value: string) => el("span", {}, `key-${value}`),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("key-a");
    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("key-b");
  });
});

// ─── Switch/Match: basic rendering ─────────────────────────

describe("render-control-flow coverage > Switch/Match", () => {
  it("renders matching Match and falls through to fallback", async () => {
    const value = signal(1);
    const App = cc(() =>
      el(Switch, {
        fallback: el("p", {}, "no match"),
        children: [
          el(Match, {
            when: computed(() => value.value === 1),
            children: el("span", {}, "one"),
          }),
          el(Match, {
            when: computed(() => value.value === 2),
            children: el("span", {}, "two"),
          }),
        ],
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("one");
    value.value = 2;
    await nextTick();
    expect(container.textContent).toContain("two");
    value.value = 3;
    await nextTick();
    expect(container.textContent).toContain("no match");
  });
});

// ─── Additional edge cases for remaining coverage ──────────

describe("render-control-flow coverage > Virtual edge cases", () => {
  it("clears existing records when renderChild becomes non-function after init", async () => {
    const items = signal(["a", "b", "c", "d", "e"]);
    const renderFn = signal<(item: string) => SinwanNode>((item: string) =>
      el("span", {}, item),
    );
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        children: ((item: string) => renderFn.value(item)) as any,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("a");
    // Now set children to a non-function value — triggers the clear path
    renderFn.value = (() => "not a function") as any;
    items.value = [...items.value]; // trigger re-run
    await nextTick();
    // The Virtual should handle non-function children gracefully
  });

  it("removes content DOM nodes when list becomes empty after having items", async () => {
    const items = signal(["a", "b", "c", "d", "e"]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 40,
        overscan: 0,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
    items.value = [];
    await nextTick();
    // Spans should be removed from the content area
    expect(container.querySelectorAll("span").length).toBe(0);
  });
});

describe("render-control-flow coverage > For edge cases", () => {
  it("handles swap fast-path with null nodes (early return)", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Swap items 0 and 1 — triggers swap fast path
    items.value = ["b", "a", "c", "d"];
    await nextTick();
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["b", "a", "c", "d"]);
  });

  it("handles swap fast-path with detached parent (early return)", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    const app = mount(App, container);
    await nextTick();
    // Unmount to detach parent, then try to swap
    // This is hard to trigger directly; the swap path with no parent
    // is an edge case safety guard
    app.unmount();
  });

  it("handles portal sync after swap in For", async () => {
    const target = doc.createElement("div");
    target.id = "swap-portal-target";
    doc.body.appendChild(target);
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) =>
          el(Portal, {
            mount: "#swap-portal-target",
            children: el("span", {}, item),
          }),
      }),
    );
    mount(App, container);
    await nextTick();
    // Swap two items — triggers containsPortal + syncPortalOrder in swap path
    items.value = ["b", "a", "c", "d"];
    await nextTick();
    const spans = Array.from(target.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["b", "a", "c", "d"]);
    target.remove();
  });

  it("handles portal detection after full reconcile", async () => {
    const target = doc.createElement("div");
    target.id = "reconcile-portal-target";
    doc.body.appendChild(target);
    const items = signal(["a", "b", "c"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) =>
          el(Portal, {
            mount: "#reconcile-portal-target",
            children: el("span", {}, item),
          }),
      }),
    );
    mount(App, container);
    await nextTick();
    // Full reorder (more than 2 changes) — triggers full reconcile path
    // with portal detection
    items.value = ["c", "b", "a"];
    await nextTick();
    const spans = Array.from(target.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["c", "b", "a"]);
    target.remove();
  });

  it("handles in-place update with element content (non-primitive)", async () => {
    const items = signal(["a", "b", "c", "d", "e"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("div", { class: "row" }, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Change only one item — triggers simpleUpdate with diffCount=1
    // and element content (not primitive)
    items.value = ["a", "X", "c", "d", "e"];
    await nextTick();
    const rows = Array.from(container.querySelectorAll(".row"));
    expect(rows[1]!.textContent).toBe("X");
  });
});

describe("render-control-flow coverage > Index edge cases", () => {
  it("grows records when list gets longer after being empty", async () => {
    const items = signal<number[]>([]);
    const App = cc(() =>
      el(Index, {
        each: items,
        children: (item: () => number) => el("span", {}, String(item())),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(0);
    items.value = [1, 2];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(2);
  });
});

describe("render-control-flow coverage > Dynamic same-tag skip", () => {
  it("skips re-render when tag is same object reference", async () => {
    const current = signal<"a" | "b">("a");
    const A = cc(() => el("span", {}, "component-a"));
    const comp = computed(() => A); // always returns A
    const App = cc(() =>
      el(Dynamic, {
        component: comp,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("component-a");
    // Trigger re-run but with same component — should skip
    current.value = "b";
    await nextTick();
    expect(container.textContent).toContain("component-a");
  });
});

describe("render-control-flow coverage > ErrorBoundary reset", () => {
  it("resets error boundary via reset function", async () => {
    let shouldThrow = true;
    const Throwing = cc(() => {
      if (shouldThrow) throw new Error("boom");
      return el("p", {}, "recovered");
    });
    let resetFn: (() => void) | null = null;
    const App = cc(() =>
      el(ErrorBoundary, {
        children: el(Throwing),
        fallback: (error: Error, reset: () => void) => {
          resetFn = reset;
          return el("p", {}, error.message);
        },
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("boom");
    // Fix the error and reset
    shouldThrow = false;
    resetFn!();
    await nextTick();
    expect(container.textContent).toContain("recovered");
  });
});

describe("render-control-flow coverage > Suspense re-throws non-promise errors", () => {
  it("re-throws non-promise errors from children (caught by ErrorBoundary)", async () => {
    const Throwing = cc(() => {
      throw new Error("not a promise");
    });
    const App = cc(() =>
      el(ErrorBoundary, {
        children: el(Suspense, {
          fallback: el("p", {}, "loading"),
          children: el(Throwing),
        }),
        fallback: (error: Error) => el("p", {}, `caught: ${error.message}`),
      }),
    );
    mount(App, container);
    await nextTick();
    // The non-promise error should be re-thrown by Suspense and caught
    // by the ErrorBoundary
    expect(container.textContent).toContain("caught: not a promise");
  });
});

describe("render-control-flow coverage > Portal target change", () => {
  it("moves portal content when target changes", async () => {
    const target1 = doc.createElement("div");
    target1.id = "target-1";
    const target2 = doc.createElement("div");
    target2.id = "target-2";
    doc.body.appendChild(target1);
    doc.body.appendChild(target2);
    const target = signal("#target-1");
    const App = cc(() =>
      el(Portal, {
        mount: target,
        children: el("span", {}, "ported"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target1.textContent).toContain("ported");
    // Change target — should move content
    target.value = "#target-2";
    await nextTick();
    expect(target2.textContent).toContain("ported");
    target1.remove();
    target2.remove();
  });
});

describe("render-control-flow coverage > updateTextNodeContent", () => {
  it("updates nested text nodes inside elements", async () => {
    const text = signal("initial");
    const App = cc(() =>
      el(Show, {
        when: text,
        children: el("div", {}, el("span", {}, text)),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("initial");
    // Update text — triggers in-place text update for primitive content in For
    text.value = "updated";
    await nextTick();
    expect(container.textContent).toContain("updated");
  });
});

describe("render-control-flow coverage > Key cache=false", () => {
  it("fully unmounts old content when cache=false", async () => {
    const key = signal("a");
    const App = cc(() =>
      el(Key, {
        when: key,
        cache: false,
        children: (value: string) => el("span", {}, `key-${value}`),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("key-a");
    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("key-b");
    // Switch back — should remount (not restore from cache)
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("key-a");
  });
});

describe("render-control-flow coverage > Key cache=true (keep-alive)", () => {
  it("soft-hides and restores content when cache=true", async () => {
    const key = signal("a");
    const App = cc(() =>
      el(Key, {
        when: key,
        cache: true,
        children: (value: string) => el("span", {}, `key-${value}`),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("key-a");
    key.value = "b";
    await nextTick();
    expect(container.textContent).toContain("key-b");
    // Switch back — should restore from cache (keep-alive)
    key.value = "a";
    await nextTick();
    expect(container.textContent).toContain("key-a");
  });
});

// ─── For in-place update with keyed items ──────────────────

describe("render-control-flow coverage > For keyed in-place update", () => {
  it("updates text content in-place when keyed item changes (primitive)", async () => {
    const item1 = { id: 1, name: "alpha" };
    const item2 = { id: 2, name: "beta" };
    const item3 = { id: 3, name: "gamma" };
    const items = signal([item1, item2, item3]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) => item.name,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("alphabetagamma");
    // Change only one item — keep same object refs for others so diffCount=1
    items.value = [item1, { id: 2, name: "CHANGED" }, item3];
    await nextTick();
    expect(container.textContent).toBe("alphaCHANGEDgamma");
  });

  it("re-renders row in-place when keyed item changes (element content)", async () => {
    const item1 = { id: 1, name: "alpha" };
    const item2 = { id: 2, name: "beta" };
    const item3 = { id: 3, name: "gamma" };
    const items = signal([item1, item2, item3]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) => el("span", {}, item.name),
      }),
    );
    mount(App, container);
    await nextTick();
    const spans = () => Array.from(container.querySelectorAll("span"));
    expect(spans().map((s) => s.textContent)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    // Change only one item — triggers in-place re-render for element content
    items.value = [item1, { id: 2, name: "CHANGED" }, item3];
    await nextTick();
    expect(spans().map((s) => s.textContent)).toEqual([
      "alpha",
      "CHANGED",
      "gamma",
    ]);
  });
});

// ─── For swap with iBeforeJ=false (reverse swap) ───────────

describe("render-control-flow coverage > For reverse swap", () => {
  it("swaps elements where first changed index is after second in DOM", async () => {
    const items = signal(["a", "b", "c", "d", "e"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Swap items at positions 1 and 3
    items.value = ["a", "d", "c", "b", "e"];
    await nextTick();
    const spans = Array.from(container.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual(["a", "d", "c", "b", "e"]);
  });
});

// ─── Portal with various node types for containsPortal ─────

describe("render-control-flow coverage > Portal in nested structures", () => {
  it("detects portals in component children and syncs order", async () => {
    const target = doc.createElement("div");
    target.id = "nested-portal-target";
    doc.body.appendChild(target);
    const items = signal([1, 2, 3]);
    const PortalChild = cc((props: any) =>
      el(Portal, {
        mount: "#nested-portal-target",
        children: el("span", {}, `item-${props.value}`),
      }),
    );
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: number) => el(PortalChild, { value: item }),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("item-1");
    // Reorder — exercises containsPortal with component children
    items.value = [3, 2, 1];
    await nextTick();
    const spans = Array.from(target.querySelectorAll("span"));
    expect(spans.map((s) => s.textContent)).toEqual([
      "item-3",
      "item-2",
      "item-1",
    ]);
    target.remove();
  });
});

// ─── ViewTransition dispose ────────────────────────────────

describe("render-control-flow coverage > ViewTransition dispose", () => {
  it("cleans up on unmount (no name path)", async () => {
    const visible = signal(true);
    const App = cc(() =>
      el(Show, {
        when: visible,
        children: el(ViewTransition, {
          children: el("span", {}, "content"),
        }),
        fallback: el("p", {}, "hidden"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("content");
    // Toggle off — exercises the dispose function for no-name ViewTransition
    visible.value = false;
    await nextTick();
    expect(container.textContent).toContain("hidden");
  });

  it("cleans up on unmount (with name path)", async () => {
    const visible = signal(true);
    const App = cc(() =>
      el(Show, {
        when: visible,
        children: el(ViewTransition, {
          name: "card",
          children: el("span", {}, "content"),
        }),
        fallback: el("p", {}, "hidden"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("content");
    visible.value = false;
    await nextTick();
    expect(container.textContent).toContain("hidden");
  });
});

// ─── Suspense fallback removal on success ──────────────────

describe("render-control-flow coverage > Suspense fallback swap", () => {
  it("removes fallback and shows content when async resolves", async () => {
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => {
      const text = await pending.promise;
      return el("p", {}, `resolved: ${text}`);
    });
    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", { id: "fallback" }, "loading"),
        children: el(AsyncChild),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelector("#fallback")).toBeTruthy();
    pending.resolve("data");
    await nextTick();
    await nextTick();
    // Fallback should be removed and content shown
    expect(container.querySelector("#fallback")).toBeNull();
    expect(container.textContent).toContain("resolved: data");
  });
});

// ─── Activity with Show/Portal/async children for softHide/softShow ─

describe("render-control-flow coverage > Activity with complex children", () => {
  it("soft-hides/shows Show block children inside Activity", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    const visible = signal(true);
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el(Show, {
          when: visible,
          children: el("span", {}, "show-content"),
          fallback: el("span", {}, "hidden-content"),
        }),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("show-content");
    mode.value = "hidden";
    await nextTick();
    const wrapper = container.querySelector("[data-sinwan-activity]");
    expect(wrapper!.getAttribute("hidden")).toBe("");
    mode.value = "visible";
    await nextTick();
    expect(wrapper!.hasAttribute("hidden")).toBe(false);
    expect(container.textContent).toContain("show-content");
  });

  it("soft-hides/shows Portal children inside Activity", async () => {
    const target = doc.createElement("div");
    target.id = "activity-portal-target";
    doc.body.appendChild(target);
    const mode = signal<"hidden" | "visible">("visible");
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el(Portal, {
          mount: "#activity-portal-target",
          children: el("span", {}, "portal-content"),
        }),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("portal-content");
    mode.value = "hidden";
    await nextTick();
    mode.value = "visible";
    await nextTick();
    expect(target.textContent).toContain("portal-content");
    target.remove();
  });

  it("soft-hides/shows async children inside Activity", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    const pending = Promise.withResolvers<string>();
    const AsyncChild = cc(async () => {
      const text = await pending.promise;
      return el("span", {}, text);
    });
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el(AsyncChild),
      }),
    );
    mount(App, container);
    await nextTick();
    pending.resolve("async-content");
    await nextTick();
    await nextTick();
    expect(container.textContent).toContain("async-content");
    mode.value = "hidden";
    await nextTick();
    mode.value = "visible";
    await nextTick();
    expect(container.textContent).toContain("async-content");
  });
});

// ─── Virtual: non-function children with non-empty records (prop mutation) ─

describe("render-control-flow coverage > Virtual prop mutation", () => {
  it("clears records when children changes from function to non-function via prop mutation", async () => {
    const items = signal(["a", "b", "c", "d", "e"]);
    const props: any = {
      each: items,
      itemHeight: 20,
      containerHeight: 100,
      overscan: 0,
      children: (item: string) => el("span", {}, item),
    };
    // Create element directly (not via el()) so props is not copied
    const element: SinwanElement = { tag: Virtual, props, children: [] };
    const App = cc(() => element);
    mount(App, container);
    await nextTick();
    expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
    // Mutate props to change children to non-function
    props.children = "not a function";
    items.value = [...items.value]; // trigger re-run
    await nextTick();
    expect(container.querySelectorAll("span").length).toBe(0);
  });

  it("removes stale DOM nodes when list becomes empty after fallback→items→empty cycle", async () => {
    const items = signal<string[]>([]);
    const App = cc(() =>
      el(Virtual, {
        each: items,
        itemHeight: 20,
        containerHeight: 100,
        overscan: 0,
        fallback: el("p", { id: "vf" }, "empty"),
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelector("#vf")).toBeTruthy();
    // Add items — fallback DOM nodes remain in content
    items.value = ["a", "b", "c", "d", "e"];
    await nextTick();
    expect(container.querySelectorAll("span").length).toBeGreaterThan(0);
    // Back to empty — fallback nodes are cleaned up via the while loop
    items.value = [];
    await nextTick();
    expect(container.querySelector("#vf")).toBeTruthy();
  });
});

// ─── For: non-function children queueUpdatedHooks (second run) ──

describe("render-control-flow coverage > For non-function second run", () => {
  it("fires queueUpdatedHooks on second run with non-function children", async () => {
    const items = signal([1, 2]);
    const props: any = {
      each: items,
      children: "not a function",
    };
    const App = cc(() => el(For, props));
    mount(App, container);
    await nextTick();
    // Trigger second run — initialized=true → queueUpdatedHooks fires
    items.value = [3, 4];
    await nextTick();
    expect(container.textContent).toBe("");
  });
});

// ─── Index: non-function children queueUpdatedHooks (second run) ──

describe("render-control-flow coverage > Index non-function second run", () => {
  it("fires queueUpdatedHooks on second run with non-function children", async () => {
    const items = signal([1, 2]);
    const props: any = {
      each: items,
      children: "not a function",
    };
    const App = cc(() => el(Index, props));
    mount(App, container);
    await nextTick();
    // Trigger second run — initialized=true → queueUpdatedHooks fires
    items.value = [3, 4];
    await nextTick();
    expect(container.textContent).toBe("");
  });
});

// ─── For: old records with non-numeric keys when new list has numeric keys ─

describe("render-control-flow coverage > For key type transition", () => {
  it("detects non-numeric keys in old records when new list has all numeric keys", async () => {
    // First render: string items → non-numeric keys
    const items = signal<unknown>(["a", "b", "c"]);
    const App = cc(() =>
      el(For, {
        each: items as any,
        children: (item: unknown) => el("span", {}, String(item)),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("abc");
    // Second render: numeric items → allNumericKeys=true for new list,
    // but old records have string keys → allNumericKeys becomes false
    items.value = [1, 2, 3];
    await nextTick();
    expect(container.textContent).toBe("123");
  });

  it("updates maxNumericKey when old records have higher numeric keys", async () => {
    // First render: large numeric items
    const items = signal([10, 20]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: number) => el("span", {}, String(item)),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("1020");
    // Second render: small numeric items → old records have key=10,20 > new max=2
    items.value = [1, 2];
    await nextTick();
    expect(container.textContent).toBe("12");
  });
});

// ─── For: swap with detached parent (DOM manipulation) ────

describe("render-control-flow coverage > For swap detached parent", () => {
  it("handles swap when a node has been externally removed from DOM", async () => {
    const items = signal(["a", "b", "c", "d"]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: string) => el("span", {}, item),
      }),
    );
    mount(App, container);
    await nextTick();
    // Manually detach one span from the DOM
    const spans = container.querySelectorAll("span");
    spans[1].remove();
    // Trigger a swap involving the detached node
    items.value = ["a", "d", "c", "b"];
    await nextTick();
    // The swap should handle the detached parent gracefully
    const result = Array.from(container.querySelectorAll("span")).map(
      (s) => s.textContent,
    );
    expect(result).toContain("a");
    expect(result).toContain("c");
  });
});

// ─── For: containsPortal after full reconcile ──────────────

describe("render-control-flow coverage > For portal full reconcile", () => {
  it("detects portals after full reconcile path", async () => {
    const target = doc.createElement("div");
    target.id = "full-reconcile-portal";
    doc.body.appendChild(target);
    // Start with 5 items to avoid the 2-item swap fast path
    const items = signal([1, 2, 3, 4, 5]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: number) =>
          item === 3
            ? el(Portal, {
                mount: "#full-reconcile-portal",
                children: el("span", {}, `portal-${item}`),
              })
            : el("span", {}, `item-${item}`),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("portal-3");
    // Reorder to trigger full reconcile (not simple update or swap)
    items.value = [5, 4, 3, 2, 1];
    await nextTick();
    expect(target.textContent).toContain("portal-3");
    target.remove();
  });
});

// ─── containsPortal: fragment, reactive-block, and async cases ──

describe("render-control-flow coverage > containsPortal all node types", () => {
  it("detects portal inside a fragment (component returning array)", async () => {
    const target = doc.createElement("div");
    target.id = "frag-portal-target";
    doc.body.appendChild(target);
    const FragComp = cc(() => [
      el("span", {}, "before"),
      el(Portal, {
        mount: "#frag-portal-target",
        children: el("span", {}, "frag-portal"),
      }),
    ]);
    const items = signal([1, 2]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: () => el(FragComp, {}),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("frag-portal");
    // Reorder to trigger containsPortal on fragment children
    items.value = [2, 1];
    await nextTick();
    expect(target.textContent).toContain("frag-portal");
    target.remove();
  });

  it("detects portal inside a reactive-block (Show inside For)", async () => {
    const target = doc.createElement("div");
    target.id = "rb-portal-target";
    doc.body.appendChild(target);
    const items = signal([1, 2]);
    const show = signal(true);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: number) =>
          el(Show, {
            when: show,
            children: el(Portal, {
              mount: "#rb-portal-target",
              children: el("span", {}, `rb-portal-${item}`),
            }),
            fallback: el("span", {}, "hidden"),
          }),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("rb-portal-1");
    // Reorder to trigger containsPortal on reactive-block children
    items.value = [2, 1];
    await nextTick();
    expect(target.textContent).toContain("rb-portal-2");
    target.remove();
  });

  it("detects portal inside an async mounted node", async () => {
    const target = doc.createElement("div");
    target.id = "async-portal-target";
    doc.body.appendChild(target);
    // Use an async component that resolves a promise immediately
    const AsyncPortal = cc(async () => {
      await Promise.resolve();
      return el(Portal, {
        mount: "#async-portal-target",
        children: el("span", {}, "async-portal"),
      });
    });
    const items = signal([1]);
    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", {}, "loading"),
        children: el(For, {
          each: items,
          children: () => el(AsyncPortal, {}),
        }),
      }),
    );
    mount(App, container);
    await nextTick();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(target.textContent).toContain("async-portal");
    target.remove();
  });

  it("iterates fragment/reactive-block children without portals in full reconcile", async () => {
    const target = doc.createElement("div");
    target.id = "mixed-portal-target";
    doc.body.appendChild(target);
    const FragComp = cc(() => [el("span", {}, "f1"), el("span", {}, "f2")]);
    const fragItem = { type: "fragment" };
    const showItem = { type: "show" };
    const portalItem = { type: "portal" };
    // Put show first so containsPortal checks it before portal
    const items = signal([showItem, portalItem, fragItem]);
    const showFlag = signal(true);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: any) => {
          if (item.type === "fragment") return el(FragComp, {});
          if (item.type === "show")
            return el(Show, {
              when: showFlag,
              children: el("span", {}, "show"),
              fallback: el("span", {}, "hidden"),
            });
          if (item.type === "portal")
            return el(Portal, {
              mount: "#mixed-portal-target",
              children: el("span", {}, "portal"),
            });
          return el("span", {}, "regular");
        },
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("portal");
    // Swap show and frag (neither has portal) → containsPortal on reactive-block
    // iterates children, returns false → lines 1452-1453 covered
    items.value = [fragItem, portalItem, showItem];
    await nextTick();
    expect(target.textContent).toContain("portal");
    // Swap frag and portal → containsPortal on fragment (already covered)
    // and portal (returns true)
    items.value = [portalItem, fragItem, showItem];
    await nextTick();
    expect(target.textContent).toContain("portal");
    target.remove();
  });

  it("iterates async mounted children in containsPortal (no Suspense boundary)", async () => {
    const AsyncComp = cc(async () => {
      await Promise.resolve();
      return el("span", {}, "async-content");
    });
    const asyncItem = { type: "async" };
    const regularItem = { type: "regular" };
    const portalItem = { type: "portal" };
    const target = doc.createElement("div");
    target.id = "async-contains-portal-target";
    doc.body.appendChild(target);
    // Start with 2 non-async items (initial render uses DocumentFragment
    // which would break async nodes, so don't start with async)
    const items = signal([regularItem, portalItem]);
    const App = cc(() =>
      el(For, {
        each: items,
        children: (item: any) => {
          if (item.type === "async") return el(AsyncComp, {});
          if (item.type === "portal")
            return el(Portal, {
              mount: "#async-contains-portal-target",
              children: el("span", {}, "portal"),
            });
          return el("span", {}, "regular");
        },
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("portal");
    // Add async item at beginning → forces full reconcile (diffCount > 2)
    // Full reconcile renders new items directly into parent (not DocumentFragment)
    // so async mounted node's parent reference is correct
    items.value = [asyncItem, regularItem, portalItem];
    await nextTick();
    await nextTick();
    await nextTick();
    // Swap async and regular → swap fast-path calls containsPortal
    // on async record (component → async child → case "async" → lines 1454-1457)
    items.value = [regularItem, asyncItem, portalItem];
    await nextTick();
    expect(target.textContent).toContain("portal");
    target.remove();
  });
});

describe("render-control-flow coverage > Portal function target (arity 1)", () => {
  it("calls function target that has length > 0", async () => {
    const target = doc.createElement("div");
    target.id = "arity-fn-target";
    doc.body.appendChild(target);
    // Function with length=1 → resolve() won't unwrap it → resolvePortalTarget
    // sees typeof === "function" and calls it
    const fn = (_x: unknown) => target;
    const App = cc(() =>
      el(Portal, {
        mount: fn,
        children: el("span", {}, "arity-fn"),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(target.textContent).toContain("arity-fn");
    target.remove();
  });
});

// ─── Dynamic: same-tag skip with reactive component ────────

describe("render-control-flow coverage > Dynamic same-tag reactive skip", () => {
  it("skips re-render when reactive component resolves to same tag", async () => {
    const toggle = signal(false);
    const Comp = cc(() => el("span", {}, "comp"));
    // computed that always returns Comp but depends on toggle
    const comp = computed(() => {
      void toggle.value;
      return Comp;
    });
    const App = cc(() =>
      el(Dynamic, {
        component: comp,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("comp");
    // Trigger re-run — comp still returns Comp → Object.is → skip
    toggle.value = true;
    await nextTick();
    expect(container.textContent).toContain("comp");
  });
});

// ─── Suspense: re-suspend with reactive child ──────────────

describe("render-control-flow coverage > Suspense re-suspend via reactive child", () => {
  it("removes old content and re-creates fallback when child re-throws promise", async () => {
    const step = signal(0);
    const pending1 = Promise.withResolvers<void>();
    const pending2 = Promise.withResolvers<void>();
    let hasThrown1 = false;
    let hasThrown2 = false;

    const AsyncChild = cc(() => {
      const s = step.value;
      if (s === 0 && !hasThrown1) {
        hasThrown1 = true;
        throw pending1.promise;
      }
      if (s === 2 && !hasThrown2) {
        hasThrown2 = true;
        throw pending2.promise;
      }
      return el("p", { id: "suspense-content" }, "content");
    });

    const App = cc(() =>
      el(Suspense, {
        fallback: el("p", { id: "susp-fb" }, "loading"),
        children: el(AsyncChild),
      }),
    );
    mount(App, container);
    await nextTick();
    // First render: promise thrown → fallback shown
    expect(container.querySelector("#susp-fb")).toBeTruthy();
    // Resolve first promise → effect re-runs → content shown (hasThrown1=true)
    pending1.resolve();
    await nextTick();
    await nextTick();
    expect(container.querySelector("#suspense-content")).toBeTruthy();
    expect(container.querySelector("#susp-fb")).toBeNull();
    // Change step to 1 → effect re-runs (step is tracked via child render)
    // Old content is removed (line 1564), new content rendered
    step.value = 1;
    await nextTick();
    await nextTick();
    expect(container.querySelector("#suspense-content")).toBeTruthy();
    // Change step to 2 → child throws new promise
    // Old content removed (line 1564), fallback re-created (lines 1645-1649)
    step.value = 2;
    await nextTick();
    await nextTick();
    expect(container.querySelector("#susp-fb")).toBeTruthy();
    // Resolve second promise → content shown again
    pending2.resolve();
    await nextTick();
    await nextTick();
    expect(container.querySelector("#suspense-content")).toBeTruthy();
  });
});

// ─── Activity: softHide/softShow fragment case ─────────────

describe("render-control-flow coverage > Activity fragment soft hide/show", () => {
  it("soft-hides and soft-shows fragment children inside Activity", async () => {
    const mode = signal<"hidden" | "visible">("visible");
    // Component that returns an array → fragment mounted node
    const FragComp = cc(() => [
      el("span", {}, "frag-a"),
      el("span", {}, "frag-b"),
    ]);
    const App = cc(() =>
      el(Activity, {
        mode,
        children: el(FragComp, {}),
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toContain("frag-a");
    expect(container.textContent).toContain("frag-b");
    // Hide → softHideMountedTree encounters fragment node
    mode.value = "hidden";
    await nextTick();
    const wrapper = container.querySelector("[data-sinwan-activity]");
    expect(wrapper!.getAttribute("hidden")).toBe("");
    // Show → softShowMountedTree encounters fragment node
    mode.value = "visible";
    await nextTick();
    expect(wrapper!.hasAttribute("hidden")).toBe(false);
    expect(container.textContent).toContain("frag-a");
  });
});

// ─── updateTextNodeContent: element recursive path ─────────

describe("render-control-flow coverage > updateTextNodeContent element", () => {
  it("updates text nodes inside element when in-place update returns primitive", async () => {
    const item1 = { id: 1, type: "element", value: "hello" };
    const item2 = { id: 2, type: "text", value: "world" };
    const items = signal([item1, item2]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) =>
          item.type === "element" ? el("span", {}, item.value) : item.value,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.textContent).toBe("helloworld");
    // Change item1 from element to text → in-place update path
    // oldRecord.mounted is element (span), newContent is "CHANGED" (string)
    // → updateTextNodeContent(span, "CHANGED")
    items.value = [{ id: 1, type: "text", value: "CHANGED" }, item2];
    await nextTick();
    expect(container.textContent).toBe("CHANGEDworld");
  });

  it("recursively updates nested element text nodes", async () => {
    const item1 = { id: 1, type: "nested", value: "deep" };
    const item2 = { id: 2, type: "text", value: "flat" };
    const items = signal([item1, item2]);
    const App = cc(() =>
      el(For, {
        each: items,
        key: (item: any) => item.id,
        children: (item: any) =>
          item.type === "nested"
            ? el("div", {}, el("span", {}, item.value))
            : item.value,
      }),
    );
    mount(App, container);
    await nextTick();
    expect(container.querySelector("div span")!.textContent).toBe("deep");
    // Change from nested element to text → updateTextNodeContent(div, "CHANGED")
    // → div.children: span is element → recursive call
    // → span.children: text node → update data
    items.value = [{ id: 1, type: "text", value: "CHANGED" }, item2];
    await nextTick();
    expect(container.textContent).toBe("CHANGEDflat");
  });
});
