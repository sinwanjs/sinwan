import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import {
  Dynamic,
  For,
  Key,
  Match,
  Portal,
  Show,
  Switch,
  Virtual,
} from "../src/component/control-flow.ts";
import { Activity } from "../src/react/activity.ts";
import {
  createComponentInstance,
  type ComponentInstance,
} from "../src/component/instance.ts";
import * as dev from "../src/dev/index.ts";
import {
  describeOwner,
  devWarn,
  resetDevWarnings,
  shallowEqual,
} from "../src/dev/warn.ts";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { nextTick, signal } from "../src/reactivity/index.ts";
import type { SinwanComponent } from "../src/types.ts";

let warn: ReturnType<typeof spyOn<Console, "warn">>;
let container: HTMLElement;

function setDev(value: boolean | undefined): void {
  if (value === undefined) Reflect.deleteProperty(globalThis, "__DEV__");
  else Reflect.set(globalThis, "__DEV__", value);
}

function messages(): string[] {
  return warn.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Text: window.Text,
    Comment: window.Comment,
    DocumentFragment: window.DocumentFragment,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  resetDevWarnings();
  setDev(true);
  warn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  setDev(undefined);
});

function owner(component: SinwanComponent): ComponentInstance {
  return createComponentInstance(component, {}, null);
}

describe("devWarn", () => {
  it("prints each code and message once", () => {
    devWarn("SW299", "first");
    devWarn("SW299", "first");
    devWarn("SW299", "second");
    expect(messages()).toEqual([
      "[Sinwan] SW299: first",
      "[Sinwan] SW299: second",
    ]);
  });

  it("is silent outside development", () => {
    setDev(false);
    devWarn("SW299", "hidden");
    setDev(undefined);
    devWarn("SW299", "hidden");
    expect(dev.isDev()).toBe(false);
    expect(messages()).toEqual([]);
  });

  it("is exported from sinwan/dev", () => {
    expect(Object.keys(dev).sort()).toEqual(["devWarn", "isDev"]);
    expect(dev.isDev()).toBe(true);
  });
});

