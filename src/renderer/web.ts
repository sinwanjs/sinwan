/**
 * Compiler / hoist web helpers — Solid-style dedicated entry.
 * Apps and the compiler import `_$createTemplate` / `_$bind*` from here.
 */

export {
  _$createTemplate,
  _$bindText,
  _$bindAttr,
  _$bindStyle,
  _$bindClass,
  isTemplateResult,
  isServerTemplateResult,
  isBindingDescriptor,
  setHydrationMode,
  SINWAN_TEMPLATE,
  SINWAN_SERVER_TEMPLATE,
} from "./template.ts";
export type {
  SinwanTemplateResult,
  SinwanServerTemplateResult,
} from "./template.ts";
export { DEFAULT_TEMPLATE_SLOT_PROTOCOL } from "./template-protocol.ts";
export type {
  TemplateSlot,
  TemplateDef,
  TemplateSlotProtocol,
} from "./template-protocol.ts";
