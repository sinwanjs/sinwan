import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { effect, nextTick } from "../src/reactivity/index.ts";
import { mount } from "../src/renderer/mount.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { cc } from "../src/component/create.ts";
import {
  createLiveProps,
  createLiveRest,
  getRawProps,
  getSpreadProps,
  isLiveProps,
} from "../src/component/live-props.ts";
import {
  createComponentInstance,
  softHideInstance,
  softShowInstance,
} from "../src/component/instance.ts";
import { onMounted } from "../src/component/lifecycle.ts";
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
  tag: string | ((props: never) => unknown),
  props: Record<string, unknown> = {},
  ...children: SinwanNode[]
): SinwanElement {
  return { tag: tag as never, props: { ...props, children }, children };
}

describe("createLiveProps", () => {
  it("returns non-objects unchanged", () => {
    expect(createLiveProps(undefined as never)).toBeUndefined();
    expect(createLiveRest(null as never, [])).toBeNull();
  });

  it("unwraps getters, keeps plain values, and treats omitted as absent", () => {
    const raw: Record<string, unknown> = {
      plain: "sinwan",
      fromGetter: () => "vue",
    };
    const props = createLiveProps(raw);
    expect(isLiveProps(props)).toBe(true);
    expect(isLiveProps(raw)).toBe(false);
    expect("plain" in props).toBe(true);
    expect("fromGetter" in props).toBe(true);
    expect("empty" in props).toBe(false);
    expect(props.plain).toBe("sinwan");
    expect(props.fromGetter).toBe("vue");
    expect(props.empty).toBeUndefined();
    expect(getRawProps(props)).toBe(raw);
    expect(getRawProps(raw)).toBe(raw);
    expect(createLiveProps(props)).toBe(props);
    expect(createLiveProps(raw)).toBe(props);
    expect(Object.getPrototypeOf(props)).toBe(Object.getPrototypeOf(raw));
  });

  it("does not unwrap Signal objects or arity>0 callbacks", () => {
    const count = signal(1);
    let clicks = 0;
    const onclick = (n: number) => {
      clicks += n;
    };
    const props = createLiveProps({
      count,
      onclick,
    });
    expect(props.count).toBe(count);
    expect(props.onclick).toBe(onclick);
    props.onclick(2);
    expect(clicks).toBe(2);
  });

  it("does not invoke on* callbacks, including zero-arity onclick", () => {
    let clicks = 0;
    let changes = 0;
    const onclick = () => {
      clicks += 1;
    };
    const onValueChange = () => {
      changes += 1;
    };
    const onx = () => "not-an-event";
    const on = () => "short";
    const skip = Symbol("skip");
    const raw: Record<PropertyKey, unknown> = {
      onclick,
      onValueChange,
      onx,
      on,
      open: () => true,
      [skip]: () => "sym",
    };
    const props = createLiveProps(raw);
    expect(props.onclick).toBe(onclick);
    expect(props.onValueChange).toBe(onValueChange);
    expect(props.onx).toBe("not-an-event");
    expect(props.on).toBe("short");
    expect(props.open).toBe(true);
    expect(props[skip]).toBe("sym");
    expect(clicks).toBe(0);
    expect(changes).toBe(0);
    expect(Object.getOwnPropertyDescriptor(props, "onclick")?.value).toBe(
      onclick,
    );
    expect(
      Object.getOwnPropertyDescriptor(props, "onValueChange")?.value,
    ).toBe(onValueChange);
    expect(Object.getOwnPropertyDescriptor(props, "open")?.value).toBe(true);
    if (typeof props.onclick === "function") props.onclick();
    expect(clicks).toBe(1);
  });

  it("sets, defines, deletes, and lists own keys on the raw bag", () => {
    const raw: Record<string, unknown> = { a: 1 };
    const props = createLiveProps(raw);
    props.b = () => 2;
    expect("b" in props).toBe(true);
    expect(props.b).toBe(2);
    Object.defineProperty(props, "c", {
      value: () => 3,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    expect(props.c).toBe(3);
    expect(Object.keys(props).sort()).toEqual(["a", "b", "c"]);
    expect(Object.getOwnPropertyDescriptor(props, "a")?.value).toBe(1);
    expect(Object.getOwnPropertyDescriptor(props, "missing")).toBeUndefined();
    delete props.a;
    expect("a" in props).toBe(false);
    expect("toString" in props).toBe(false);
  });

  it("preserves accessor descriptors without invoking them in getOwnPropertyDescriptor", () => {
    const raw = {};
    Object.defineProperty(raw, "label", {
      configurable: true,
      enumerable: true,
      get() {
        return () => "live";
      },
    });
    const props = createLiveProps(raw as { label: string });
    const desc = Object.getOwnPropertyDescriptor(props, "label");
    expect(desc && "get" in desc).toBe(true);
    expect(props.label).toBe("live");
  });
});

describe("createLiveRest", () => {
  it("hides omitted keys and stays live on leftover getters", () => {
    const raw: Record<string, unknown> = {
      value: () => "keep",
      open: false,
      extra: () => 1,
    };
    const rest = createLiveRest(raw, ["value"]);
    expect("value" in rest).toBe(false);
    expect(rest.value).toBeUndefined();
    expect("open" in rest).toBe(true);
    expect(rest.open).toBe(false);
    expect(rest.extra).toBe(1);
    expect(Object.keys(rest).sort()).toEqual(["extra", "open"]);
    expect(Reflect.set(rest, "value", true)).toBe(false);
    expect(Reflect.defineProperty(rest, "value", { value: 1 })).toBe(false);
    expect(Reflect.deleteProperty(rest, "value")).toBe(false);
    rest.open = true;
    expect(raw.open).toBe(true);
    expect(getRawProps(rest)).toBe(raw);
  });

  it("returns leftover raw getters for JSX spread without invoking them", () => {
    expect(getSpreadProps(undefined as never)).toBeUndefined();
    const raw = {
      value: () => "omit",
      extra: () => "keep",
    };
    const live = createLiveProps(raw);
    expect(getSpreadProps(live)).toBe(raw);
    expect(getSpreadProps(raw)).toBe(raw);
    const rest = createLiveRest(raw, ["value"]);
    const spread = getSpreadProps(rest);
    expect(spread).not.toBe(raw);
    expect(Object.keys(spread).sort()).toEqual(["extra"]);
    expect(typeof spread.extra).toBe("function");
    expect((spread.extra as () => string)()).toBe("keep");
    expect("value" in spread).toBe(false);
  });
});

describe("cc live props", () => {
  it("unwraps getter props when the component function is called", () => {
    const Child = cc<{ title: string }>(({ title }) => title);
    expect(Child({ title: "hello" })).toBe("hello");
    expect(
      Child({ title: (() => "from-getter") as unknown as string }),
    ).toBe("from-getter");
  });

  it("keeps parent getter updates live without remounting", async () => {
    const framework = signal("sinwan");
    let setups = 0;
    const Child = cc<{ value: string }>((props) => {
      setups += 1;
      return el("span", {}, () => props.value);
    });
    const Parent = cc(() => el(Child, { value: () => framework.value }));
    mount(Parent, container);
    expect(setups).toBe(1);
    expect(container.textContent).toBe("sinwan");
    framework.value = "vue";
    await nextTick();
    expect(container.textContent).toBe("vue");
    expect(setups).toBe(1);
  });

  it("tracks live props inside effect without copying into a child signal", async () => {
    const open = signal(false);
    const seen: boolean[] = [];
    const Child = cc<{ open: boolean }>((props) => {
      effect(() => {
        seen.push(props.open);
      });
      return el("div", {}, () => String(props.open));
    });
    const Parent = cc(() => el(Child, { open: () => open.value }));
    mount(Parent, container);
    expect(seen).toEqual([false]);
    open.value = true;
    await nextTick();
    expect(seen).toEqual([false, true]);
    expect(container.textContent).toBe("true");
  });

  it("SSR and hydrate see unwrapped getter props", async () => {
    const App = cc<{ label: string }>((props) =>
      el("p", {}, () => props.label),
    );
    const html = await renderToHydratableString(App, {
      label: () => "hydrated",
    });
    expect(html).toContain("hydrated");
    container.innerHTML = html;
    hydrate(App, container, { label: () => "hydrated" });
    expect(container.textContent).toContain("hydrated");
  });

  it("soft-show re-runs setup against live raw instance.props", () => {
    const name = signal("first");
    const seen: string[] = [];
    const Comp = cc<{ label: string }>((props) => {
      seen.push(props.label);
      onMounted(() => {});
      return el("div");
    });
    const inst = createComponentInstance(Comp, {
      label: () => name.value,
    }, null);
    inst.isMounted = true;
    softHideInstance(inst);
    seen.length = 0;
    name.value = "second";
    softShowInstance(inst);
    expect(seen).toEqual(["second"]);
  });

  it("HMR-style re-invoke unwraps the same raw props bag", () => {
    const count = signal(1);
    const seen: number[] = [];
    const Comp = cc<{ n: number }>((props) => {
      seen.push(props.n);
      return el("div", {}, () => String(props.n));
    });
    const raw = { n: () => count.value };
    Comp(raw as never);
    count.value = 2;
    Comp(raw as never);
    expect(seen).toEqual([1, 2]);
  });
});
