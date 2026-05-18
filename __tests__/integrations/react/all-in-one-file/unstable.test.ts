/**
 * Phase 6 — React-compatible APIs (Activity now stable).
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";
import { mount } from "../../../../src/renderer/mount.ts";
import { cc } from "../../../../src/component/create.ts";
import { signal } from "../../../../src/reactivity/index.ts";
import type { SinwanElement } from "../../../../src/types.ts";
import {
  Activity,
  unstable_ViewTransition,
  unstable_startViewTransition,
} from "../../../../src/integrations/react/_client.ts";

let win: InstanceType<typeof Window>;
let container: HTMLElement;
beforeEach(() => {
  win = new Window({ url: "http://localhost" });
  (globalThis as any).document = win.document;
  (globalThis as any).window = win;
  (win as any).SyntaxError = SyntaxError;
  container = win.document.createElement("div") as unknown as HTMLElement;
  (win.document.body as unknown as Node).appendChild(
    container as unknown as Node,
  );
});

const el = (
  tag: string,
  props: Record<string, unknown> = {},
  ...children: unknown[]
): SinwanElement => ({
  tag,
  props: { ...props, children },
  children: children as any,
});

describe("unstable_ViewTransition", () => {
  it("renders children transparently", () => {
    const App = cc(() =>
      unstable_ViewTransition({ children: el("p", {}, "vt") }),
    );
    mount(App, container);
    expect(container.textContent).toContain("vt");
  });
});

describe("unstable_startViewTransition", () => {
  it("falls back to running the callback when the API is missing", async () => {
    let ran = false;
    const t = unstable_startViewTransition(() => {
      ran = true;
    });
    await t.finished;
    expect(ran).toBe(true);
  });

  it("delegates to document.startViewTransition when available", async () => {
    let started = false;
    (document as any).startViewTransition = (cb: () => void) => {
      started = true;
      cb();
      return { finished: Promise.resolve() };
    };
    const t = unstable_startViewTransition(() => {});
    await t.finished;
    expect(started).toBe(true);
    delete (document as any).startViewTransition;
  });
});
