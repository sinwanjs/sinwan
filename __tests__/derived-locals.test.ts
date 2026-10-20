import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { cc } from "../src/component/create.ts";
import { Show } from "../src/component/control-flow.ts";
import { signal, nextTick, unwrap } from "../src/reactivity/index.ts";
import { jsx, Fragment } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { hydrate } from "../src/hydration/hydrate.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import {
  _$createTemplate,
  _$bindText,
  _$bindAttr,
  _$bindStyle,
  _$bindClass,
} from "../src/renderer/template.ts";
import type { Signal } from "../src/reactivity/signal.ts";
import type { SinwanComponent } from "../src/types.ts";

interface CompileOptions {
  derivedLocals: boolean;
  hoist: boolean;
  explicitBindings: boolean;
}

type Transform = (
  code: string,
  filename: string,
  options: CompileOptions,
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

interface Panel {
  collapsed: Signal<boolean>;
}

function createElement(
  type: Parameters<typeof jsx>[0],
  props: Parameters<typeof jsx>[1],
  ...children: unknown[]
) {
  return jsx(type, children.length > 0 ? { ...props, children } : props);
}

async function renderServer(App: SinwanComponent): Promise<string> {
  const document = globalThis.document;
  Reflect.deleteProperty(globalThis, "document");
  try {
    return await renderToHydratableString(App);
  } finally {
    globalThis.document = document;
  }
}

function compilePanels(
  panels: Signal<Panel[]>,
  options: CompileOptions,
): SinwanComponent {
  if (!transform)
    throw new Error(
      "Sibling sinwan-compiler is required for this integration test",
    );
  const compiled = transform(
    `
    import { cc } from "sinwan/component";
    import { Show } from "sinwan/control-flow";
    export const App = cc(() => {
      const left = panels.value[0], right = panels.value[1];
      const leftCollapsed = left?.collapsed.value ?? false;
      const rightCollapsed = right?.collapsed.value ?? false;
      const inactive = !left || !right;
      const open = !inactive && leftCollapsed && !rightCollapsed;
      const label = open ? "expand" : "idle";
      if (open) throw new Error("A false derived boolean became a truthy function");
      return <section data-state={label} class={label} style={{ color: open ? "red" : "blue" }}>
        <button onClick={() => { panels.value[0].collapsed.value = false; }}>close</button>
        <Show when={open}><b>Expand</b></Show>
        <span>{label}</span>
      </section>;
    });
  `,
    "derived-panels.tsx",
    options,
  ).code;
  const code = transpiler.transformSync(
    compiled
      .replace(/import\s*[\s\S]*?\s*from\s*["'][^"']+["']\s*;?\n*/g, "")
      .replace("export const App", "const App"),
  );
  const runtime = {
    cc,
    Show,
    panels,
    createElement,
    Fragment,
    _$createTemplate,
    _$bindText,
    _$bindAttr,
    _$bindStyle,
    _$bindClass,
    _$unwrap: unwrap,
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

describe("compiler-derived local runtime integration", () => {
  testWithCompiler(
    "reproduces the setup snapshot when promotion is disabled",
    async () => {
      const panels = signal<Panel[]>([]);
      const App = compilePanels(panels, {
        derivedLocals: false,
        hoist: false,
        explicitBindings: false,
      });
      const app = mount(App, container);
      try {
        panels.value = [
          { collapsed: signal(true) },
          { collapsed: signal(false) },
        ];
        await nextTick();
        expect(container.querySelector("b")).toBeNull();
        expect(
          container.querySelector("section")?.getAttribute("data-state"),
        ).toBe("idle");
      } finally {
        app.unmount();
      }
    },
  );

  for (const hydration of [false, true]) {
    for (const hoist of [false, true]) {
      for (const explicitBindings of [false, true]) {
        testWithCompiler(
          `late panels stay live: hydration=${hydration}, hoist=${hoist}, bindings=${explicitBindings}`,
          async () => {
            const panels = signal<Panel[]>([]);
            const App = compilePanels(panels, {
              derivedLocals: true,
              hoist,
              explicitBindings,
            });
            if (hydration) container.innerHTML = await renderServer(App);
            const serverSection = container.querySelector("section");
            const app = hydration
              ? hydrate(App, container)
              : mount(App, container);
            const section = container.querySelector("section")!;
            try {
              if (hydration && !hoist)
                expect(section === serverSection).toBe(true);
              expect(section.getAttribute("data-state")).toBe("idle");
              expect(container.querySelector("b")).toBeNull();
              const oldLeft = { collapsed: signal(true) };
              panels.value = [oldLeft, { collapsed: signal(false) }];
              await nextTick();
              expect(container.querySelector("section")).toBe(section);
              expect(section.getAttribute("data-state")).toBe("expand");
              expect(section.className).toBe("expand");
              expect(section.style.color).toBe("red");
              expect(container.querySelector("b")?.textContent).toBe("Expand");
              expect(container.querySelector("span")?.textContent).toBe(
                "expand",
              );
              container.querySelector("button")!.click();
              await nextTick();
              expect(section.getAttribute("data-state")).toBe("idle");
              expect(section.style.color).toBe("blue");
              expect(container.querySelector("b")).toBeNull();
              panels.value = [
                { collapsed: signal(false) },
                { collapsed: signal(false) },
              ];
              oldLeft.collapsed.value = true;
              await nextTick();
              expect(section.getAttribute("data-state")).toBe("idle");
              panels.value[0]!.collapsed.value = true;
              await nextTick();
              expect(section.getAttribute("data-state")).toBe("expand");
            } finally {
              app.unmount();
            }
            panels.value = [];
            await nextTick();
            expect(section.getAttribute("data-state")).toBe("expand");
            expect(container.childNodes.length).toBe(0);
          },
        );
      }
    }
  }
});
