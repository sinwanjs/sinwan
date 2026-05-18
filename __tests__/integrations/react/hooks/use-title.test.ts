/**
 * Comprehensive tests for `useTitle`.
 *
 * Tests are organized to mirror the React `<title>` documentation sections.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import {
  createComponentInstance,
  withInstance,
} from "../../../../src/component/instance.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import { useTitle } from "../../../../src/integrations/react/_client.ts";

let container: HTMLElement;
let win: InstanceType<typeof Window>;

beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
  win.document.title = "Original";
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

describe("useTitle — Reference", () => {
  it("accepts a string title", () => {
    const App = cc(() => {
      useTitle("My Page");
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("accepts a function getter", () => {
    const App = cc(() => {
      useTitle(() => "Dynamic Title");
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("accepts an options object", () => {
    const App = cc(() => {
      useTitle("My Page", { restoreOnUnmount: false });
      return el("div");
    });
    expect(() => mount(App, container)).not.toThrow();
  });

  it("throws when called outside a component", () => {
    expect(() => {
      useTitle("Bad");
    }).toThrow(/Hook called outside of a component/);
  });
});

// ─── Usage / Set the document title ──────────────────────────────────────

describe("useTitle — Usage / Set the document title", () => {
  it("updates document.title on mount", () => {
    const App = cc(() => {
      useTitle("Contact Us");
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("Contact Us");
  });

  it("restores the original title on unmount by default", () => {
    const App = cc(() => {
      useTitle("Contact Us");
      return el("div");
    });
    const app = mount(App, container);
    expect(win.document.title).toBe("Contact Us");

    app.unmount();
    expect(win.document.title).toBe("Original");
  });

  it("does not restore title when restoreOnUnmount is false", () => {
    const App = cc(() => {
      useTitle("Contact Us", { restoreOnUnmount: false });
      return el("div");
    });
    const app = mount(App, container);
    expect(win.document.title).toBe("Contact Us");

    app.unmount();
    expect(win.document.title).toBe("Contact Us");
  });
});

// ─── Usage / Use variables in the title ──────────────────────────────────

describe("useTitle — Usage / Use variables in the title", () => {
  it("interpolates variables via a getter function", () => {
    let pageNumber = 1;
    const App = cc(() => {
      useTitle(() => `Results page ${pageNumber}`);
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("Results page 1");
  });

  it("updates reactively when the getter reads a signal", async () => {
    const { useState } =
      await import("../../../../src/integrations/react/_client.ts");
    const App = cc(() => {
      const [count] = useState(1);
      useTitle(() => `Count: ${count()}`);
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("Count: 1");
  });
});

// ─── Caveats ─────────────────────────────────────────────────────────────

describe("useTitle — Caveats", () => {
  it("does not throw if document is missing (SSR safety)", () => {
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;
    try {
      (globalThis as any).window = undefined;
      (globalThis as any).document = undefined;

      const App = cc(() => {
        useTitle("SSR Safe");
        return el("div");
      });
      const instance = createComponentInstance(App, {}, null);
      expect(() => withInstance(instance, () => App({}))).not.toThrow();
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("restores the title captured at mount time, not the latest title", () => {
    const App = cc(() => {
      useTitle("New Title");
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("New Title");

    // Simulate external title change
    win.document.title = "Externally Changed";

    // A new mount captures the CURRENT title at mount time
    const app = mount(App, container);
    app.unmount();
    // Restores to the title captured at THIS mount time
    expect(win.document.title).toBe("Externally Changed");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────

describe("useTitle — Edge cases", () => {
  it("handles empty string title", () => {
    const App = cc(() => {
      useTitle("");
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("");
  });

  it("handles numeric title coerced to string", () => {
    const App = cc(() => {
      useTitle(42 as any);
      return el("div");
    });
    mount(App, container);
    expect(win.document.title).toBe("42");
  });

  it("handles rapid mount/unmount cycles", () => {
    const App = cc(() => {
      useTitle("Cycle");
      return el("div");
    });
    const app1 = mount(App, container);
    app1.unmount();
    const app2 = mount(App, container);
    app2.unmount();
    const app3 = mount(App, container);

    expect(win.document.title).toBe("Cycle");
    app3.unmount();
    expect(win.document.title).toBe("Original");
  });

  it("handles multiple useTitle in different components (last wins)", () => {
    const A = cc(() => {
      useTitle("Title A");
      return el("div");
    });
    const B = cc(() => {
      useTitle("Title B");
      return el("div");
    });

    const appA = mount(A, container);
    expect(win.document.title).toBe("Title A");

    const appB = mount(B, container);
    expect(win.document.title).toBe("Title B");

    appB.unmount();
    // B restores to "Title A" (what it was at B's mount time)
    expect(win.document.title).toBe("Title A");

    appA.unmount();
    expect(win.document.title).toBe("Original");
  });
});
