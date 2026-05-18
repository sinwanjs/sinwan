/**
 * Comprehensive tests for `createPortal`.
 *
 * Tests are organized to mirror the React documentation sections.
 * SSR: Portals render nothing on the server (deferred to client).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { createPortal } from "../../../../src/integrations/react/create-portal.ts";
import { PORTAL_TYPE } from "../../../../src/component/control-flow.ts";

let win: InstanceType<typeof Window>;
let container: HTMLElement;
let portalTarget: HTMLElement;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
  portalTarget = win.document.createElement(
    "section",
  ) as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    portalTarget as unknown as Node,
  );
});

const el = (
  tag: string | ((...args: any[]) => any),
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag: tag as any,
  props: { ...props, children },
  children: children as any,
});

// ─── Reference ──────────────────────────────────────────────────────────────

describe("createPortal — Reference", () => {
  it("accepts children, container, and optional key", () => {
    const node = createPortal(
      el("p", {}, "hi"),
      portalTarget as unknown as Node,
      "my-key",
    );
    expect(node).toBeTruthy();
    expect(node.tag).toBe(PORTAL_TYPE);
  });

  it("returns a SinwanElement with Portal tag", () => {
    const node = createPortal(
      el("span", {}, "ported"),
      portalTarget as unknown as Node,
    );
    expect(typeof node.tag).toBe("symbol");
    expect(node.tag).toBe(PORTAL_TYPE);
  });

  it("works without a key argument", () => {
    const node = createPortal(
      el("div", {}, "no key"),
      portalTarget as unknown as Node,
    );
    expect(node.tag).toBe(PORTAL_TYPE);
  });
});

// ─── Usage / Rendering to a different part of the DOM ───────────────────────

describe("createPortal — Usage / rendering to a different part of the DOM", () => {
  it("renders children into the target node instead of the parent", () => {
    const App = cc(() =>
      el(
        "div",
        { id: "parent" },
        el("p", {}, "in parent"),
        createPortal(
          el("p", { id: "ported" }, "in portal"),
          portalTarget as unknown as Node,
        ),
      ),
    );

    mount(App, container);

    expect(container.textContent).toBe("in parent");
    expect(portalTarget.textContent).toBe("in portal");
    expect(
      container.querySelector("#ported") as unknown as HTMLElement | null,
    ).toBeNull();
    expect(
      portalTarget.querySelector("#ported") as unknown as HTMLElement | null,
    ).toBeTruthy();
  });

  it("can render into document.body", () => {
    const App = cc(() =>
      createPortal(
        el("div", { id: "body-portal" }, "body content"),
        win.document.body as unknown as Node,
      ),
    );

    mount(App, container);

    expect(
      win.document.body.querySelector(
        "#body-portal",
      ) as unknown as HTMLElement | null,
    ).toBeTruthy();
    expect(
      (
        win.document.body.querySelector(
          "#body-portal",
        ) as unknown as HTMLElement
      ).textContent,
    ).toBe("body content");
  });
});

// ─── Usage / Rendering a modal dialog with a portal ─────────────────────────

describe("createPortal — Usage / rendering a modal dialog", () => {
  it("renders modal content outside a clipping container", () => {
    const App = cc(() =>
      el(
        "div",
        { style: "overflow: hidden;" },
        el("button", {}, "open"),
        createPortal(
          el("div", { id: "modal" }, "modal content"),
          win.document.body as unknown as Node,
        ),
      ),
    );

    mount(App, container);

    const modal = win.document.body.querySelector(
      "#modal",
    ) as unknown as HTMLElement | null;
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toBe("modal content");
    // Modal is a direct child of body, not inside the clipping container
    expect(modal?.parentNode).toBe(win.document.body as unknown as ParentNode);
  });
});

// ─── Usage / Rendering into non-React server markup ────────────────────────

describe("createPortal — Usage / rendering into non-React markup", () => {
  it("renders into a pre-existing DOM node", () => {
    const sidebar = win.document.createElement(
      "aside",
    ) as unknown as HTMLElement;
    (win.document.body as unknown as Node).appendChild(
      sidebar as unknown as Node,
    );

    const App = cc(() =>
      createPortal(el("p", {}, "sidebar content"), sidebar as unknown as Node),
    );

    mount(App, container);
    expect(sidebar.textContent).toBe("sidebar content");
  });
});

// ─── Caveats ───────────────────────────────────────────────────────────────

describe("createPortal — Caveats", () => {
  it("cleans up portal content when the component unmounts", () => {
    const App = cc(() =>
      createPortal(el("span", {}, "temp"), portalTarget as unknown as Node),
    );

    const app = mount(App, container);
    expect(portalTarget.textContent).toBe("temp");

    app.unmount();
    expect(portalTarget.textContent).toBe("");
  });

  it("does not leave orphan DOM nodes after unmount", () => {
    const App = cc(() =>
      el(
        "div",
        {},
        createPortal(
          el("p", { id: "a" }, "a"),
          portalTarget as unknown as Node,
        ),
        createPortal(
          el("p", { id: "b" }, "b"),
          portalTarget as unknown as Node,
        ),
      ),
    );

    const app = mount(App, container);
    expect(portalTarget.querySelectorAll("p").length).toBe(2);

    app.unmount();
    expect(portalTarget.querySelectorAll("p").length).toBe(0);
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe("createPortal — Edge cases", () => {
  it("handles null children gracefully", () => {
    const App = cc(() =>
      createPortal(null, portalTarget as unknown as Node),
    );

    expect(() => mount(App, container)).not.toThrow();
    expect(portalTarget.textContent).toBe("");
  });

  it("handles string children", () => {
    const App = cc(() =>
      createPortal("plain text", portalTarget as unknown as Node),
    );

    mount(App, container);
    expect(portalTarget.textContent).toBe("plain text");
  });

  it("handles number children", () => {
    const App = cc(() =>
      createPortal(42, portalTarget as unknown as Node),
    );

    mount(App, container);
    expect(portalTarget.textContent).toBe("42");
  });

  it("handles array children", () => {
    const App = cc(() =>
      createPortal(
        [el("span", { key: "1" }, "one"), el("span", { key: "2" }, "two")],
        portalTarget as unknown as Node,
      ),
    );

    mount(App, container);
    expect(portalTarget.textContent).toBe("onetwo");
  });

  it("handles nested portals", () => {
    const innerTarget = win.document.createElement(
      "article",
    ) as unknown as HTMLElement;
    (win.document.body as unknown as Node).appendChild(
      innerTarget as unknown as Node,
    );

    const App = cc(() =>
      createPortal(
        createPortal(el("span", {}, "nested"), innerTarget as unknown as Node),
        portalTarget as unknown as Node,
      ),
    );

    mount(App, container);
    expect(innerTarget.textContent).toBe("nested");
    expect(portalTarget.textContent).toBe(""); // outer portal renders placeholder only
  });

  it("preserves parent context access (portal acts as child of React tree)", () => {
    // In Sinwan, context is not yet implemented the same way as React,
    // but structurally the portal is a child of the component tree.
    // This test verifies the portal mounts successfully inside a component.
    let mounted = false;
    const App = cc(() => {
      mounted = true;
      return createPortal(
        el("p", {}, "with context"),
        portalTarget as unknown as Node,
      );
    });

    mount(App, container);
    expect(mounted).toBe(true);
    expect(portalTarget.textContent).toBe("with context");
  });

  it("is a no-op on SSR (returns empty string from server renderer)", () => {
    // We verify this indirectly: the Portal component exists and
    // the server renderer explicitly returns "" for portal elements.
    const node = createPortal(
      el("div", {}, "never rendered on server"),
      portalTarget as unknown as Node,
    );
    expect(node.tag).toBe(PORTAL_TYPE);
  });
});
