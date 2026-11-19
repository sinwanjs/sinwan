/**
 * Behaviours that had no test: exact-name namespace listeners, `Headers`
 * instances and non-JSON payloads in useFetch, `<title>` children shapes, the
 * JSX fallback for unknown symbol tags, anonymous owners in owner stacks,
 * abort with a throwing destination, empty scalar text slots, event slots
 * named without `on`, and shell options without viewport or embedded props.
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";

import { cc } from "../src/component/create.ts";
import { SinwanEventBus } from "../src/event/bus.ts";
import { createFetch, useFetch } from "../src/hook/index.ts";
import { jsx } from "../src/jsx/jsx-runtime.ts";
// Registers the enhanced intrinsic elements (`<title>`, `<link>`, …) on import.
import "../src/jsx/enhanced-elements.ts";
import { captureOwnerStack } from "../src/react/capture-owner-stack.ts";
import { renderToPipeableStream } from "../src/react/render-to-pipeable-stream.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import { mount } from "../src/renderer/mount.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import { renderToHydratableString } from "../src/server/hydration-markers.ts";
import { renderShell } from "../src/server/shell.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";

const globals = globalThis as Record<string, unknown>;
let container: HTMLElement;

beforeEach(() => {
  const win = new Window({ url: "http://localhost" });
  for (const name of ["Element", "Comment", "Text", "DocumentFragment", "Node", "HTMLElement"]) {
    globals[name] = Reflect.get(win, name);
  }
  globals.document = win.document;
  globals.window = win;
  container = win.document.createElement("div") as unknown as HTMLElement;
  win.document.body.appendChild(container as never);
});

afterEach(() => {
  delete globals.window;
  delete globals.document;
});

describe("SinwanEventBus namespace patterns", () => {
  it("an exact pattern matches only its own event", () => {
    const bus = new SinwanEventBus();
    const seen: string[] = [];
    bus.onNamespace("user:login", (name, value) => seen.push(`${String(name)}=${String(value)}`));
    bus.emit("user:login", "a");
    bus.emit("user:logout", "b");
    expect(seen).toEqual(["user:login=a"]);
  });

  it("clear(event) also drops the namespace patterns that match it", () => {
    const bus = new SinwanEventBus();
    const seen: string[] = [];
    bus.onNamespace("user:*", () => seen.push("wildcard"));
    bus.onNamespace("admin:*", () => seen.push("admin"));
    bus.clear("user:login");
    bus.emit("user:login");
    bus.emit("admin:login");
    expect(seen).toEqual(["admin"]);
  });
});

describe("useFetch request building", () => {
  it("merges Headers instances from createFetch and the call", async () => {
    let init: RequestInit | undefined;
    const customFetch = createFetch({
      fetchOptions: { headers: new Headers({ "X-Base": "1" }) },
      options: {
        immediate: false,
        fetch: (async (_input: string | URL | Request, options?: RequestInit) => {
          init = options;
          return new Response("{}");
        }) as typeof fetch,
      },
    });
    await customFetch("/users", { headers: new Headers({ "X-Request": "2" }) }).execute();
    expect(init?.headers).toMatchObject({ "x-base": "1", "x-request": "2" });
  });

  it("sends a non-JSON payload as the body with its content type", async () => {
    let init: RequestInit | undefined;
    const fetcher = useFetch("/notes", {
      immediate: false,
      fetch: (async (_input: string | URL | Request, options?: RequestInit) => {
        init = options;
        return new Response("ok");
      }) as typeof fetch,
    })
      .post("plain note", "text")
      .text();
    await fetcher.execute();
    expect(init?.body).toBe("plain note");
    expect(init?.headers).toMatchObject({ "Content-Type": "text/plain" });
  });
});

describe("JSX runtime", () => {
  it("<title> accepts no children, a boolean, or a single child", () => {
    expect(jsx("title", {}).children).toEqual([]);
    expect(jsx("title", { children: false }).children).toEqual([]);
    const single = jsx("title", { children: "Home" });
    expect(single.tag).toBe("title");
    expect(single.children).toEqual(["Home"]);
  });

  it("an unknown symbol tag becomes an empty fragment of its children", () => {
    const element = jsx(Symbol("unknown"), { children: "x" });
    expect(element).toEqual({ tag: "", props: {}, children: ["x"] });
  });

  it("components keep their children in props", () => {
    const Box = cc((props: { children?: SinwanNode }) => jsx("div", { children: props.children }));
    const element = jsx(Box, { children: "inside" });
    expect(element.props).toEqual({ children: "inside" });
    expect(element.children).toEqual(["inside"]);
  });
});

describe("captureOwnerStack", () => {
  it("names an anonymous owner 'Anonymous'", () => {
    const captured: { stack: string | null } = { stack: null };
    const Leaf = cc(function Leaf() {
      captured.stack = captureOwnerStack();
      return jsx("span", {});
    });
    const anonymous = Object.defineProperty(() => jsx(Leaf, {}), "name", { value: "" });
    expect(anonymous.name).toBe("");
    mount(() => jsx(anonymous, {}), container);
    expect(captured.stack).toContain("at Anonymous");
  });
});

describe("renderToPipeableStream.abort", () => {
  it("ignores a destination whose end() throws", () => {
    const writes: unknown[] = [];
    const stream = renderToPipeableStream(jsx("p", { children: "x" }));
    stream.pipe({
      write: (chunk: unknown) => {
        writes.push(chunk);
        return true;
      },
      end: () => {
        throw new Error("closed");
      },
      on: () => undefined,
    });
    expect(() => stream.abort("stop")).not.toThrow();
  });
});

describe("templates", () => {
  it("a reactive text slot renders null and booleans as empty text", async () => {
    const value = signal<string | null | boolean>(null);
    const def = { html: "<p><!--s:0--></p>", slots: [{ path: [0], type: "child" as const }] };
    mount(cc(() => _$createTemplate(def, [value])), container);
    const paragraph = container.querySelector("p")!;
    expect(paragraph.textContent).toBe("");
    value.value = "ready";
    await nextTick();
    expect(paragraph.textContent).toBe("ready");
    value.value = false;
    await nextTick();
    expect(paragraph.textContent).toBe("");
  });

  it("an event slot named without `on` is serialized for hydration", async () => {
    const def = {
      html: '<div><button click="">Go</button></div>',
      slots: [{ path: [0], type: "event" as const, name: "click" }],
    };
    delete globals.window;
    delete globals.document;
    const html = await renderToHydratableString(cc(() => _$createTemplate(def, [() => {}])), {});
    expect(html).toContain('data-sinwan-ev="click:0"');
    expect(html).not.toContain('click=""');
  });
});

describe("renderShell options", () => {
  it("omits the viewport meta and reads empty props in the boot script", async () => {
    delete globals.window;
    delete globals.document;
    const App = cc((): SinwanElement => jsx("main", { children: "app" }));
    const html = await renderShell({ component: App, viewport: null, embedProps: false, bootScript: { module: "/app.js" } });
    expect(html).not.toContain('name="viewport"');
    expect(html).toContain("const p={};");
    expect(html).toContain('import("/app.js")');
  });
});
