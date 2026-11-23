import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import { ErrorBoundary, Match, Switch } from "../src/component/control-flow.ts";
import { onMounted, onUnmounted } from "../src/component/lifecycle.ts";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { nextTick, signal } from "../src/reactivity/index.ts";

let container: HTMLElement;
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
});

describe("Switch keeps the selected branch", () => {
  it("does not rebuild when the same Match stays selected", async () => {
    const count = signal(1);
    let setups = 0;
    const Panel = cc(() => {
      setups++;
      return jsx("p", { children: "positive" });
    });
    const App = cc(() =>
      jsx(Switch, {
        fallback: "none",
        children: [
          jsx(Match, { when: () => count.value > 0, children: jsx(Panel, {}) }),
        ],
      }),
    );
    const app = mount(App, container);
    const first = container.querySelector("p");
    count.value = 2;
    await nextTick();
    count.value = 3;
    await nextTick();
    expect(setups).toBe(1);
    expect(container.querySelector("p")).toBe(first);
    count.value = 0;
    await nextTick();
    expect(container.textContent).toBe("none");
    count.value = 5;
    await nextTick();
    expect(setups).toBe(2);
    app.unmount();
  });

  it("does not subscribe the Switch to reads inside a Match render prop", async () => {
    const user = signal({ name: "a" });
    const label = signal("x");
    let calls = 0;
    const App = cc(() =>
      jsx(Switch, {
        children: [
          jsx(Match, {
            when: () => user.value,
            children: (value: { name: string }) => {
              calls++;
              return `${value.name}-${label.value}`;
            },
          }),
        ],
      }),
    );
    const app = mount(App, container);
    label.value = "y";
    await nextTick();
    expect(calls).toBe(1);
    user.value = { name: "b" };
    await nextTick();
    expect(calls).toBe(2);
    expect(container.textContent).toBe("b-y");
    app.unmount();
  });

  it("sets up a plain component branch once", async () => {
    let setups = 0;
    const Loading = cc(() => {
      setups++;
      return jsx("p", { children: "loading" });
    });
    const App = cc(() =>
      jsx(Switch, {
        children: [jsx(Match, { when: false, children: "never" }), jsx(Loading, {})],
      }),
    );
    const app = mount(App, container);
    expect(container.textContent).toBe("loading");
    expect(setups).toBe(1);
    app.unmount();
  });
});

describe("Switch probes component children once", () => {
  it("calls a Match wrapper once and keeps its condition reactive", async () => {
    const admin = signal(false);
    let calls = 0;
    const AdminOnly = cc(() => {
      calls++;
      return Match({ when: () => admin.value, children: "admin" });
    });
    const App = cc(() =>
      jsx(Switch, {
        fallback: "guest",
        children: [jsx(AdminOnly, {})],
      }),
    );
    const app = mount(App, container);
    expect(container.textContent).toBe("guest");
    admin.value = true;
    await nextTick();
    expect(container.textContent).toBe("admin");
    admin.value = false;
    await nextTick();
    expect(container.textContent).toBe("guest");
    expect(calls).toBe(1);
    app.unmount();
  });

  it("mounts and unmounts a plain branch like any component", async () => {
    const busy = signal(true);
    const log: string[] = [];
    const Loading = cc(() => {
      log.push("setup");
      onMounted(() => log.push("mounted"));
      onUnmounted(() => log.push("unmounted"));
      return jsx("p", { children: "loading" });
    });
    const App = cc(() =>
      jsx(Switch, {
        children: [
          jsx(Match, { when: () => !busy.value, children: "ready" }),
          jsx(Loading, {}),
        ],
      }),
    );
    const app = mount(App, container);
    expect(log).toEqual(["setup", "mounted"]);
    busy.value = false;
    await nextTick();
    expect(container.textContent).toBe("ready");
    busy.value = true;
    await nextTick();
    expect(container.textContent).toBe("loading");
    expect(log).toEqual(["setup", "mounted", "unmounted", "setup", "mounted"]);
    app.unmount();
    expect(log.at(-1)).toBe("unmounted");
  });

  it("lets a branch that throws reach the error boundary", () => {
    const Broken = cc(() => {
      throw new Error("broken branch");
    });
    const App = cc(() =>
      jsx(ErrorBoundary, {
        fallback: (error: Error) => `caught: ${error.message}`,
        children: jsx(Switch, { children: [jsx(Broken, {})] }),
      }),
    );
    const app = mount(App, container);
    expect(container.textContent).toBe("caught: broken branch");
    app.unmount();
  });

  it("renders an async component branch when it resolves", async () => {
    const Later = cc(async () => jsx("p", { children: "later" }));
    const App = cc(() => jsx(Switch, { children: [jsx(Later, {})] }));
    const app = mount(App, container);
    for (let i = 0; i < 5; i++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.textContent).toBe("later");
    app.unmount();
  });
});