describe("dev helpers", () => {
  it("names the owning component", () => {
    const Named = cc(function Profile() {
      return null;
    });
    function plain() {
      return null;
    }
    expect(describeOwner(null)).toBe("the root");
    expect(describeOwner(owner(Named))).toBe("<Profile>");
    expect(describeOwner(owner(plain))).toBe("<plain>");
    expect(describeOwner(owner(() => null))).toBe("<Anonymous>");
  });

  it("compares objects and arrays shallowly", () => {
    const shared = { id: 1 };
    expect(shallowEqual({ a: shared }, { a: shared })).toBe(true);
    expect(shallowEqual([1, shared], [1, shared])).toBe(true);
    expect(shallowEqual({ a: { id: 1 } }, { a: { id: 1 } })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
  });
});

describe("SW201 Show rebuilds", () => {
  function app(children: unknown, read: () => unknown): SinwanComponent {
    return cc(function Profile() {
      return jsx("section", {
        children: jsx(Show, { when: read, children }),
      });
    });
  }

  it("warns when static children rebuild for a new object", async () => {
    const user = signal<{ id: number } | null>({ id: 1 });
    const App = app(jsx("p", { children: "static" }), () => user.value);
    const instance = mount(App, container);
    user.value = { id: 2 };
    await nextTick();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("[Sinwan] SW201: <Show> in <Profile>");
    expect(messages()[0]).toContain("its children do not receive");
    instance.unmount();
  });

  it("warns when a render prop rebuilds for an equal copy", async () => {
    const user = signal({ id: 1 });
    const App = app(
      (value: { id: number }) => jsx("p", { children: String(value.id) }),
      () => user.value,
    );
    const instance = mount(App, container);
    user.value = { id: 1 };
    await nextTick();
    expect(messages()[0]).toContain("an equal copy of the previous value");
    instance.unmount();
  });

  it("stays quiet for a render prop that receives a different value", async () => {
    const user = signal({ id: 1 });
    const App = app(
      (value: { id: number }) => jsx("p", { children: String(value.id) }),
      () => user.value,
    );
    const instance = mount(App, container);
    user.value = { id: 2 };
    await nextTick();
    expect(container.textContent).toBe("2");
    expect(messages()).toEqual([]);
    instance.unmount();
  });

  it("stays quiet for scalars, falsy values and production", async () => {
    const count = signal(1);
    const user = signal<{ id: number } | null>({ id: 1 });
    const scalar = mount(app(jsx("p", { children: "n" }), () => count.value), container);
    count.value = 2;
    user.value = null;
    await nextTick();
    const object = mount(app(jsx("p", { children: "u" }), () => user.value), container);
    user.value = { id: 2 };
    await nextTick();
    setDev(undefined);
    user.value = { id: 3 };
    await nextTick();
    expect(messages()).toEqual([]);
    scalar.unmount();
    object.unmount();
  });
});

describe("SW201 Match rebuilds", () => {
  it("warns when the selected Match rebuilds for a new object", async () => {
    const user = signal<{ id: number } | null>({ id: 1 });
    const App = cc(function Team() {
      return jsx(Switch, {
        children: [
          jsx(Match, { when: () => user.value, children: jsx("p", { children: "static" }) }),
        ],
      });
    });
    const instance = mount(App, container);
    user.value = { id: 2 };
    await nextTick();
    expect(messages()[0]).toContain("[Sinwan] SW201: <Match> in <Team>");
    instance.unmount();
  });

  it("stays quiet when another branch is selected", async () => {
    const user = signal<{ id: number } | null>({ id: 1 });
    const App = cc(function Team() {
      return jsx(Switch, {
        fallback: "none",
        children: [jsx(Match, { when: () => user.value, children: "user" })],
      });
    });
    const instance = mount(App, container);
    user.value = null;
    await nextTick();
    user.value = { id: 3 };
    await nextTick();
    expect(messages()).toEqual([]);
    instance.unmount();
  });
});

describe("SW203 For rows remounted with unchanged keys", () => {
  type Row = { id: number; name: string };
  function list(rows: () => Row[], by?: (row: Row) => number) {
    return cc(function Rows() {
      return jsx(For, {
        each: rows,
        by,
        children: (row: Row) => jsx("p", { children: row.name }),
      });
    });
  }

  it("warns once per For with the count", async () => {
    const rows = signal<Row[]>([{ id: 1, name: "a" }, { id: 2, name: "b" }]);
    const instance = mount(list(() => rows.value, (row) => row.id), container);
    rows.value = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
    await nextTick();
    rows.value = [{ id: 1, name: "a" }, { id: 2, name: "c" }];
    await nextTick();
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("[Sinwan] SW203: <For> in <Rows> remounted 2 row(s)");
    instance.unmount();
  });

  it("stays quiet for stable items and lists keyed by reference", async () => {
    const first = { id: 1, name: "a" };
    const second = { id: 2, name: "b" };
    const keyed = signal<Row[]>([first, second]);
    const byReference = signal<Row[]>([{ id: 1, name: "a" }]);
    const a = mount(list(() => keyed.value, (row) => row.id), container);
    const b = mount(list(() => byReference.value), container);
    keyed.value = [second, first];
    byReference.value = [{ id: 1, name: "a" }];
    await nextTick();
    expect(messages()).toEqual([]);
    a.unmount();
    b.unmount();
  });
});

describe("SW204 to SW207 and Key", () => {
  it("warns when a Portal selector matches nothing", () => {
    const target = document.createElement("div");
    target.id = "dock";
    document.body.appendChild(target);
    const instance = mount(
      cc(() =>
        jsx("div", {
          children: [
            jsx(Portal, { mount: "#dock", children: "here" }),
            jsx(Portal, { mount: "#missing", children: "lost" }),
          ],
        }),
      ),
      container,
    );
    expect(messages()).toEqual([
      '[Sinwan] SW204: <Portal mount="#missing"> matched no element, so its content is not rendered anywhere. Check the selector, or create the target element before the portal mounts.',
    ]);
    instance.unmount();
  });

  it("warns about an unknown Activity mode", () => {
    const instance = mount(
      cc(() =>
        jsx("div", {
          children: [
            jsx(Activity, { mode: "hiden" as never, children: "x" }),
            jsx(Activity, { mode: "hidden", children: "y" }),
          ],
        }),
      ),
      container,
    );
    expect(messages()).toEqual([
      '[Sinwan] SW205: <Activity mode="hiden"> is not "visible" or "hidden", so it is treated as "visible".',
    ]);
    instance.unmount();
  });

  it("warns about Virtual sizes that cannot lay out rows", () => {
    const rows = [1, 2, 3];
    const instance = mount(
      cc(() =>
        jsx("div", {
          children: [
            jsx(Virtual, {
              each: rows,
              itemHeight: 0,
              containerHeight: Number.NaN,
              children: (n: number) => String(n),
            }),
            jsx(Virtual, {
              each: rows,
              itemHeight: 20,
              containerHeight: 100,
              children: (n: number) => String(n),
            }),
          ],
        }),
      ),
      container,
    );
    expect(messages()).toEqual([
      "[Sinwan] SW206: <Virtual itemHeight={0}> must be a positive number of pixels (read once, when the list mounts); rows cannot be laid out.",
      "[Sinwan] SW206: <Virtual containerHeight={NaN}> must be a positive number of pixels (read once, when the list mounts); rows cannot be laid out.",
    ]);
    instance.unmount();
  });

  it("warns when Dynamic gets an element instead of a component", () => {
    const Row = cc(() => jsx("b", { children: "row" }));
    const instance = mount(
      cc(function Picker() {
        return jsx("div", {
          children: [
            jsx(Dynamic, { component: () => jsx("u", { children: "x" }) }),
            jsx(Dynamic, { component: Row }),
          ],
        });
      }),
      container,
    );
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toContain("[Sinwan] SW207: <Dynamic> in <Picker> got an element");
    expect(container.textContent).toBe("row");
    instance.unmount();
  });

  it("warns when Key remounts for an equal copy only", async () => {
    const filter = signal({ page: 1 });
    const instance = mount(
      cc(function Results() {
        return jsx(Key, { when: () => filter.value, children: "results" });
      }),
      container,
    );
    filter.value = { page: 2 };
    await nextTick();
    expect(messages()).toEqual([]);
    filter.value = { page: 2 };
    await nextTick();
    expect(messages()[0]).toContain("[Sinwan] SW201: <Key> in <Results>");
    expect(messages()[0]).toContain("an equal copy of the previous value");
    instance.unmount();
  });
});
