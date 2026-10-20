/**
 * Coverage for control-flow registry dispatch edges used by the renderer.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import {
  expandRegisteredFactory,
  getControlFlowEntry,
  isControlFlowElement,
  registerControlFlowFactory,
} from "../src/control-flow/registry.ts";
import { renderControlFlowToDOM } from "../src/renderer/render-control-flow.ts";
import { For } from "../src/control-flow/components/for/client.ts";
import type { SinwanElement } from "../src/types.ts";

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

afterEach(() => {
  container.remove();
  (globalThis as any).document = undefined;
  (globalThis as any).window = undefined;
});

describe("control-flow registry", () => {
  it("returns null from expandRegisteredFactory for non-factory tags", () => {
    expect(
      expandRegisteredFactory({
        tag: "div",
        props: {},
        children: [],
      }),
    ).toBeNull();

    const orphan = (): SinwanElement => ({
      tag: "span",
      props: {},
      children: [],
    });
    expect(
      expandRegisteredFactory({
        tag: orphan,
        props: {},
        children: [],
      }),
    ).toBeNull();
  });

  it("ignores non-symbol/non-string tags in getControlFlowEntry", () => {
    expect(getControlFlowEntry(42)).toBeUndefined();
    expect(getControlFlowEntry({})).toBeUndefined();
    expect(
      isControlFlowElement({
        tag: 42 as unknown as string,
        props: {},
        children: [],
      }),
    ).toBe(false);
  });

  it("expands a registered factory-only control-flow", () => {
    const Fake = (props: { label?: string }): SinwanElement => ({
      tag: "span",
      props: { children: props.label ?? "" },
      children: [props.label ?? ""],
    });
    registerControlFlowFactory(Fake, (element) =>
      Fake(element.props as { label?: string }),
    );
    const expanded = expandRegisteredFactory({
      tag: Fake,
      props: { label: "ok" },
      children: [],
    });
    expect(expanded?.tag).toBe("span");
    expect((expanded?.props as { children?: string }).children).toBe("ok");
  });

  it("renders an empty fragment when the control-flow tag is unregistered", () => {
    const unknown = Symbol("Sinwan.Unregistered");
    const mounted = renderControlFlowToDOM(
      { tag: unknown, props: {}, children: [] },
      container,
      null,
      null,
    );
    expect(mounted.type).toBe("fragment");
    if (mounted.type !== "fragment") {
      throw new Error("expected fragment");
    }
    expect(mounted.children).toEqual([]);
    expect(container.childNodes.length).toBe(0);
  });

  it("recognizes a registered block tag after importing For", () => {
    const element = For({ each: [], children: () => null });
    expect(isControlFlowElement(element)).toBe(true);
    expect(getControlFlowEntry(element.tag)).toBeDefined();
  });
});
