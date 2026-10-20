import type { CleanupFn } from "../reactivity/index.ts";
import type { TemplateDef } from "./template-protocol.ts";

/** Runtime symbol to identify compiler-generated template results. */
export const SINWAN_TEMPLATE = Symbol.for("sinwan.template");

export interface SinwanTemplateResult {
  [SINWAN_TEMPLATE]: true;
  fragment: DocumentFragment;
  disposers: CleanupFn[];
}

/** Runtime symbol identifying a server-side template result (no live DOM). */
export const SINWAN_SERVER_TEMPLATE = Symbol.for("sinwan.server_template");

export interface SinwanServerTemplateResult {
  [SINWAN_SERVER_TEMPLATE]: true;
  def: TemplateDef;
  dynamics: unknown[];
}

export interface TextBindingDescriptor {
  type: "text";
  getter: () => unknown;
}

export interface AttrBindingDescriptor {
  type: "attr";
  name: string;
  getter: () => unknown;
}

export interface StyleBindingDescriptor {
  type: "style";
  getter: () => unknown;
}

export interface ClassBindingDescriptor {
  type: "class";
  getter: () => unknown;
}

export type BindingDescriptor =
  | TextBindingDescriptor
  | AttrBindingDescriptor
  | StyleBindingDescriptor
  | ClassBindingDescriptor;

/** Duck-type check for compiler-generated binding descriptors. */
export function isBindingDescriptor(
  value: unknown,
): value is BindingDescriptor {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in (value as object) &&
    "getter" in (value as object) &&
    typeof (value as { getter: unknown }).getter === "function"
  );
}

/** Create a reactive text binding descriptor. */
export function _$bindText(getter: () => unknown): TextBindingDescriptor {
  return { type: "text", getter };
}

/** Create a reactive attribute binding descriptor. */
export function _$bindAttr(
  name: string,
  getter: () => unknown,
): AttrBindingDescriptor {
  return { type: "attr", name, getter };
}

/** Create a reactive style binding descriptor. */
export function _$bindStyle(getter: () => unknown): StyleBindingDescriptor {
  return { type: "style", getter };
}

/** Create a reactive class binding descriptor. */
export function _$bindClass(getter: () => unknown): ClassBindingDescriptor {
  return { type: "class", getter };
}

/** Check if a value is a compiler-generated template result. */
export function isTemplateResult(
  value: unknown,
): value is SinwanTemplateResult {
  return (
    value != null &&
    typeof value === "object" &&
    (value as { [k: symbol]: unknown })[SINWAN_TEMPLATE] === true
  );
}

/** Check if a value is a server-side template result (no DOM available). */
export function isServerTemplateResult(
  value: unknown,
): value is SinwanServerTemplateResult {
  return (
    value != null &&
    typeof value === "object" &&
    (value as { [k: symbol]: unknown })[SINWAN_SERVER_TEMPLATE] === true
  );
}
