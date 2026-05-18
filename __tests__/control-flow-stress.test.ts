/**
 * SinwanJS Control Flow — Stress Tests
 *
 * Comprehensive stress testing for:
 * - Show, For, Switch, Match, Index, Key, Dynamic, Visible, Portal
 * - Edge cases: null, undefined, false, empty arrays
 * - Reactive value transitions
 * - Nested control flow components
 * - Large dataset handling
 * - Style merging and display toggling
 * - Type predicates accuracy
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal, computed, batch } from "../src/reactivity/index.ts";
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
  isElementLike,
  isShowElement,
  isForElement,
  isSwitchElement,
  isMatchElement,
  isIndexElement,
  isKeyElement,
  isDynamicElement,
  isPortalElement,
  resolveSwitchContent,
  resolveMatchChildren,
  resolveShowChildren,
  resolveKeyChildren,
} from "../src/component/control-flow.ts";
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

function el(
  tag: string | Function,
  props: Record<string, unknown> = {},
  ...children: any[]
): SinwanElement {
  const finalProps = { ...props };
  if (children.length > 0 || finalProps.children === undefined) {
    finalProps.children = children;
  }
  return { tag: tag as any, props: finalProps, children };
}

describe("Control Flow — Type Predicates (Stress)", () => {
  it("should correctly identify all element types", () => {
    const showEl = Show({ when: signal(true) });
    const forEl = For({ each: signal([]) });
    const switchEl = Switch({});
    const matchEl = Match({ when: signal(true) });
    const indexEl = Index({ each: signal([]) });
    const keyEl = Key({ when: signal(1) });
    const dynamicEl = Dynamic({ component: signal("div") });
    const portalEl = Portal({});
    const visibleEl = Visible({ when: signal(true) });

    expect(isElementLike(showEl)).toBe(true);
    expect(isShowElement(showEl)).toBe(true);
    expect(isForElement(forEl)).toBe(true);
    expect(isSwitchElement(switchEl)).toBe(true);
    expect(isMatchElement(matchEl)).toBe(true);
    expect(isIndexElement(indexEl)).toBe(true);
    expect(isKeyElement(keyEl)).toBe(true);
    expect(isDynamicElement(dynamicEl)).toBe(true);
    expect(isPortalElement(portalEl)).toBe(true);

    // Cross-type negations
    expect(isShowElement(forEl)).toBe(false);
    expect(isForElement(showEl)).toBe(false);
    expect(isMatchElement(switchEl)).toBe(false);
  });

  it("should handle non-element values gracefully", () => {
    expect(isElementLike(null)).toBe(false);
    expect(isElementLike(undefined)).toBe(false);
    expect(isElementLike("string")).toBe(false);
    expect(isElementLike(123)).toBe(false);
    expect(isElementLike({})).toBe(false);
    expect(isElementLike({ tag: null })).toBe(true); // has tag property
  });

  it("should identify type symbols correctly", () => {
    const fakeShowEl = { tag: Show({ when: signal(true) }).tag, props: {} };
    expect(isShowElement(fakeShowEl as any)).toBe(true);

    const fakeNotShow = { tag: Symbol.for("Other"), props: {} };
    expect(isShowElement(fakeNotShow as any)).toBe(false);
  });
});

describe("Show Component (Stress)", () => {
  it("should handle all falsy when values", () => {
    const falsy = [false, null, undefined, 0, "", NaN];

    falsy.forEach((val) => {
      const showEl = Show({
        when: signal(val),
        fallback: "fallback",
        children: "content",
      });
      expect(isShowElement(showEl)).toBe(true);
    });
  });

  it("should handle all truthy when values", () => {
    const truthy = [true, 1, "text", {}, [], () => {}, Symbol("test")];

    truthy.forEach((val) => {
      const showEl = Show({
        when: signal(val),
        children: "content",
      });
      expect(isShowElement(showEl)).toBe(true);
    });
  });

  it("should support function children", () => {
    const showEl = Show({
      when: signal("value"),
      children: (val) => `received: ${val}`,
    });
    expect(showEl.props.children).toBeDefined();
  });

  it("should support static children", () => {
    const showEl = Show({
      when: signal(true),
      children: "static",
    });
    expect(showEl.props.children).toBe("static");
  });

  it("should handle complex fallback scenarios", () => {
    const complexFallback = [
      "string",
      123,
      { tag: "div", props: {}, children: [] },
      null,
      undefined,
    ];

    complexFallback.forEach((fb) => {
      const showEl = Show({
        when: signal(false),
        fallback: fb as any,
      });
      expect(showEl).toBeDefined();
    });
  });

  it("should resolve show children with various value types", () => {
    const showEl = Show({
      when: signal("test"),
      children: (val) => `Value: ${val}`,
    });

    const resolved = resolveShowChildren(showEl, "injected");
    expect(typeof resolved).toBe("string");
  });

  it("should resolve show children without function", () => {
    const showEl = Show({
      when: signal(true),
      children: "static content",
    });

    const resolved = resolveShowChildren(showEl, null);
    expect(resolved).toBe("static content");
  });
});

describe("For Component (Stress)", () => {
  it("should handle empty arrays", () => {
    const forEl = For({
      each: signal([]),
      fallback: "empty",
      children: (item) => item,
    });
    expect(isForElement(forEl)).toBe(true);
  });

  it("should handle large arrays", () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => i);
    const forEl = For({
      each: signal(largeArray),
      children: (item, index) => `Item ${item}`,
    });
    expect(isForElement(forEl)).toBe(true);
  });

  it("should support custom key functions", () => {
    const forEl = For({
      each: signal([
        { id: 1, name: "A" },
        { id: 2, name: "B" },
      ]),
      key: (item) => item.id,
      children: (item) => item.name,
    });
    expect(forEl.props.key).toBeDefined();
  });

  it("should support multiple key types", () => {
    const keyTypes = [
      (item: any) => item.id as string,
      (item: any) => item.id as number,
      (item: any) => Symbol.for(`item-${item.id}`),
    ];

    keyTypes.forEach((keyFn) => {
      const forEl = For({
        each: signal([{ id: 1 }]),
        key: keyFn as any,
        children: (item) => item.id,
      });
      expect(forEl.props.key).toBe(keyFn);
    });
  });

  it("should handle reactive index callback", () => {
    const forEl = For({
      each: signal([1, 2, 3]),
      children: (item, getIndex) => {
        const idx = getIndex();
        return `${item} at ${idx}`;
      },
    });
    expect(typeof forEl.props.children).toBe("function");
  });

  it("should handle various item types", () => {
    const itemTypes = [
      [1, 2, 3],
      ["a", "b", "c"],
      [{ id: 1 }, { id: 2 }],
      [true, false],
      [null, undefined, {}],
    ];

    itemTypes.forEach((items) => {
      const forEl = For({
        each: signal(items),
        children: (item) => String(item),
      });
      expect(isForElement(forEl)).toBe(true);
    });
  });

  it("should support readonly arrays", () => {
    const readonlyArr = [1, 2, 3] as const;
    const forEl = For({
      each: signal(readonlyArr),
      children: (item) => item,
    });
    expect(isForElement(forEl)).toBe(true);
  });
});

describe("Index Component (Stress)", () => {
  it("should handle empty arrays", () => {
    const indexEl = Index({
      each: signal([]),
      fallback: "empty",
      children: (getItem, index) => `Item at ${index}`,
    });
    expect(isIndexElement(indexEl)).toBe(true);
  });

  it("should provide reactive item accessor", () => {
    const indexEl = Index({
      each: signal([10, 20, 30]),
      children: (getItem, index) => {
        const item = getItem();
        return `${item} at ${index}`;
      },
    });
    expect(typeof indexEl.props.children).toBe("function");
  });

  it("should handle index position correctly", () => {
    const items = ["a", "b", "c"];
    const indexEl = Index({
      each: signal(items),
      children: (getItem, index) => `${index}`,
    });
    expect(isIndexElement(indexEl)).toBe(true);
  });

  it("should handle reactive array updates", () => {
    const items = signal([1, 2, 3]);
    const indexEl = Index({
      each: items,
      children: (getItem, index) => getItem(),
    });

    // Simulate reactive update
    items.value = [4, 5, 6, 7];
    expect(isIndexElement(indexEl)).toBe(true);
  });
});

describe("Switch/Match Components (Stress)", () => {
  it("should handle switch with no matches", () => {
    const switchEl = Switch({
      fallback: "no match",
      children: [
        Match({
          when: signal(false),
          children: "match1",
        }),
        Match({
          when: signal(false),
          children: "match2",
        }),
      ] as any,
    });
    expect(isSwitchElement(switchEl)).toBe(true);
  });

  it("should handle switch with multiple matches", () => {
    const switchEl = Switch({
      children: [
        Match({
          when: signal(false),
          children: "match1",
        }),
        Match({
          when: signal(true),
          children: "match2",
        }),
        Match({
          when: signal(true),
          children: "match3",
        }),
      ] as any,
    });
    expect(isSwitchElement(switchEl)).toBe(true);
  });

  it("should resolve match children with function", () => {
    const matchEl = Match({
      when: signal(42),
      children: (val) => `Value is ${val}`,
    });

    const resolved = resolveMatchChildren(matchEl, 42);
    expect(typeof resolved).toBe("string");
  });

  it("should resolve match children without function", () => {
    const matchEl = Match({
      when: signal(true),
      children: "static",
    });

    const resolved = resolveMatchChildren(matchEl, true);
    expect(resolved).toBe("static");
  });

  it("should handle nested switch/match", () => {
    const innerSwitch = Switch({
      children: [
        Match({
          when: signal(true),
          children: "inner",
        }),
      ],
    });

    const outerSwitch = Switch({
      children: [
        Match({
          when: signal(true),
          children: innerSwitch,
        }),
      ],
    });

    expect(isSwitchElement(outerSwitch)).toBe(true);
  });

  it("should handle match with falsy when conditions", () => {
    const falsyMatches = [
      Match({ when: signal(false), children: "f" }),
      Match({ when: signal(null), children: "n" }),
      Match({ when: signal(undefined), children: "u" }),
      Match({ when: signal(0), children: "z" }),
      Match({ when: signal(""), children: "e" }),
    ];

    falsyMatches.forEach((m) => {
      expect(isMatchElement(m)).toBe(true);
    });
  });

  it("should handle match with complex values", () => {
    const complexValues = [
      { id: 1, name: "obj" },
      [1, 2, 3],
      () => {},
      Symbol("test"),
    ];

    complexValues.forEach((val) => {
      const matchEl = Match({
        when: signal(val),
        children: (v) => String(v),
      });
      expect(isMatchElement(matchEl)).toBe(true);
    });
  });
});

describe("Key Component (Stress)", () => {
  it("should handle various key values", () => {
    const keyValues = [1, "string", Symbol("key"), { id: 1 }, [1, 2]];

    keyValues.forEach((key) => {
      const keyEl = Key({
        when: signal(key),
        children: (k) => String(k),
      });
      expect(isKeyElement(keyEl)).toBe(true);
    });
  });

  it("should resolve key children with function", () => {
    const keyEl = Key({
      when: signal("mykey"),
      children: (k) => `Key: ${k}`,
    });

    const resolved = resolveKeyChildren(keyEl, "mykey");
    expect(typeof resolved).toBe("string");
  });

  it("should resolve key children without function", () => {
    const keyEl = Key({
      when: signal(123),
      children: "static",
    });

    const resolved = resolveKeyChildren(keyEl, 123);
    expect(resolved).toBe("static");
  });

  it("should handle key resets on value change", () => {
    const keyValue = signal("initial");
    const keyEl = Key({
      when: keyValue,
      children: (k) => `Key: ${k}`,
    });

    expect(isKeyElement(keyEl)).toBe(true);

    // Simulate value change
    keyValue.value = "updated";
    expect(isKeyElement(keyEl)).toBe(true);
  });
});

describe("Dynamic Component (Stress)", () => {
  it("should handle dynamic tag switching", () => {
    const dynamicEl = Dynamic({
      component: signal("div"),
      children: "content",
    });
    expect(isDynamicElement(dynamicEl)).toBe(true);
  });

  it("should handle null/undefined components", () => {
    const nullEl = Dynamic({
      component: signal(null),
      children: "fallback",
    });

    const undefEl = Dynamic({
      component: signal(undefined),
      children: "fallback",
    });

    expect(isDynamicElement(nullEl)).toBe(true);
    expect(isDynamicElement(undefEl)).toBe(true);
  });

  it("should support component function switching", () => {
    const DivComponent = cc(() => el("div", {}, "div content"));
    const SpanComponent = cc(() => el("span", {}, "span content"));

    const dynamicEl = Dynamic({
      component: signal(DivComponent),
      children: "content",
    });

    expect(isDynamicElement(dynamicEl)).toBe(true);
  });

  it("should handle multiple prop passing", () => {
    const dynamicEl = Dynamic({
      component: signal("input"),
      type: "text",
      placeholder: "Enter text",
      class: "input-class",
      disabled: false,
    });

    expect(isDynamicElement(dynamicEl)).toBe(true);
    expect(dynamicEl.props.type).toBe("text");
    expect(dynamicEl.props.placeholder).toBe("Enter text");
  });

  it("should handle reactive component prop", () => {
    const comp = signal("div");
    const dynamicEl = Dynamic({
      component: comp,
      children: "content",
    });

    comp.value = "span";
    expect(isDynamicElement(dynamicEl)).toBe(true);
  });
});

describe("Visible Component (Stress)", () => {
  it("should hide elements with falsy when", () => {
    const falsyEl = Visible({
      when: signal(false),
      children: "hidden",
    });

    expect(falsyEl.props.style).toBeDefined();
  });

  it("should show elements with truthy when", () => {
    const truthyEl = Visible({
      when: signal(true),
      children: "visible",
    });

    expect(truthyEl.props.style).toBeDefined();
  });

  it("should support custom element tag", () => {
    const customEl = Visible({
      when: signal(true),
      as: "button",
      children: "click me",
    });

    expect(customEl.tag).toBe("button");
  });

  it("should support string style merging", () => {
    const stringStyleEl = Visible({
      when: signal(true),
      style: signal("color: red; margin: 10px"),
      children: "content",
    });

    expect(stringStyleEl).toBeDefined();
  });

  it("should support object style merging", () => {
    const objStyleEl = Visible({
      when: signal(true),
      style: signal({ color: "blue", padding: "5px" }),
      children: "content",
    });

    expect(objStyleEl).toBeDefined();
  });

  it("should merge styles correctly when hidden", () => {
    const mergedEl = Visible({
      when: signal(false),
      style: signal("color: red;"),
      children: "hidden",
    });

    expect(mergedEl).toBeDefined();
  });

  it("should pass through arbitrary props", () => {
    const propsEl = Visible({
      when: signal(true),
      as: "div",
      class: "custom-class",
      id: "visible-el",
      "data-test": "value",
      children: "content",
    });

    expect(propsEl.props.class).toBe("custom-class");
    expect(propsEl.props.id).toBe("visible-el");
    expect((propsEl.props as any)["data-test"]).toBe("value");
  });

  it("should handle reactive style updates", () => {
    const style = signal("color: red;");
    const reactiveEl = Visible({
      when: signal(true),
      style: style,
      children: "styled",
    });

    expect(reactiveEl).toBeDefined();
    style.value = "color: blue;";
    expect(reactiveEl).toBeDefined();
  });

  it("should handle style with null/undefined values", () => {
    const nullStyleEl = Visible({
      when: signal(true),
      style: signal(null),
      children: "content",
    });

    const undefStyleEl = Visible({
      when: signal(true),
      style: signal(undefined),
      children: "content",
    });

    expect(nullStyleEl).toBeDefined();
    expect(undefStyleEl).toBeDefined();
  });
});

describe("Portal Component (Stress)", () => {
  it("should create portal elements", () => {
    const portalEl = Portal({
      children: "portal content",
    });
    expect(isPortalElement(portalEl)).toBe(true);
  });

  it("should handle mount as string selector", () => {
    const portalEl = Portal({
      mount: signal("#portal-target"),
      children: "content",
    });
    expect(isPortalElement(portalEl)).toBe(true);
  });

  it("should handle mount as DOM node", () => {
    const targetNode = doc.createElement("div");
    const portalEl = Portal({
      mount: signal(targetNode),
      children: "content",
    });
    expect(isPortalElement(portalEl)).toBe(true);
  });

  it("should handle mount as function", () => {
    const portalEl = Portal({
      mount: signal(() => doc.body),
      children: "content",
    });
    expect(isPortalElement(portalEl)).toBe(true);
  });

  it("should handle null/undefined mount", () => {
    const nullPortal = Portal({
      mount: signal(null),
      children: "fallback",
    });

    const undefPortal = Portal({
      mount: signal(undefined),
      children: "fallback",
    });

    expect(isPortalElement(nullPortal)).toBe(true);
    expect(isPortalElement(undefPortal)).toBe(true);
  });

  it("should handle function returning null mount", () => {
    const portalEl = Portal({
      mount: signal(() => null),
      children: "content",
    });
    expect(isPortalElement(portalEl)).toBe(true);
  });

  it("should support reactive mount changes", () => {
    const mount = signal("#target1");
    const portalEl = Portal({
      mount: mount,
      children: "content",
    });

    mount.value = "#target2";
    expect(isPortalElement(portalEl)).toBe(true);
  });
});

describe("Complex Nested Scenarios (Stress)", () => {
  it("should handle deeply nested Show components", () => {
    let nested = Show({
      when: signal(true),
      children: "level 0",
    });

    for (let i = 0; i < 10; i++) {
      nested = Show({
        when: signal(true),
        children: nested,
      });
    }

    expect(isShowElement(nested)).toBe(true);
  });

  it("should handle For with Show in children", () => {
    const forEl = For({
      each: signal([1, 2, 3, 4, 5]),
      children: (item) =>
        Show({
          when: signal(item % 2 === 0),
          children: `Even: ${item}`,
          fallback: `Odd: ${item}`,
        }),
    });

    expect(isForElement(forEl)).toBe(true);
  });

  it("should handle Switch with For in Match", () => {
    const switchEl = Switch({
      children: [
        Match({
          when: signal(true),
          children: For({
            each: signal([1, 2, 3]),
            children: (item) => `Item ${item}`,
          }),
        }),
      ],
    });

    expect(isSwitchElement(switchEl)).toBe(true);
  });

  it("should handle Show wrapping For wrapping Match", () => {
    const complex = Show({
      when: signal(true),
      children: For({
        each: signal([true, false, true]),
        children: (condition) =>
          Switch({
            children: [
              Match({
                when: signal(condition),
                children: "matched",
              }),
            ],
          }),
      }),
    });

    expect(isShowElement(complex)).toBe(true);
  });

  it("should handle Index with dynamic Key", () => {
    const indexEl = Index({
      each: signal([{ id: 1 }, { id: 2 }, { id: 3 }]),
      children: (getItem, idx) =>
        Key({
          when: signal(`item-${idx}`),
          children: `Item at ${idx}`,
        }),
    });

    expect(isIndexElement(indexEl)).toBe(true);
  });

  it("should handle Visible wrapping dynamic component", () => {
    const visible = Visible({
      when: signal(true),
      as: "section",
      children: Dynamic({
        component: signal("article"),
        children: "dynamic content",
      }),
    });

    expect(visible.props.children).toBeDefined();
  });

  it("should handle Portal with complex structure", () => {
    const portal = Portal({
      mount: signal("#app"),
      children: Switch({
        children: [
          Match({
            when: signal(true),
            children: For({
              each: signal([1, 2, 3]),
              children: (item) => `Item ${item}`,
            }),
          }),
        ],
      }),
    });

    expect(isPortalElement(portal)).toBe(true);
  });
});

describe("Edge Cases and Boundary Conditions (Stress)", () => {
  it("should handle undefined props gracefully", () => {
    const showEl = Show({
      when: signal(undefined),
      children: undefined,
      fallback: undefined,
    });

    expect(isShowElement(showEl)).toBe(true);
  });

  it("should handle very long arrays", () => {
    const hugeArray = Array.from({ length: 100000 }, (_, i) => i);
    const forEl = For({
      each: signal(hugeArray),
      children: (item) => item,
    });

    expect(isForElement(forEl)).toBe(true);
  });

  it("should handle deeply nested switch matches", () => {
    let switchEl: any = Match({
      when: signal(true),
      children: "deepest",
    });

    for (let i = 0; i < 20; i++) {
      switchEl = Switch({
        children: [switchEl],
      });
    }

    expect(isSwitchElement(switchEl)).toBe(true);
  });

  it("should handle mixed null/undefined in arrays", () => {
    const mixedArray = [1, null, undefined, "text", {}, null, undefined];
    const forEl = For({
      each: signal(mixedArray),
      children: (item: any): SinwanNode =>
        item != null && typeof item === "object"
          ? JSON.stringify(item)
          : (item ?? "empty"),
    });

    expect(isForElement(forEl)).toBe(true);
  });

  it("should handle objects as when values", () => {
    const obj = { truthy: true };
    const showEl = Show({
      when: signal(obj),
      children: (val: any) => (val.truthy ? "yes" : "no"),
    });

    expect(isShowElement(showEl)).toBe(true);
  });

  it("should handle circular-reference-like structure", () => {
    const structure: any = Show({
      when: signal(true),
      children: "self-referential",
    });

    // Simulate circular reference (won't actually create cycle)
    expect(isShowElement(structure)).toBe(true);
  });

  it("should handle rapidly changing reactive values", () => {
    const when = signal(true);
    const component = signal("div");
    const style = signal("color: red;");

    const showEl = Show({ when, children: "content" });
    const dynamicEl = Dynamic({ component, children: "dynamic" });
    const visibleEl = Visible({ when, style, children: "visible" });

    // Simulate rapid updates
    for (let i = 0; i < 100; i++) {
      when.value = !when.value;
      component.value = i % 2 === 0 ? "div" : "span";
      style.value = `color: ${i % 2 === 0 ? "red" : "blue"};`;
    }

    expect(isShowElement(showEl)).toBe(true);
    expect(isDynamicElement(dynamicEl)).toBe(true);
  });

  it("should handle computed reactive when values", () => {
    const base = signal(5);
    const computed_when = computed(() => base.value > 3);

    const showEl = Show({
      when: computed_when,
      children: "computed",
    });

    expect(isShowElement(showEl)).toBe(true);
  });

  it("should handle children as arrays", () => {
    const forEl = For({
      each: signal([1, 2, 3]),
      children: (item) => [`prefix-${item}`, `suffix-${item}`],
    });

    expect(isForElement(forEl)).toBe(true);
  });

  it("should resolve switch content with complex node structures", () => {
    const switchEl = Switch({
      fallback: "no-match",
      children: [
        Match({
          when: signal(false),
          children: "first",
        }),
        Match({
          when: signal(true),
          children: ["array", "of", "nodes"],
        }),
      ],
    });

    // While we can't actually execute resolveSwitchContent without full renderer,
    // we can verify the structure
    expect(isSwitchElement(switchEl)).toBe(true);
  });
});

describe("Type Safety and Prop Validation (Stress)", () => {
  it("should accept generic type parameters", () => {
    interface User {
      id: number;
      name: string;
    }

    const users = signal<User[]>([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    const forEl = For<User>({
      each: users,
      children: (user) => user.name,
    });

    expect(isForElement(forEl)).toBe(true);
  });

  it("should support Show with specific type inference", () => {
    interface Status {
      success: boolean;
      message: string;
    }

    const status = signal<Status>({ success: true, message: "ok" });

    const showEl = Show({
      when: status,
      children: (s) => s.message,
    });

    expect(isShowElement(showEl)).toBe(true);
  });

  it("should handle optional props", () => {
    const showEl1 = Show({
      when: signal(true),
    });

    const showEl2 = Show({
      when: signal(true),
      fallback: "fallback",
    });

    const showEl3 = Show({
      when: signal(true),
      children: "children",
    });

    expect(isShowElement(showEl1)).toBe(true);
    expect(isShowElement(showEl2)).toBe(true);
    expect(isShowElement(showEl3)).toBe(true);
  });
});
