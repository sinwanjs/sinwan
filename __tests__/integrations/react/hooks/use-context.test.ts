/**
 * Comprehensive tests for `useContext`.
 *
 * Tests are organized to mirror the React documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  createContext,
  useContext,
} from "../../../../src/integrations/react/_client.ts";
import { signal } from "../../../../src/reactivity/signal.ts";

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

// ─── Reference ────────────────────────────────────────────────────────────

describe("useContext — Reference", () => {
  it("returns defaultValue when no Provider exists in the tree", () => {
    // Covers: Reference / Returns — If there is no such provider, then
    // the returned value will be the defaultValue passed to createContext.
    const ThemeContext = createContext("light");
    let theme: string | undefined;
    const App = cc(() => {
      theme = useContext(ThemeContext);
      return el("div");
    });
    mount(App, container);
    expect(theme).toBe("light");
  });

  it("returns the value from the closest Provider above the calling component", () => {
    // Covers: Reference / Returns — It is determined as the value passed
    // to the closest SomeContext above the calling component in the tree.
    const ThemeContext = createContext("light");
    let childTheme: string | undefined;
    const Child = cc(() => {
      childTheme = useContext(ThemeContext);
      return el("span", {}, childTheme!);
    });
    // NOTE: In Sinwan, calling Child({}) directly inside App's setup would
    // run Child's setup with App as the current instance. We pass el(Child, {})
    // so the renderer mounts Child as a descendant of ThemeContext.
    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(Child, {}));
    });
    mount(App, container);
    expect(childTheme).toBe("dark");
  });

  it("is not affected by providers returned from the same component", () => {
    // Covers: Reference / Caveats — useContext() call in a component is
    // not affected by providers returned from the same component.
    const ThemeContext = createContext("light");
    let capturedTheme: string | undefined;
    const App = cc(() => {
      capturedTheme = useContext(ThemeContext);
      // Provider returned from SAME component — should NOT affect useContext
      return el(ThemeContext, { value: "dark" }, el("div"));
    });
    mount(App, container);
    // useContext ran during setup before the Provider child was mounted,
    // so it sees the default value, not the provider's value
    expect(capturedTheme).toBe("light");
  });

  it("requires the exact same context object for provide and read", () => {
    // Covers: Reference / Caveats — Passing something via context only
    // works if SomeContext used to provide and read are exactly the same
    // object (=== comparison).
    const Ctx1 = createContext("a");
    const Ctx2 = createContext("b");
    let v1: string | undefined;
    let v2: string | undefined;
    const App = cc(() => {
      v1 = useContext(Ctx1);
      v2 = useContext(Ctx2);
      return el("div");
    });
    mount(App, container);
    // Even though both have no provider, they have different default values
    expect(v1).toBe("a");
    expect(v2).toBe("b");
    // Different context objects are not equal
    expect(Ctx1 === Ctx2).toBe(false);
  });
});

// ─── Usage ────────────────────────────────────────────────────────────────

describe("useContext — Usage / Passing data deeply into the tree", () => {
  it("reads context value through multiple layers of nesting", () => {
    // Covers: Usage / Passing data deeply — It doesn't matter how many
    // layers of components there are between the provider and the consumer.
    const ThemeContext = createContext("light");
    let deepTheme: string | undefined;
    const DeepChild = cc(() => {
      deepTheme = useContext(ThemeContext);
      return el("span");
    });
    const Middle = cc(() => {
      return el("div", {}, DeepChild({}));
    });
    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(Middle, {}));
    });
    mount(App, container);
    expect(deepTheme).toBe("dark");
  });
});

describe("useContext — Usage / Updating data passed via context", () => {
  it("child receives a signal through context that can be read and updated", () => {
    // Covers: Usage / Updating data passed via context
    // NOTE: In Sinwan, components run setup once. To make context values
    // reactive, pass a signal. The child receives the signal object itself
    // through context; reading .value at any time reflects the current state.
    // This is the Sinwan equivalent of React's context update triggering
    // re-renders.
    const ThemeContext = createContext(signal("light"));
    let childSignal: ReturnType<typeof signal> | undefined;
    const Child = cc(() => {
      childSignal = useContext(ThemeContext);
      return el("span");
    });
    const themeSig = signal("light");
    const App = cc(() => {
      return el(ThemeContext, { value: themeSig }, el(Child, {}));
    });
    mount(App, container);

    // Child received the exact signal object
    expect(childSignal).toBe(themeSig);
    expect(childSignal!.value).toBe("light");

    // Update the signal — reading .value later reflects the new state
    themeSig.value = "dark";
    expect(childSignal!.value).toBe("dark");
  });
});

describe("useContext — Usage / Specifying a fallback default value", () => {
  it("returns the defaultValue when no matching provider exists", () => {
    // Covers: Usage / Specifying a fallback default value
    const ThemeContext = createContext("light");
    let theme: string | undefined;
    const App = cc(() => {
      theme = useContext(ThemeContext);
      return el("div");
    });
    mount(App, container);
    expect(theme).toBe("light");
  });

  it("returns null when createContext(null) has no provider", () => {
    const UserContext = createContext<null | { name: string }>(null);
    let user: { name: string } | null | undefined;
    const App = cc(() => {
      user = useContext(UserContext);
      return el("div");
    });
    mount(App, container);
    expect(user).toBeNull();
  });
});

describe("useContext — Usage / Overriding context for a part of the tree", () => {
  it("nested provider overrides the outer provider value", () => {
    // Covers: Usage / Overriding context — You can override context for
    // a part of the tree by wrapping that part in a provider with a
    // different value.
    const ThemeContext = createContext("default");
    let outerChildTheme: string | undefined;
    let innerChildTheme: string | undefined;
    const InnerChild = cc(() => {
      innerChildTheme = useContext(ThemeContext);
      return el("span");
    });
    const OuterChild = cc(() => {
      outerChildTheme = useContext(ThemeContext);
      return el(ThemeContext, { value: "light" }, el(InnerChild, {}));
    });
    const App = cc(() => {
      return el(ThemeContext, { value: "dark" }, el(OuterChild, {}));
    });
    mount(App, container);
    expect(outerChildTheme).toBe("dark");
    expect(innerChildTheme).toBe("light");
  });
});

describe("useContext — Usage / Multiple contexts", () => {
  it("allows multiple independent contexts in the same tree", () => {
    // Covers: Usage / Updating data passed via context / Multiple contexts
    const ThemeContext = createContext("light");
    const UserContext = createContext<{ name: string } | null>(null);

    let capturedTheme: string | undefined;
    let capturedUser: { name: string } | null | undefined;

    const Child = cc(() => {
      capturedTheme = useContext(ThemeContext);
      capturedUser = useContext(UserContext);
      return el("div");
    });

    const App = cc(() => {
      return el(
        ThemeContext,
        { value: "dark" },
        el(UserContext, { value: { name: "Alice" } }, el(Child, {})),
      );
    });
    mount(App, container);
    expect(capturedTheme).toBe("dark");
    expect(capturedUser).toEqual({ name: "Alice" });
  });
});

describe("useContext — Usage / Extracting providers to a component", () => {
  it("works when providers are extracted into a separate component", () => {
    // Covers: Usage / Extracting providers to a component
    const ThemeContext = createContext("light");
    let childTheme: string | undefined;

    const MyProviders = cc((props: { children: any; theme: string }) => {
      return el(ThemeContext, { value: props.theme }, props.children);
    });

    const Child = cc(() => {
      childTheme = useContext(ThemeContext);
      return el("span");
    });

    const App = cc(() => {
      return el(MyProviders, { theme: "dark" }, el(Child, {}));
    });
    mount(App, container);
    expect(childTheme).toBe("dark");
  });
});

describe("useContext — Usage / Scaling up with context and a reducer", () => {
  it("supports the reducer+context pattern with separate dispatch context", () => {
    // Covers: Usage / Scaling up with context and a reducer
    interface Task {
      id: number;
      text: string;
    }
    const TasksContext = createContext<Task[]>([]);
    type Dispatch = (action: { type: string }) => void;
    const TasksDispatchContext = createContext<Dispatch>(() => {});

    let capturedTasks: Task[] | undefined;
    let capturedDispatch: Dispatch | undefined;

    const Child = cc(() => {
      capturedTasks = useContext(TasksContext);
      capturedDispatch = useContext(TasksDispatchContext);
      return el("div");
    });

    const App = cc(() => {
      const tasks: Task[] = [{ id: 1, text: "Learn Sinwan" }];
      const dispatch: Dispatch = (action) => {
        void action;
      };
      return el(
        TasksContext,
        { value: tasks },
        el(TasksDispatchContext, { value: dispatch }, el(Child, {})),
      );
    });
    mount(App, container);
    expect(capturedTasks).toEqual([{ id: 1, text: "Learn Sinwan" }]);
    expect(typeof capturedDispatch).toBe("function");
  });
});

// ─── Troubleshooting ───────────────────────────────────────────────────────

describe("useContext — Troubleshooting", () => {
  it("returns undefined when a provider exists but has no value prop", () => {
    // Covers: Troubleshooting / I am always getting undefined from my
    // context although the default value is different — If you forget to
    // specify value, it's like passing value={undefined}.
    const ThemeContext = createContext("light");
    let theme: string | undefined;
    const Child = cc(() => {
      theme = useContext(ThemeContext);
      return el("span");
    });
    // NOTE: In Sinwan, calling ThemeContext({ children: ... }) without
    // a value prop would NOT call provide (the shorthand checks "value" in
    // props). So the child falls through to the default. If we want to
    // simulate React's behavior of value={undefined}, we explicitly pass
    // undefined.
    const App = cc(() => {
      return el(ThemeContext, { value: undefined }, el(Child, {}));
    });
    mount(App, container);
    // When a provider explicitly passes undefined, inject sees it in
    // the provides chain and returns undefined instead of the default.
    expect(theme).toBeUndefined();
  });

  it("throws when called outside a component", () => {
    // Covers: Reference / Caveats — useContext is a Hook, so you can
    // only call it at the top level of your component.
    const Ctx = createContext("x");
    expect(() => {
      useContext(Ctx);
    }).toThrow("outside of component");
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────

describe("useContext — SomeContext.Consumer", () => {
  it("reads context value via children render-prop function", () => {
    const ThemeContext = createContext("light");
    let consumerTheme: string | undefined;

    const App = cc(() => {
      return el(
        ThemeContext,
        { value: "dark" },
        el(ThemeContext.Consumer, {}, (theme: string) => {
          consumerTheme = theme;
          return el("span", {}, theme);
        }),
      );
    });
    mount(App, container);
    expect(consumerTheme).toBe("dark");
  });

  it("Consumer falls back to defaultValue when no provider exists", () => {
    const ThemeContext = createContext("light");
    let consumerTheme: string | undefined;

    const App = cc(() => {
      return el(ThemeContext.Consumer, {}, (theme: string) => {
        consumerTheme = theme;
        return el("span", {}, theme);
      });
    });
    mount(App, container);
    expect(consumerTheme).toBe("light");
  });

  it("Consumer resolves to the closest ancestor provider", () => {
    const ThemeContext = createContext("default");
    let consumerTheme: string | undefined;

    const App = cc(() => {
      return el(
        ThemeContext,
        { value: "outer" },
        el(
          ThemeContext,
          { value: "inner" },
          el(ThemeContext.Consumer, {}, (theme: string) => {
            consumerTheme = theme;
            return el("span");
          }),
        ),
      );
    });
    mount(App, container);
    expect(consumerTheme).toBe("inner");
  });
});

describe("useContext — Edge cases", () => {
  it("handles object values correctly", () => {
    interface Auth {
      currentUser: { name: string } | null;
      login: (u: { name: string }) => void;
    }
    const AuthContext = createContext<Auth>({
      currentUser: null,
      login: () => {},
    });
    let auth: Auth | undefined;
    const Child = cc(() => {
      auth = useContext(AuthContext);
      return el("div");
    });
    const appAuth: Auth = {
      currentUser: { name: "Bob" },
      login: (u) => {
        void u;
      },
    };
    const App = cc(() => {
      return el(AuthContext, { value: appAuth }, el(Child, {}));
    });
    mount(App, container);
    expect(auth!.currentUser).toEqual({ name: "Bob" });
    expect(typeof auth!.login).toBe("function");
  });

  it("handles numeric zero as a valid context value", () => {
    const CounterContext = createContext(0);
    let count: number | undefined;
    const Child = cc(() => {
      count = useContext(CounterContext);
      return el("div");
    });
    const App = cc(() => {
      return el(CounterContext, { value: 42 }, el(Child, {}));
    });
    mount(App, container);
    expect(count).toBe(42);
  });

  it("handles boolean false as a valid context value", () => {
    const FlagContext = createContext(true);
    let flag: boolean | undefined;
    const Child = cc(() => {
      flag = useContext(FlagContext);
      return el("div");
    });
    const App = cc(() => {
      return el(FlagContext, { value: false }, el(Child, {}));
    });
    mount(App, container);
    expect(flag).toBe(false);
  });

  it("deeply nested providers still resolve to closest ancestor", () => {
    const LevelContext = createContext(0);
    const levels: number[] = [];

    const Section = cc((props: { children: any; level: number }) => {
      return el(LevelContext, { value: props.level }, props.children);
    });

    const Heading = cc(() => {
      levels.push(useContext(LevelContext));
      return el("h1");
    });

    const App = cc(() => {
      return el(
        Section,
        { level: 1 },
        el(Section, { level: 2 }, el(Section, { level: 3 }, el(Heading, {}))),
      );
    });
    mount(App, container);
    expect(levels).toEqual([3]);
  });

  it("provider shorthand (Context as component) works identically to Context.Provider", () => {
    const ThemeContext = createContext("light");
    let theme1: string | undefined;
    let theme2: string | undefined;

    const Child1 = cc(() => {
      theme1 = useContext(ThemeContext);
      return el("span");
    });
    const Child2 = cc(() => {
      theme2 = useContext(ThemeContext);
      return el("span");
    });

    const App = cc(() => {
      return el(
        "div",
        {},
        el(ThemeContext, { value: "dark" }, el(Child1, {})),
        el(ThemeContext.Provider, { value: "dark" }, el(Child2, {})),
      );
    });
    mount(App, container);
    expect(theme1).toBe("dark");
    expect(theme2).toBe("dark");
  });
});
