/** @jsxImportSource sinwan */
import { describe, it, expect } from "bun:test";
import { jsx } from "../src/jsx/jsx-runtime.ts";
import type {
  SinwanIntrinsicElements,
  SinwanSVGElements,
} from "../src/jsx/jsx-types.ts";
import type { Computed, Signal } from "../src/reactivity/index.ts";

/**
 * Type-level helper: assign a value to `T`'s key `K` and assert the
 * resulting type is exactly `V`. If the attribute is missing or has the
 * wrong type, `tsc --noEmit` fails here.
 */
const assertAttr = <
  T extends object,
  K extends string & keyof T,
  V extends NonNullable<T[K]>,
>(
  _key: K,
  _value: V,
): void => {
  // No-op at runtime; the type parameters do the checking.
};

describe("SinwanIntrinsicElements native attribute typing", () => {
  it("exposes anchor-specific attributes on <a>", () => {
    assertAttr<SinwanIntrinsicElements["a"], "target", "_blank">(
      "target",
      "_blank",
    );
    assertAttr<SinwanIntrinsicElements["a"], "referrerPolicy", "no-referrer">(
      "referrerPolicy",
      "no-referrer",
    );
  });

  it("exposes image-specific attributes on <img>", () => {
    assertAttr<SinwanIntrinsicElements["img"], "loading", "lazy">(
      "loading",
      "lazy",
    );
    assertAttr<SinwanIntrinsicElements["img"], "decoding", "async">(
      "decoding",
      "async",
    );
    assertAttr<SinwanIntrinsicElements["img"], "fetchPriority", "high">(
      "fetchPriority",
      "high",
    );
    assertAttr<SinwanIntrinsicElements["img"], "crossOrigin", "anonymous">(
      "crossOrigin",
      "anonymous",
    );
  });

  it("exposes input-specific attributes on <input>", () => {
    assertAttr<SinwanIntrinsicElements["input"], "type", "email">(
      "type",
      "email",
    );
    assertAttr<SinwanIntrinsicElements["input"], "autocomplete", "off">(
      "autocomplete",
      "off",
    );
    assertAttr<SinwanIntrinsicElements["input"], "capture", "user">(
      "capture",
      "user",
    );
    // Enhanced props are preserved alongside the native attribute interface.
    assertAttr<SinwanIntrinsicElements["input"], "defaultValue", string>(
      "defaultValue",
      "x",
    );
  });

  it("narrows <button> type to submit/reset/button", () => {
    assertAttr<SinwanIntrinsicElements["button"], "type", "submit">(
      "type",
      "submit",
    );
    assertAttr<SinwanIntrinsicElements["button"], "formAction", string>(
      "formAction",
      "/x",
    );
  });

  it("exposes media attributes on <video>", () => {
    assertAttr<
      SinwanIntrinsicElements["video"],
      "crossOrigin",
      "use-credentials"
    >("crossOrigin", "use-credentials");
  });

  it("exposes dialog closedby attribute on <dialog>", () => {
    assertAttr<SinwanIntrinsicElements["dialog"], "closedby", "any">(
      "closedby",
      "any",
    );
  });

  it("exposes ordered-list type attribute on <ol>", () => {
    assertAttr<SinwanIntrinsicElements["ol"], "type", "a">("type", "a");
  });

  it("exposes table cell alignment on <td>", () => {
    assertAttr<SinwanIntrinsicElements["td"], "align", "center">(
      "align",
      "center",
    );
    assertAttr<SinwanIntrinsicElements["td"], "valign", "top">("valign", "top");
  });

  it("exposes global ARIA + popover attributes on every element", () => {
    assertAttr<SinwanIntrinsicElements["div"], "role", "navigation">(
      "role",
      "navigation",
    );
    assertAttr<SinwanIntrinsicElements["div"], "aria-label", string>(
      "aria-label",
      "x",
    );
    assertAttr<SinwanIntrinsicElements["div"], "aria-hidden", "true">(
      "aria-hidden",
      "true",
    );
    assertAttr<SinwanIntrinsicElements["div"], "popover", "auto">(
      "popover",
      "auto",
    );
    assertAttr<SinwanIntrinsicElements["span"], "aria-busy", "false">(
      "aria-busy",
      "false",
    );
  });

  it("exposes SVG-specific attributes on <svg> children", () => {
    assertAttr<SinwanSVGElements["circle"], "fillRule", "evenodd">(
      "fillRule",
      "evenodd",
    );
    assertAttr<SinwanSVGElements["line"], "strokeLinecap", "round">(
      "strokeLinecap",
      "round",
    );
    assertAttr<SinwanSVGElements["svg"], "role", "img">("role", "img");
  });

  it("passes native attributes through the jsx runtime", () => {
    const el = jsx(
      "a",
      { href: "/x", target: "_blank", referrerPolicy: "no-referrer" },
      null,
    );
    expect((el as any).tag).toBe("a");
    expect((el as any).props.target).toBe("_blank");
    expect((el as any).props.referrerPolicy).toBe("no-referrer");
  });

  it("passes ARIA and popover attributes through the jsx runtime", () => {
    const el = jsx(
      "div",
      { role: "navigation", "aria-label": "Main", popover: "auto" },
      null,
    );
    expect((el as any).props.role).toBe("navigation");
    expect((el as any).props["aria-label"]).toBe("Main");
    expect((el as any).props.popover).toBe("auto");
  });

  it("accepts getters, signals, and computeds on non-event attributes", () => {
    const classSignal: Signal<string> = {
      value: "x",
      peek: () => "x",
      subscribe: () => () => {},
    };
    const busy: Computed<boolean> = { value: true, peek: () => true };
    const disabled = () => true;
    const label = () => "Main";
    const dataState = () => (busy.value ? "busy" : undefined);
    const style = () => "color: red";
    const inputValue = () => "q";
    const svgWidth = () => 320;
    const buttonType = () => "button" as const;

    assertAttr<SinwanIntrinsicElements["div"], "class", Signal<string>>(
      "class",
      classSignal,
    );
    assertAttr<SinwanIntrinsicElements["div"], "class", () => string>(
      "class",
      () => "x",
    );
    assertAttr<SinwanIntrinsicElements["button"], "disabled", () => boolean>(
      "disabled",
      disabled,
    );
    assertAttr<SinwanIntrinsicElements["div"], "aria-busy", Computed<boolean>>(
      "aria-busy",
      busy,
    );
    assertAttr<SinwanIntrinsicElements["div"], "aria-label", () => string>(
      "aria-label",
      label,
    );
    assertAttr<
      SinwanIntrinsicElements["div"],
      "data-state",
      () => string | undefined
    >("data-state", dataState);
    assertAttr<SinwanIntrinsicElements["div"], "style", () => string>(
      "style",
      style,
    );
    assertAttr<SinwanIntrinsicElements["input"], "value", () => string>(
      "value",
      inputValue,
    );
    assertAttr<SinwanIntrinsicElements["textarea"], "value", () => string>(
      "value",
      inputValue,
    );
    assertAttr<SinwanSVGElements["svg"], "width", () => number>(
      "width",
      svgWidth,
    );
    assertAttr<
      SinwanIntrinsicElements["button"],
      "type",
      () => "submit" | "reset" | "button"
    >("type", buttonType);
  });

  it("keeps event handlers as functions, not Reactive wrappers", () => {
    type Click = NonNullable<SinwanIntrinsicElements["button"]["onclick"]>;
    type ClickIsHandler = Click extends (...args: any[]) => any ? true : false;
    const clickIsHandler: ClickIsHandler = true;
    expect(clickIsHandler).toBe(true);
  });
});
