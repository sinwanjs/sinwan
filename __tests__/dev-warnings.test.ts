import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import { Show } from "../src/component/control-flow.ts";
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
