/**
 * ARIA attributes are enumerated strings: boolean `true` / `false` serialize
 * to "true" / "false" on both the client and SSR, while non-ARIA boolean
 * attributes and `data-*` keep presence/absence semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { render } from "../src/renderer/mount.ts";
import { setSingleAttribute } from "../src/renderer/set-attribute.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import { SINWAN_TEMPLATE } from "../src/renderer/template-identity.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { booleanAttributeValue } from "../src/common/boolean-attributes.ts";
import { renderServerAttribute } from "../src/server/attribute-utils.ts";
import { renderToString } from "../src/server/renderer.ts";
import {
  renderNodeToHydratableString,
  renderToHydratableString,
} from "../src/server/hydration-markers.ts";
import {
  streamHydratableNode,
  streamPage,
} from "../src/server/stream.ts";
import { renderShell } from "../src/server/shell.ts";
import { cc } from "../src/component/create.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";

function el(
  tag: string,
  props: Record<string, unknown> = {},
  ...children: SinwanNode[]
): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

async function streamToString(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  return new Response(stream).text();
}

describe("booleanAttributeValue", () => {
  it("serializes aria-* booleans as enumerated strings", () => {
    expect(booleanAttributeValue("aria-selected", true)).toBe("true");
    expect(booleanAttributeValue("aria-selected", false)).toBe("false");
  });

  it("serializes HTML enumerated attributes as 'true' or removal", () => {
    expect(booleanAttributeValue("draggable", true)).toBe("true");
    expect(booleanAttributeValue("draggable", false)).toBeNull();
  });

  it("keeps presence semantics for boolean and data-* attributes", () => {
    expect(booleanAttributeValue("disabled", true)).toBe("");
    expect(booleanAttributeValue("disabled", false)).toBeNull();
    expect(booleanAttributeValue("data-open", true)).toBe("");
    expect(booleanAttributeValue("data-open", false)).toBeNull();
  });
});

describe("client ARIA boolean attributes", () => {
  let doc: Document;
  let container: HTMLElement;

  beforeEach(() => {
    const win = new Window({ url: "http://localhost" });
    doc = win.document as unknown as Document;
    Object.assign(globalThis, {
      document: doc,
      window: win,
      Element: win.Element,
      Comment: win.Comment,
      Text: win.Text,
      DocumentFragment: win.DocumentFragment,
    });
    Object.assign(win, { SyntaxError });
    container = doc.createElement("div");
    doc.body.appendChild(container);
  });

  function button(): HTMLButtonElement {
    const found = container.querySelector("button");
    if (!found) throw new Error("button not rendered");
    return found;
  }

  it("renders static aria booleans through the element path", () => {
    render(
      el("button", {
        "aria-selected": true,
        "aria-expanded": false,
        "aria-disabled": true,
        "aria-hidden": true,
        "aria-invalid": false,
        "aria-label": undefined,
      }),
      container,
    );
    const b = button();
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.getAttribute("aria-hidden")).toBe("true");
    expect(b.getAttribute("aria-invalid")).toBe("false");
    expect(b.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps boolean and data-* attribute semantics on the element path", () => {
    render(
      el("button", {
        disabled: true,
        hidden: false,
        "data-active": true,
        "data-open": false,
      }),
      container,
    );
    const b = button();
    expect(b.getAttribute("disabled")).toBe("");
    expect(b.disabled).toBe(true);
    expect(b.hasAttribute("hidden")).toBe(false);
    expect(b.getAttribute("data-active")).toBe("");
    expect(b.hasAttribute("data-open")).toBe(false);
  });

  it("toggles a reactive aria boolean on the element path", async () => {
    const selected = signal<boolean | undefined>(true);
    render(el("button", { "aria-selected": selected }), container);
    const b = button();
    expect(b.getAttribute("aria-selected")).toBe("true");

    selected.value = false;
    await nextTick();
    expect(b.getAttribute("aria-selected")).toBe("false");

    selected.value = undefined;
    await nextTick();
    expect(b.hasAttribute("aria-selected")).toBe(false);

    selected.value = true;
    await nextTick();
    expect(b.getAttribute("aria-selected")).toBe("true");
  });

  function mountTemplate(def: TemplateDef, dynamics: unknown[]): HTMLElement {
    const result = _$createTemplate(def, dynamics);
    if (!(SINWAN_TEMPLATE in result)) {
      throw new Error("expected a live template result");
    }
    container.appendChild(result.fragment);
    return button();
  }

  it("renders static aria booleans through template attr slots", () => {
    const def: TemplateDef = {
      html: '<button aria-selected="" aria-expanded="" data-open="" disabled=""></button>',
      slots: [
        { path: [], type: "attr", name: "aria-selected" },
        { path: [], type: "attr", name: "aria-expanded" },
        { path: [], type: "attr", name: "data-open" },
        { path: [], type: "attr", name: "disabled" },
      ],
    };
    const b = mountTemplate(def, [true, false, true, false]);
    expect(b.getAttribute("aria-selected")).toBe("true");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("data-open")).toBe("");
    expect(b.hasAttribute("disabled")).toBe(false);
  });

  it("toggles reactive aria booleans through template attr slots", async () => {
    const expanded = signal<boolean | undefined>(false);
    const disabled = signal<boolean | null>(true);
    const def: TemplateDef = {
      html: '<button aria-expanded="" aria-disabled=""></button>',
      slots: [
        { path: [], type: "attr", name: "aria-expanded" },
        { path: [], type: "attr", name: "aria-disabled" },
      ],
    };
    const b = mountTemplate(def, [expanded, () => disabled.value]);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.getAttribute("aria-disabled")).toBe("true");

    expanded.value = true;
    disabled.value = false;
    await nextTick();
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("false");

    expanded.value = undefined;
    disabled.value = null;
    await nextTick();
    expect(b.hasAttribute("aria-expanded")).toBe(false);
    expect(b.hasAttribute("aria-disabled")).toBe(false);
  });

  it("clears DOM properties when a property-backed attribute is false", () => {
    const input = doc.createElement("input");
    setSingleAttribute(input, "checked", true);
    expect(input.checked).toBe(true);
    setSingleAttribute(input, "checked", false);
    expect(input.checked).toBe(false);
    expect(input.hasAttribute("checked")).toBe(false);

    setSingleAttribute(input, "value", "x");
    setSingleAttribute(input, "value", false);
    expect(input.value).toBe("");
  });
});

describe("SSR ARIA boolean attributes", () => {
  const ariaProps = {
    "aria-selected": true,
    "aria-expanded": false,
    "aria-hidden": undefined,
    disabled: true,
    hidden: false,
    "data-active": true,
    "data-open": false,
  };
  const expectedHtml =
    '<button aria-selected="true" aria-expanded="false" disabled data-active>x</button>';

  it("renders aria booleans in renderServerAttribute", () => {
    expect(renderServerAttribute("aria-selected", true)).toBe(
      ' aria-selected="true"',
    );
    expect(renderServerAttribute("aria-selected", false)).toBe(
      ' aria-selected="false"',
    );
    expect(renderServerAttribute("aria-selected", null)).toBe("");
    expect(renderServerAttribute("disabled", false)).toBe("");
    expect(renderServerAttribute("data-open", true)).toBe(" data-open");
  });

  it("renders aria booleans in renderToString", async () => {
    expect(await renderToString(el("button", ariaProps, "x"))).toBe(
      expectedHtml,
    );
  });

  it("renders aria booleans in streamPage", async () => {
    const html = await streamToString(
      streamPage(() => el("button", ariaProps, "x"), {}),
    );
    expect(html).toBe(expectedHtml);
  });

  it("renders aria booleans in hydratable string and stream output", async () => {
    const expanded = signal(false);
    const node = el("button", { ...ariaProps, "aria-expanded": expanded }, "x");
    const fromString = await renderNodeToHydratableString(node);
    const fromStream = await streamToString(streamHydratableNode(node));
    for (const html of [fromString, fromStream]) {
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("aria-hidden");
      expect(html).not.toContain("hidden=");
      expect(html).not.toContain("data-open");
      expect(html).toContain(" data-active");
    }
  });

  it("renders aria booleans in shell html and body attributes", async () => {
    const App = cc(() => el("p", {}, "x"));
    const html = await renderShell({
      component: App,
      htmlAttrs: { "aria-busy": false },
      bodyAttrs: { "aria-hidden": true, "data-ready": false },
    });
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('<body aria-hidden="true">');
  });

  describe("template attr slots without a DOM", () => {
    let originalDocument: unknown;
    let originalWindow: unknown;

    beforeEach(() => {
      originalDocument = Reflect.get(globalThis, "document");
      originalWindow = Reflect.get(globalThis, "window");
      Reflect.deleteProperty(globalThis, "document");
      Reflect.deleteProperty(globalThis, "window");
    });

    afterEach(() => {
      Object.assign(globalThis, {
        document: originalDocument,
        window: originalWindow,
      });
    });

    it("replaces aria placeholders with 'true' / 'false'", async () => {
      const def: TemplateDef = {
        html: '<div><button aria-selected="" aria-expanded="" aria-hidden="" data-open="">x</button></div>',
        slots: [
          { path: [0], type: "attr", name: "aria-selected" },
          { path: [0], type: "attr", name: "aria-expanded" },
          { path: [0], type: "attr", name: "aria-hidden" },
          { path: [0], type: "attr", name: "data-open" },
        ],
      };
      const App = cc(() =>
        _$createTemplate(def, [true, () => false, undefined, false]),
      );
      const html = await renderToHydratableString(App, {});
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("aria-hidden");
      expect(html).not.toContain("data-open");
    });
  });
});
