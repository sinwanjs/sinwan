import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import { jsx, Fragment } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { effect, signal, unwrap } from "../src/reactivity/index.ts";
import type { Signal } from "../src/reactivity/signal.ts";
import type { SinwanComponent } from "../src/types.ts";

type Transform = (
  code: string,
  filename: string,
) => { code: string };
const compilerPath = "../../sinwan-compiler/src/transform.ts";
let transform: Transform | undefined;
try {
  const compiler: unknown = require(compilerPath);
  if (
    typeof compiler === "object" &&
    compiler !== null &&
    "transformJSX" in compiler &&
    typeof compiler.transformJSX === "function"
  ) {
    transform = compiler.transformJSX as Transform;
  }
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "MODULE_NOT_FOUND"
  )
    throw error;
}
const testWithCompiler = transform ? it : it.skip;
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: {
    compilerOptions: {
      jsx: "react",
      jsxFactory: "createElement",
      jsxFragmentFactory: "Fragment",
    },
  },
});

function createElement(
  type: Parameters<typeof jsx>[0],
  props: Parameters<typeof jsx>[1],
  ...children: unknown[]
) {
  if (children.length === 0) return jsx(type, props);
  return jsx(type, {
    ...props,
    children: children.length === 1 ? children[0] : children,
  });
}

/** Stop a regression from looping forever: past this many setups the fake fetch stops writing. */
const SETUP_LIMIT = 50;

interface FetchProbe {
  isFetching: Signal<boolean>;
  setups: number;
}

/** Mimics a fetch hook: reads `isFetching` during setup, then flips it once the request starts. */
function createFetcher(probe: FetchProbe): SinwanComponent {
  return cc(() => {
    probe.setups++;
    const busy = probe.isFetching.value;
    if (probe.setups < SETUP_LIMIT) {
      queueMicrotask(() => {
        probe.isFetching.value = !busy;
      });
    }
    return jsx("p", { children: "fetched" });
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const twoChildSlots: TemplateDef = {
  html: "<div><!--s:0--><!--s:1--></div>",
  slots: [
    { path: [0], type: "child" },
    { path: [1], type: "child" },
  ],
};

function compileGate(
  probe: FetchProbe,
  content: string,
): SinwanComponent {
  if (!transform)
    throw new Error(
      "Sibling sinwan-compiler is required for this integration test",
    );
  const compiled = transform(
    `
    import { cc, signal } from "sinwan";
    const Gate = cc((props: { content: (current: { id: number }) => unknown }) => {
      const current = signal({ id: 1 });
      return <section>{props.content(current.value)}</section>;
    });
    export const App = cc(() => <Gate content={${content}} />);
  `,
    "setup-untracked-gate.tsx",
  ).code;
  const code = transpiler.transformSync(
    compiled
      .replace(/import\s*[\s\S]*?\s*from\s*["'][^"']+["']\s*;?\n*/g, "")
      .replace("export const App", "const App"),
  );
  const runtime = {
    cc,
    signal,
    createElement,
    Fragment,
    _$createTemplate,
    _$unwrap: unwrap,
    Fetcher: createFetcher(probe),
  };
  const component: unknown = new Function(
    ...Object.keys(runtime),
    `${code}; return App;`,
  )(...Object.values(runtime));
  if (typeof component !== "function")
    throw new Error("Compiled module did not return a component");
  return component as SinwanComponent;
}

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

describe("component setup inside a reactive getter", () => {
  it("does not subscribe a template built by the getter to setup reads", async () => {
    const probe: FetchProbe = { isFetching: signal(false), setups: 0 };
    const Fetcher = createFetcher(probe);
    const current = signal(1);
    let blockRuns = 0;
    const App = cc(() =>
      jsx("section", {
        children: () => {
          blockRuns++;
          current.value;
          return _$createTemplate(twoChildSlots, [
            jsx(Fetcher, {}),
            jsx(Fetcher, {}),
          ]);
        },
      }),
    );
    const app = mount(App, container);
    await settle();
    expect(probe.setups).toBe(2);
    expect(blockRuns).toBe(1);
    expect(container.querySelectorAll("p").length).toBe(2);

    current.value = 2;
    await settle();
    expect(blockRuns).toBe(2);
    expect(probe.setups).toBe(4);
    expect(container.querySelectorAll("p").length).toBe(2);
    app.unmount();
  });

  it("keeps a lazily rendered component set up once", async () => {
    const probe: FetchProbe = { isFetching: signal(false), setups: 0 };
    const Fetcher = createFetcher(probe);
    let blockRuns = 0;
    const App = cc(() =>
      jsx("section", {
        children: () => {
          blockRuns++;
          return jsx(Fetcher, {});
        },
      }),
    );
    const app = mount(App, container);
    await settle();
    expect(probe.setups).toBe(1);
    expect(blockRuns).toBe(1);
    app.unmount();
  });

  it("keeps effects created during setup reactive", async () => {
    const source = signal("a");
    const seen: string[] = [];
    let blockRuns = 0;
    const Watcher = cc(() => {
      effect(() => {
        seen.push(source.value);
      });
      return jsx("p", { children: "watching" });
    });
    const App = cc(() =>
      jsx("section", {
        children: () => {
          blockRuns++;
          return _$createTemplate(twoChildSlots, [jsx(Watcher, {}), null]);
        },
      }),
    );
    const app = mount(App, container);
    source.value = "b";
    await settle();
    expect(seen).toEqual(["a", "b"]);
    expect(blockRuns).toBe(1);
    app.unmount();
  });

  it("does not subscribe the getter to reads made by a template ref", async () => {
    const width = signal(10);
    const widths: number[] = [];
    let blockRuns = 0;
    const withRef: TemplateDef = {
      html: "<div><i></i></div>",
      slots: [{ path: [0], type: "ref", name: "ref" }],
    };
    const App = cc(() =>
      jsx("section", {
        children: () => {
          blockRuns++;
          return _$createTemplate(withRef, [
            () => {
              widths.push(width.value);
            },
          ]);
        },
      }),
    );
    const app = mount(App, container);
    width.value = 20;
    await settle();
    expect(blockRuns).toBe(1);
    expect(widths).toEqual([10]);
    app.unmount();
  });
});

describe("compiled render-prop content", () => {
  testWithCompiler(
    "sets up components nested in an element once",
    async () => {
      const probe: FetchProbe = { isFetching: signal(false), setups: 0 };
      const App = compileGate(
        probe,
        "(current) => <div>{current.id}<Fetcher /><Fetcher /></div>",
      );
      const app = mount(App, container);
      await settle();
      expect(probe.setups).toBe(2);
      expect(container.querySelectorAll("p").length).toBe(2);
      app.unmount();
    },
  );

  testWithCompiler("sets up a single returned component once", async () => {
    const probe: FetchProbe = { isFetching: signal(false), setups: 0 };
    const App = compileGate(probe, "(current) => <Fetcher />");
    const app = mount(App, container);
    await settle();
    expect(probe.setups).toBe(1);
    app.unmount();
  });
});
