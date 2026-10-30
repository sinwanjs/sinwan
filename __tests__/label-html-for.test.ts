/**
 * JSX types name the label association prop `htmlFor` (the DOM property).
 * The client renderer must write the HTML attribute `for`, as the server
 * renderer already does; `htmlfor` is ignored by browsers.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { signal } from "../src/reactivity/signal.ts";
import { nextTick } from "../src/reactivity/index.ts";
import { render } from "../src/renderer/mount.ts";
import { setSingleAttribute } from "../src/renderer/set-attribute.ts";
import { _$createTemplate } from "../src/renderer/template.ts";
import { SINWAN_TEMPLATE } from "../src/renderer/template-identity.ts";
import type { TemplateDef } from "../src/renderer/template-protocol.ts";
import { renderServerAttribute } from "../src/server/attribute-utils.ts";
import type { SinwanElement, SinwanNode } from "../src/types.ts";

function el(
  tag: string,
  props: Record<string, unknown> = {},
  ...children: SinwanNode[]
): SinwanElement {
  return { tag, props: { ...props, children }, children };
}

describe("label htmlFor on the client", () => {
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

  function label(): HTMLLabelElement {
    const found = container.querySelector("label");
    if (!found) throw new Error("label not rendered");
    return found;
  }

  it("writes `for` through the element path", () => {
    render(el("label", { htmlFor: "email" }, "Email"), container);
    expect(label().getAttribute("for")).toBe("email");
    expect(label().hasAttribute("htmlfor")).toBe(false);
    expect(label().htmlFor).toBe("email");
  });

  it("updates and clears a reactive htmlFor", async () => {
    const target = signal<string | undefined>("name");
    render(el("label", { htmlFor: target }, "Name"), container);
    expect(label().getAttribute("for")).toBe("name");

    target.value = "email";
    await nextTick();
    expect(label().getAttribute("for")).toBe("email");

    target.value = undefined;
    await nextTick();
    expect(label().hasAttribute("for")).toBe(false);
    expect(label().hasAttribute("htmlfor")).toBe(false);
  });

  it("writes `for` through compiled template attr slots", () => {
    const def: TemplateDef = {
      html: '<label for="">Topic</label>',
      slots: [{ path: [], type: "attr", name: "htmlFor" }],
    };
    const result = _$createTemplate(def, ["topic-sales"]);
    if (!(SINWAN_TEMPLATE in result)) throw new Error("expected a live template result");
    container.appendChild(result.fragment);
    expect(label().getAttribute("for")).toBe("topic-sales");
    expect(label().hasAttribute("htmlfor")).toBe(false);
  });

  it("setSingleAttribute maps htmlFor for direct callers", () => {
    const node = doc.createElement("label");
    setSingleAttribute(node, "htmlFor", "phone");
    expect(node.getAttribute("for")).toBe("phone");
    setSingleAttribute(node, "htmlFor", null);
    expect(node.hasAttribute("for")).toBe(false);
  });

  it("matches the server renderer", () => {
    expect(renderServerAttribute("htmlFor", "email")).toBe(' for="email"');
  });
});
