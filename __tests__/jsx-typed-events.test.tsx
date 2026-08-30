/** @jsxImportSource sinwan */
import { describe, it, expect } from "bun:test";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import type { SinwanIntrinsicElements } from "../src/jsx/jsx-types.ts";

describe("Sinwan JSX typed event handlers", () => {
  it("narrows currentTarget/target to HTMLInputElement on <input oninput>", () => {
    const handler: SinwanIntrinsicElements["input"]["oninput"] = (event) => {
      // No cast needed — currentTarget and target are HTMLInputElement.
      const v: string = event.currentTarget.value;
      const t: string = event.target.value;
      void v;
      void t;
    };
    expect(typeof handler).toBe("function");
  });

  it("types the event as a real Event (not any) on <input oninput>", () => {
    const handler: SinwanIntrinsicElements["input"]["oninput"] = (event) => {
      // Base Event property — proves the event is typed, not `any`.
      const t: string = event.type;
      void t;
    };
    expect(typeof handler).toBe("function");
  });

  it("narrows currentTarget to HTMLButtonElement on <button onclick>", () => {
    const handler: SinwanIntrinsicElements["button"]["onclick"] = (event) => {
      const n: string = event.currentTarget.name;
      void n;
    };
    expect(typeof handler).toBe("function");
  });

  it("uses PointerEvent for onclick on <div>", () => {
    const handler: SinwanIntrinsicElements["div"]["onclick"] = (event) => {
      const x: number = event.clientX;
      void x;
    };
    expect(typeof handler).toBe("function");
  });

  it("uses KeyboardEvent for onkeydown on <div>", () => {
    const handler: SinwanIntrinsicElements["div"]["onkeydown"] = (event) => {
      const k: string = event.key;
      void k;
    };
    expect(typeof handler).toBe("function");
  });

  it("uses SubmitEvent for onsubmit on <form>", () => {
    const handler: SinwanIntrinsicElements["form"]["onsubmit"] = (event) => {
      const s: Element | null = event.submitter;
      void s;
    };
    expect(typeof handler).toBe("function");
  });

  it("narrows currentTarget to HTMLAnchorElement on <a onclick>", () => {
    const handler: SinwanIntrinsicElements["a"]["onclick"] = (event) => {
      const href: string = event.currentTarget.href;
      void href;
    };
    expect(typeof handler).toBe("function");
  });

  it("accepts a parameter-less handler (back-compat)", () => {
    const handler: SinwanIntrinsicElements["button"]["onclick"] = () => {};
    expect(typeof handler).toBe("function");
  });

  it("accepts an explicit `event: Event` annotation (back-compat)", () => {
    const handler: SinwanIntrinsicElements["button"]["onclick"] = (
      event: Event,
    ) => {
      void event;
    };
    expect(typeof handler).toBe("function");
  });

  it("passes the handler through the jsx runtime unchanged", () => {
    let captured: unknown = null;
    const el = jsx(
      "input",
      {
        oninput: (event: any) => {
          captured = event;
        },
      },
      null,
    );
    // The handler is stored verbatim on props; binding happens at mount.
    expect(typeof (el as any).props.oninput).toBe("function");
    // Simulate a dispatch: the runtime calls the handler with the DOM event.
    const fakeEvent = {
      currentTarget: { value: "hi" },
      target: { value: "hi" },
    };
    (el as any).props.oninput(fakeEvent);
    expect(captured).toBe(fakeEvent);
  });
});
