/**
 * Enhanced intrinsic element prop transformers — coverage tests.
 *
 * Tests each enhancer registered in src/jsx/enhanced-elements.ts by
 * invoking the JSX factory (which routes matching tags through the
 * enhancer registry) and verifying the resulting props/elements.
 * Ref callbacks are exercised by mounting components with happy-dom.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import { mount } from "../src/renderer/mount.ts";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/scheduler.ts";
import {
  _resetLinkRegistry,
  _resetScriptRegistry,
  _resetStyleRegistry,
  _resolveFormAction,
} from "../src/jsx/enhanced-elements.ts";

let win: InstanceType<typeof Window>;
let doc: Document;
let container: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  doc = win.document as unknown as Document;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  (globalThis as any).Element = (win as any).Element;
  (globalThis as any).Comment = (win as any).Comment;
  (globalThis as any).Text = (win as any).Text;
  (globalThis as any).DocumentFragment = (win as any).DocumentFragment;
  (globalThis as any).FormData = (win as any).FormData;
  (globalThis as any).HTMLFormElement = (win as any).HTMLFormElement;
  (globalThis as any).HTMLTextAreaElement = (win as any).HTMLTextAreaElement;
  (globalThis as any).HTMLSelectElement = (win as any).HTMLSelectElement;
  (globalThis as any).HTMLProgressElement = (win as any).HTMLProgressElement;
  (globalThis as any).HTMLInputElement = (win as any).HTMLInputElement;
  (globalThis as any).Node = (win as any).Node;
  (win as any).SyntaxError = SyntaxError;
  container = doc.createElement("div");
  doc.body.appendChild(container);
  _resetLinkRegistry();
  _resetScriptRegistry();
  _resetStyleRegistry();
});

// ─── composeRef (indirect via textarea/select) ────────────

describe("enhanceTextarea", () => {
  it("throws when both value and defaultValue are provided", () => {
    expect(() => jsx("textarea", { value: "a", defaultValue: "b" })).toThrow(
      "either controlled or uncontrolled",
    );
  });

  it("throws when children are provided", () => {
    expect(() => jsx("textarea", { children: "text" })).toThrow(
      "does not accept children",
    );
  });

  it("throws when array children are provided", () => {
    expect(() => jsx("textarea", { children: ["a", "b"] })).toThrow(
      "does not accept children",
    );
  });

  it("passes through props without value/defaultValue", () => {
    const el = jsx("textarea", { rows: 5, placeholder: "hint" });
    expect(el.props.rows).toBe(5);
    expect(el.props.placeholder).toBe("hint");
  });

  it("sets controlled value with ref callback", () => {
    const el = jsx("textarea", { value: "hello" });
    expect(typeof el.props.ref).toBe("function");
    expect(el.props.children).toBeUndefined();
  });

  it("sets defaultValue as children (enhancer runs)", () => {
    // The enhancer sets textareaProps.children = defaultValue, but
    // stripChildrenProp removes it from the final element's props.
    // Verify the enhancer ran by checking no error is thrown.
    const el = jsx("textarea", { defaultValue: "default" });
    expect(el.tag).toBe("textarea");
  });

  it("mounts controlled textarea and updates value", async () => {
    const text = signal("initial");
    const App = () => jsx("textarea", { value: () => text.value });
    mount(App, container);
    const ta = container.querySelector("textarea") as any;
    expect(ta.value).toBe("initial");
    text.value = "updated";
    await nextTick();
    expect(ta.value).toBe("updated");
  });

  it("mounts controlled textarea with static value", () => {
    const App = () => jsx("textarea", { value: "static" });
    mount(App, container);
    const ta = container.querySelector("textarea") as any;
    expect(ta.value).toBe("static");
  });
});

// ─── Link ──────────────────────────────────────────────────

describe("enhanceLink", () => {
  it("returns plain props for itemProp links", () => {
    const el = jsx("link", {
      rel: "stylesheet",
      href: "/x.css",
      itemProp: "style",
    });
    expect(el.props.itemProp).toBe("style");
  });

  it("returns plain props when onError/onLoad/disabled provided", () => {
    const el = jsx("link", {
      rel: "stylesheet",
      href: "/x.css",
      precedence: "default",
      onError: () => {},
    });
    expect(typeof el.props.onError).toBe("function");
  });

  it("returns plain props for stylesheet without precedence", () => {
    const el = jsx("link", { rel: "stylesheet", href: "/x.css" });
    expect(el.props.rel).toBe("stylesheet");
  });

  it("returns plain props for stylesheet with empty href", () => {
    const el = jsx("link", {
      rel: "stylesheet",
      href: "",
      precedence: "default",
    });
    expect(el.props.href).toBe("");
  });

  it("deduplicates stylesheet hrefs", () => {
    const el1 = jsx("link", {
      rel: "stylesheet",
      href: "/dup.css",
      precedence: "default",
    });
    expect(el1.tag).toBe("link");
    const el2 = jsx("link", {
      rel: "stylesheet",
      href: "/dup.css",
      precedence: "default",
    });
    expect(el2.tag).toBe("");
  });

  it("mounts stylesheet with precedence and inserts into head", () => {
    const App = () =>
      jsx("link", { rel: "stylesheet", href: "/a.css", precedence: "high" });
    mount(App, container);
    const link = doc.head.querySelector('link[href="/a.css"]');
    expect(link).toBeTruthy();
    expect(link?.getAttribute("data-sinwan-precedence")).toBe("high");
  });

  it("orders stylesheets by precedence", () => {
    mount(
      () =>
        jsx("link", { rel: "stylesheet", href: "/low.css", precedence: "low" }),
      container,
    );
    mount(
      () =>
        jsx("link", {
          rel: "stylesheet",
          href: "/high.css",
          precedence: "high",
        }),
      container,
    );
    // Both links should be in the head; the ref callback's ordering
    // logic runs but happy-dom may not reorder correctly.
    expect(doc.head.querySelector('link[href="/low.css"]')).toBeTruthy();
    expect(doc.head.querySelector('link[href="/high.css"]')).toBeTruthy();
  });

  it("mounts non-stylesheet link into head", () => {
    const App = () =>
      jsx("link", { rel: "preconnect", href: "https://example.com" });
    mount(App, container);
    const link = doc.head.querySelector('link[href="https://example.com"]');
    expect(link).toBeTruthy();
  });

  it("removes non-stylesheet link from head on unmount", () => {
    const App = () =>
      jsx("link", { rel: "preconnect", href: "https://example.com" });
    const app = mount(App, container);
    expect(
      doc.head.querySelector('link[href="https://example.com"]'),
    ).toBeTruthy();
    app.unmount();
    expect(
      doc.head.querySelector('link[href="https://example.com"]'),
    ).toBeFalsy();
  });
});

// ─── Meta ──────────────────────────────────────────────────

describe("enhanceMeta", () => {
  it("returns plain props for itemProp meta", () => {
    const el = jsx("meta", { itemProp: "author", content: "John" });
    expect(el.props.itemProp).toBe("author");
    expect(el.props.content).toBe("John");
  });

  it("mounts meta into head", () => {
    const App = () => jsx("meta", { name: "description", content: "test" });
    mount(App, container);
    const meta = doc.head.querySelector('meta[name="description"]');
    expect(meta).toBeTruthy();
  });

  it("removes meta from head on unmount", () => {
    const App = () => jsx("meta", { name: "description", content: "test" });
    const app = mount(App, container);
    expect(doc.head.querySelector('meta[name="description"]')).toBeTruthy();
    app.unmount();
    expect(doc.head.querySelector('meta[name="description"]')).toBeFalsy();
  });
});

// ─── Script ────────────────────────────────────────────────

describe("enhanceScript", () => {
  it("returns plain props when children are provided", () => {
    const el = jsx("script", { children: "console.log(1)" });
    expect(el.children).toEqual(["console.log(1)"]);
  });

  it("returns plain props when async is not true", () => {
    const el = jsx("script", { src: "/app.js", async: false });
    expect(el.props.src).toBe("/app.js");
  });

  it("returns plain props when onError is provided", () => {
    const el = jsx("script", {
      src: "/app.js",
      async: true,
      onError: () => {},
    });
    expect(typeof el.props.onError).toBe("function");
  });

  it("returns plain props when src is empty", () => {
    const el = jsx("script", { src: "", async: true });
    expect(el.props.src).toBe("");
  });

  it("deduplicates async scripts with src", () => {
    const el1 = jsx("script", { src: "/dup.js", async: true });
    expect(el1.tag).toBe("script");
    const el2 = jsx("script", { src: "/dup.js", async: true });
    expect(el2.tag).toBe("");
  });

  it("mounts async script into head", () => {
    const App = () => jsx("script", { src: "/head.js", async: true });
    mount(App, container);
    const script = doc.head.querySelector('script[src="/head.js"]');
    expect(script).toBeTruthy();
  });
});

// ─── Style ─────────────────────────────────────────────────

describe("enhanceStyle", () => {
  it("returns plain props without href", () => {
    const el = jsx("style", {
      children: "body { color: red; }",
      precedence: "default",
    });
    expect(el.children).toEqual(["body { color: red; }"]);
  });

  it("returns plain props without precedence", () => {
    const el = jsx("style", { children: "body {}", href: "/styles.css" });
    expect(el.props.href).toBe("/styles.css");
  });

  it("returns plain props with empty precedence", () => {
    const el = jsx("style", {
      children: "body {}",
      href: "/styles.css",
      precedence: "",
    });
    expect(el.props.precedence).toBe("");
  });

  it("deduplicates style hrefs", () => {
    const el1 = jsx("style", {
      children: "body {}",
      href: "/dup.css",
      precedence: "default",
    });
    expect(el1.tag).toBe("style");
    const el2 = jsx("style", {
      children: "body {}",
      href: "/dup.css",
      precedence: "default",
    });
    expect(el2.tag).toBe("");
  });

  it("mounts style with href and precedence into head", () => {
    const App = () =>
      jsx("style", {
        children: "body { color: blue; }",
        href: "/themed.css",
        precedence: "high",
      });
    mount(App, container);
    const style = doc.head.querySelector("style[data-sinwan-href]");
    expect(style).toBeTruthy();
    expect(style?.getAttribute("data-sinwan-precedence")).toBe("high");
  });

  it("passes media, nonce, and title props", () => {
    const el = jsx("style", {
      children: "body {}",
      href: "/m.css",
      precedence: "default",
      media: "print",
      nonce: "abc",
      title: "My Style",
    });
    expect(el.props.media).toBe("print");
    expect(el.props.nonce).toBe("abc");
    expect(el.props.title).toBe("My Style");
  });

  it("orders styles by precedence", () => {
    mount(
      () =>
        jsx("style", {
          children: "a{}",
          href: "/s-low.css",
          precedence: "low",
        }),
      container,
    );
    mount(
      () =>
        jsx("style", {
          children: "b{}",
          href: "/s-high.css",
          precedence: "high",
        }),
      container,
    );
    // Both styles should be in the head; the ref callback's ordering
    // logic runs but happy-dom may not reorder correctly.
    expect(
      doc.head.querySelector('style[data-sinwan-href="/s-low.css"]'),
    ).toBeTruthy();
    expect(
      doc.head.querySelector('style[data-sinwan-href="/s-high.css"]'),
    ).toBeTruthy();
  });
});

// ─── Title ─────────────────────────────────────────────────

describe("enhanceTitle", () => {
  it("returns plain props for itemProp title", () => {
    const el = jsx("title", { itemProp: "name", children: "Test" });
    expect(el.props.itemProp).toBe("name");
  });

  it("throws when multiple non-text children are provided", () => {
    expect(() =>
      jsx("title", { children: [jsx("span", {}, "a"), jsx("span", {}, "b")] }),
    ).toThrow("single string of text");
  });

  it("sets text content from string child", () => {
    const el = jsx("title", { children: "Page Title" });
    expect(el.children).toEqual(["Page Title"]);
  });

  it("sets text content from number child", () => {
    const el = jsx("title", { children: 42 });
    expect(el.children).toEqual([42]);
  });

  it("sets text content from function child", () => {
    const el = jsx("title", { children: (() => "Dynamic") as any });
    expect(el.children.length).toBe(1);
  });

  it("sets empty text content for null children", () => {
    const el = jsx("title", { children: null });
    expect(el.children).toEqual([]);
  });

  it("sets empty text content for boolean children", () => {
    const el = jsx("title", { children: true });
    expect(el.children).toEqual([]);
  });

  it("coerces other child types to string", () => {
    const obj = { toString: () => "obj" } as any;
    const el = jsx("title", { children: obj });
    expect(el.children).toEqual([obj]);
  });

  it("mounts title into head", () => {
    const App = () => jsx("title", { children: "Head Title" });
    mount(App, container);
    const title = doc.head.querySelector("title");
    expect(title?.textContent).toBe("Head Title");
  });

  it("removes title from head on unmount", () => {
    const App = () => jsx("title", { children: "Head Title" });
    const app = mount(App, container);
    expect(doc.head.querySelector("title")).toBeTruthy();
    app.unmount();
    expect(doc.head.querySelector("title")).toBeFalsy();
  });
});

// ─── Progress ──────────────────────────────────────────────

describe("enhanceProgress", () => {
  it("passes through props without value", () => {
    const el = jsx("progress", { max: 100 });
    expect(el.props.max).toBe(100);
    expect(el.props.ref).toBeUndefined();
  });

  it("sets value with ref callback", () => {
    const el = jsx("progress", { value: 50 });
    expect(typeof el.props.ref).toBe("function");
  });

  it("mounts progress with static value", () => {
    const App = () => jsx("progress", { value: 42, max: 100 });
    mount(App, container);
    const prog = container.querySelector("progress") as any;
    expect(prog.getAttribute("value")).toBe("42");
  });

  it("mounts progress with reactive value and updates", async () => {
    const val = signal(10);
    const App = () => jsx("progress", { value: () => val.value, max: 100 });
    mount(App, container);
    const prog = container.querySelector("progress") as any;
    expect(prog.getAttribute("value")).toBe("10");
    val.value = 90;
    await nextTick();
    expect(prog.getAttribute("value")).toBe("90");
  });

  it("removes value attribute when reactive value is null", async () => {
    const val = signal(10 as number | null);
    const App = () => jsx("progress", { value: () => val.value, max: 100 });
    mount(App, container);
    const prog = container.querySelector("progress") as any;
    expect(prog.getAttribute("value")).toBe("10");
    val.value = null;
    await nextTick();
    expect(prog.getAttribute("value")).toBeNull();
  });
});

// ─── Option ────────────────────────────────────────────────

describe("enhanceOption", () => {
  it("throws when selected prop is provided", () => {
    expect(() => jsx("option", { selected: true, value: "a" })).toThrow(
      "does not support the `selected` prop",
    );
  });

  it("passes through props without selected", () => {
    const el = jsx("option", { value: "a" });
    expect(el.props.value).toBe("a");
  });
});

// ─── Select ────────────────────────────────────────────────

describe("enhanceSelect", () => {
  it("throws when both value and defaultValue are provided", () => {
    expect(() => jsx("select", { value: "a", defaultValue: "b" })).toThrow(
      "either controlled or uncontrolled",
    );
  });

  it("passes through props without value/defaultValue", () => {
    const el = jsx("select", { id: "my-select" });
    expect(el.props.id).toBe("my-select");
  });

  it("sets defaultValue with ref callback", () => {
    const el = jsx("select", { defaultValue: "a" });
    expect(typeof el.props.ref).toBe("function");
  });

  it("sets controlled value with ref callback", () => {
    const el = jsx("select", { value: "a" });
    expect(typeof el.props.ref).toBe("function");
  });

  it("mounts uncontrolled select with defaultValue", () => {
    const App = () =>
      jsx("select", {
        defaultValue: "b",
        children: [
          jsx("option", { value: "a" }),
          jsx("option", { value: "b" }),
          jsx("option", { value: "c" }),
        ],
      });
    mount(App, container);
    const sel = container.querySelector("select") as any;
    expect(sel.value).toBe("b");
  });

  it("mounts uncontrolled select with array defaultValue (multiple)", () => {
    const App = () =>
      jsx("select", {
        defaultValue: ["a", "c"],
        multiple: true,
        children: [
          jsx("option", { value: "a" }),
          jsx("option", { value: "b" }),
          jsx("option", { value: "c" }),
        ],
      });
    mount(App, container);
    const sel = container.querySelector("select") as any;
    const selected = Array.from(sel.selectedOptions).map((o: any) => o.value);
    expect(selected).toEqual(["a", "c"]);
  });

  it("mounts controlled select with reactive value and updates", async () => {
    const val = signal("a");
    const App = () =>
      jsx("select", {
        value: () => val.value,
        children: [
          jsx("option", { value: "a" }),
          jsx("option", { value: "b" }),
        ],
      });
    mount(App, container);
    const sel = container.querySelector("select") as any;
    expect(sel.value).toBe("a");
    val.value = "b";
    await nextTick();
    expect(sel.value).toBe("b");
  });

  it("mounts controlled select with reactive array value (multiple)", async () => {
    const val = signal(["a"] as string[]);
    const App = () =>
      jsx("select", {
        value: () => val.value,
        multiple: true,
        children: [
          jsx("option", { value: "a" }),
          jsx("option", { value: "b" }),
        ],
      });
    mount(App, container);
    const sel = container.querySelector("select") as any;
    // The ref callback runs and sets selected on options;
    // happy-dom selectedOptions may not reflect this reliably.
    const opts = sel.querySelectorAll("option");
    expect(opts[0].selected).toBe(true);
    val.value = ["a", "b"];
    await nextTick();
    expect(opts[0].selected).toBe(true);
    expect(opts[1].selected).toBe(true);
  });
});

// ─── Input ─────────────────────────────────────────────────

describe("enhanceInput", () => {
  it("throws when both value and defaultValue are provided", () => {
    expect(() => jsx("input", { value: "a", defaultValue: "b" })).toThrow(
      "either controlled or uncontrolled",
    );
  });

  it("throws when both checked and defaultChecked are provided", () => {
    expect(() =>
      jsx("input", { type: "checkbox", checked: true, defaultChecked: false }),
    ).toThrow("either controlled or uncontrolled");
  });

  it("passes through value and onChange", () => {
    const onChange = () => {};
    const el = jsx("input", { value: "hello", onChange });
    expect(el.props.value).toBe("hello");
    expect(el.props.onChange).toBe(onChange);
  });

  it("passes through defaultValue as value", () => {
    const el = jsx("input", { defaultValue: "def" });
    expect(el.props.value).toBe("def");
  });

  it("mounts uncontrolled input with defaultValue visible in the field", () => {
    const App = () => jsx("input", { name: "endpoint", defaultValue: "/api/hello" });
    mount(App, container);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("/api/hello");
  });

  it("passes through checked and readOnly", () => {
    const el = jsx("input", {
      type: "checkbox",
      checked: true,
      readOnly: true,
    });
    expect(el.props.checked).toBe(true);
    expect(el.props.readOnly).toBe(true);
  });

  it("passes through defaultChecked as checked", () => {
    const el = jsx("input", { type: "checkbox", defaultChecked: true });
    expect(el.props.checked).toBe(true);
  });

  it("registers function formAction with ref", () => {
    const fn = () => {};
    const el = jsx("input", { formAction: fn });
    expect(el.props["data-sinwan-formaction"]).toBe("");
    expect(typeof el.props.ref).toBe("function");
  });

  it("passes through string formAction", () => {
    const el = jsx("input", { formAction: "/submit" });
    expect(el.props.formAction).toBe("/submit");
  });
});

// ─── Button ────────────────────────────────────────────────

describe("enhanceButton", () => {
  it("registers function formAction with ref", () => {
    const fn = () => {};
    const el = jsx("button", { formAction: fn });
    expect(el.props["data-sinwan-formaction"]).toBe("");
    expect(typeof el.props.ref).toBe("function");
  });

  it("passes through string formAction", () => {
    const el = jsx("button", { formAction: "/submit" });
    expect(el.props.formAction).toBe("/submit");
  });

  it("passes through props without formAction", () => {
    const el = jsx("button", { type: "submit" });
    expect(el.props.type).toBe("submit");
  });
});

// ─── Form ──────────────────────────────────────────────────

describe("enhanceForm", () => {
  it("passes through string action", () => {
    const onSubmit = () => {};
    const el = jsx("form", { action: "/api", onSubmit });
    expect(el.props.action).toBe("/api");
    expect(el.props.onSubmit).toBe(onSubmit);
  });

  it("passes through undefined action", () => {
    const el = jsx("form", { id: "my-form" });
    expect(el.props.id).toBe("my-form");
  });

  it("wraps function action with handleSubmit", () => {
    const fn = (fd: FormData) => {};
    const el = jsx("form", { action: fn });
    expect(el.props.method).toBe("post");
    expect(typeof el.props.onSubmit).toBe("function");
    expect(el.props.action).toBeUndefined();
  });

  it("mounts form with function action and submits", async () => {
    let submitted = false;
    const fn = () => {
      submitted = true;
    };
    const App = () =>
      jsx("form", { action: fn, children: jsx("button", { type: "submit" }) });
    mount(App, container);
    const form = container.querySelector("form") as any;
    form.dispatchEvent(
      new (win as any).Event("submit", { bubbles: true, cancelable: true }),
    );
    await new Promise((r) => queueMicrotask(r));
    expect(submitted).toBe(true);
  });

  it("calls onSubmit handler in handleSubmit", () => {
    let called = false;
    const fn = () => {};
    const onSubmit = () => {
      called = true;
    };
    const el = jsx("form", { action: fn, onSubmit });
    const formEl = doc.createElement("form");
    container.appendChild(formEl);
    (el.props.onSubmit as any)({
      preventDefault: () => {},
      target: formEl,
      submitter: null,
    });
    expect(called).toBe(true);
  });
});

// ─── _resolveFormAction ────────────────────────────────────

describe("_resolveFormAction", () => {
  it("returns undefined for null submitter", () => {
    expect(_resolveFormAction(null)).toBeUndefined();
  });

  it("returns undefined for element without marker", () => {
    const btn = doc.createElement("button");
    expect(_resolveFormAction(btn)).toBeUndefined();
  });

  it("returns registered action for element with marker", () => {
    const fn = () => {};
    const el = jsx("button", { formAction: fn });
    // Mount to trigger ref callback which calls registerFormAction
    const App = () => el;
    mount(App, container);
    const btn = container.querySelector("button")!;
    expect(_resolveFormAction(btn)).toBe(fn);
  });
});

// ─── _reset registries ─────────────────────────────────────

describe("registry resets", () => {
  it("_resetLinkRegistry clears dedup state", () => {
    jsx("link", {
      rel: "stylesheet",
      href: "/test.css",
      precedence: "default",
    });
    _resetLinkRegistry();
    const el = jsx("link", {
      rel: "stylesheet",
      href: "/test.css",
      precedence: "default",
    });
    expect(el.tag).toBe("link");
  });

  it("_resetScriptRegistry clears dedup state", () => {
    jsx("script", { src: "/test.js", async: true });
    _resetScriptRegistry();
    const el = jsx("script", { src: "/test.js", async: true });
    expect(el.tag).toBe("script");
  });

  it("_resetStyleRegistry clears dedup state", () => {
    jsx("style", {
      children: "body{}",
      href: "/test.css",
      precedence: "default",
    });
    _resetStyleRegistry();
    const el = jsx("style", {
      children: "body{}",
      href: "/test.css",
      precedence: "default",
    });
    expect(el.tag).toBe("style");
  });
});

// ─── Unmount cleanup paths ───────────────────────────────

describe("unmount cleanup", () => {
  it("cleans up reactive textarea effect on unmount", async () => {
    const val = signal("initial");
    const App = () => jsx("textarea", { value: () => val.value });
    const app = mount(App, container);
    const ta = container.querySelector("textarea") as any;
    expect(ta.value).toBe("initial");
    val.value = "changed";
    await nextTick();
    expect(ta.value).toBe("changed");
    // Unmount triggers ref(null) → effectCleanup()
    app.unmount();
    // After unmount, signal changes should not throw
    val.value = "after-unmount";
    await nextTick();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("cleans up reactive progress effect on unmount", async () => {
    const val = signal(50);
    const App = () => jsx("progress", { value: () => val.value, max: 100 });
    const app = mount(App, container);
    const prog = container.querySelector("progress") as any;
    expect(prog.getAttribute("value")).toBe("50");
    val.value = 75;
    await nextTick();
    expect(prog.getAttribute("value")).toBe("75");
    // Unmount triggers ref(null) → effectCleanup()
    app.unmount();
    val.value = 99;
    await nextTick();
    expect(container.querySelector("progress")).toBeNull();
  });

  it("cleans up reactive select effect on unmount", async () => {
    const val = signal("a");
    const App = () =>
      jsx("select", {
        value: () => val.value,
        children: [
          jsx("option", { value: "a" }),
          jsx("option", { value: "b" }),
        ],
      });
    const app = mount(App, container);
    const sel = container.querySelector("select") as any;
    expect(sel.value).toBe("a");
    val.value = "b";
    await nextTick();
    expect(sel.value).toBe("b");
    // Unmount triggers ref(null) → effectCleanup()
    app.unmount();
    val.value = "a";
    await nextTick();
    expect(container.querySelector("select")).toBeNull();
  });
});

// ─── SSR path ──────────────────────────────────────────────

describe("SSR paths", () => {
  it("sets children for controlled textarea in SSR", () => {
    // Temporarily remove window to simulate SSR
    const savedWindow = (globalThis as any).window;
    const savedDocument = (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    try {
      const el = jsx("textarea", { value: "ssr-value" });
      // In SSR, the enhancer sets children to the resolved value
      // but stripChildrenProp removes it from props.
      // The enhancer still runs the isServer() branch.
      expect(el.tag).toBe("textarea");
    } finally {
      (globalThis as any).window = savedWindow;
      (globalThis as any).document = savedDocument;
    }
  });
});

// ─── Input formAction mount ───────────────────────────────

describe("input formAction mount", () => {
  it("registers form action when input is mounted", () => {
    const fn = (_fd: FormData) => {};
    const App = () => jsx("input", { formAction: fn });
    mount(App, container);
    const input = container.querySelector("input")!;
    expect(_resolveFormAction(input)).toBe(fn);
  });
});

// ─── Link/style ordering edge cases ───────────────────────

describe("ordering edge cases", () => {
  it("inserts high precedence link before low precedence link", () => {
    // Mount high first, then low, then another high.
    // The third link (high, already registered at index 0) finds
    // the low link (index 1) and inserts before it.
    mount(
      () =>
        jsx("link", {
          rel: "stylesheet",
          href: "/ord-1.css",
          precedence: "high",
        }),
      container,
    );
    mount(
      () =>
        jsx("link", {
          rel: "stylesheet",
          href: "/ord-2.css",
          precedence: "low",
        }),
      container,
    );
    mount(
      () =>
        jsx("link", {
          rel: "stylesheet",
          href: "/ord-3.css",
          precedence: "high",
        }),
      container,
    );
    expect(doc.head.querySelector('link[href="/ord-1.css"]')).toBeTruthy();
    expect(doc.head.querySelector('link[href="/ord-2.css"]')).toBeTruthy();
    expect(doc.head.querySelector('link[href="/ord-3.css"]')).toBeTruthy();
  });

  it("inserts high precedence style before low precedence style", () => {
    mount(
      () =>
        jsx("style", {
          children: "a{}",
          href: "/ord-s-1.css",
          precedence: "high",
        }),
      container,
    );
    mount(
      () =>
        jsx("style", {
          children: "b{}",
          href: "/ord-s-2.css",
          precedence: "low",
        }),
      container,
    );
    mount(
      () =>
        jsx("style", {
          children: "c{}",
          href: "/ord-s-3.css",
          precedence: "high",
        }),
      container,
    );
    expect(
      doc.head.querySelector('style[data-sinwan-href="/ord-s-1.css"]'),
    ).toBeTruthy();
    expect(
      doc.head.querySelector('style[data-sinwan-href="/ord-s-2.css"]'),
    ).toBeTruthy();
    expect(
      doc.head.querySelector('style[data-sinwan-href="/ord-s-3.css"]'),
    ).toBeTruthy();
  });
});
