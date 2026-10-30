/// <reference lib="dom" />

/**
 * Low-level single-attribute/property setters used by templates and the
 * general element renderer. Kept separate from `applyAttributes` so hoist
 * templates do not pull the reactive multi-prop apply loop.
 */

import { domOps } from "./dom-ops.ts";
import { resolve } from "../reactivity/index.ts";
import { booleanAttributeValue } from "../common/boolean-attributes.ts";

/** Props that map to DOM properties rather than attributes. */
export const DOM_PROPERTIES = new Set([
  "value",
  "checked",
  "selected",
  "disabled",
  "readOnly",
  "multiple",
  "indeterminate",
]);

export interface AttributeBindingState {
  previousStyleProps: Set<string>;
}

function applySelectSelection(
  selectEl: HTMLSelectElement,
  value: unknown,
): void {
  if (value == null || value === false) {
    if (selectEl.multiple) {
      for (const opt of selectEl.options) {
        opt.selected = false;
      }
      return;
    }
    selectEl.selectedIndex = -1;
    return;
  }
  if (Array.isArray(value)) {
    const selected = new Set(value.map((item) => String(item)));
    for (const opt of selectEl.options) {
      opt.selected = selected.has(opt.value);
    }
    return;
  }
  selectEl.value = String(value);
}

/**
 * Set a single attribute/property on a DOM element.
 */
export function setSingleAttribute(
  el: Element,
  key: string,
  value: unknown,
  state?: AttributeBindingState,
): void {
  // JSX writes the label association attribute as htmlFor (the DOM
  // property); the HTML attribute is `for`. Matches renderServerAttribute.
  if (key === "htmlFor") key = "for";

  if (key === "style") {
    patchStyle(el as HTMLElement, value, state);
    return;
  }

  if (key === "class" && typeof value === "object" && value !== null) {
    applyClass(el, value);
    return;
  }

  if (key === "defaultValue") {
    if (el.tagName === "SELECT") {
      applySelectSelection(el as HTMLSelectElement, value);
      return;
    }
    domOps.setProperty(
      el,
      "defaultValue",
      value == null || value === false ? "" : String(value),
    );
    return;
  }
  if (key === "defaultChecked") {
    domOps.setProperty(
      el,
      "defaultChecked",
      value != null && value !== false,
    );
    return;
  }
  if (key === "value" && el.tagName === "SELECT") {
    applySelectSelection(el as HTMLSelectElement, value);
    return;
  }

  if (value == null) {
    clearAttribute(el, key);
    return;
  }

  if (typeof value === "boolean") {
    const attrValue = booleanAttributeValue(key, value);
    if (attrValue === null) {
      clearAttribute(el, key);
      return;
    }
    domOps.setAttribute(el, key, attrValue);
    if (DOM_PROPERTIES.has(key)) {
      domOps.setProperty(el, key, true);
    }
    return;
  }

  if (key === "class" && value === "") {
    domOps.removeAttribute(el, key);
    return;
  }

  if (DOM_PROPERTIES.has(key)) {
    domOps.setProperty(el, key, value);
    return;
  }

  domOps.setAttribute(el, key, String(value));
}

function clearAttribute(el: Element, key: string): void {
  domOps.removeAttribute(el, key);
  if (DOM_PROPERTIES.has(key)) {
    domOps.setProperty(el, key, key === "value" ? "" : false);
  }
}

function patchStyle(
  el: HTMLElement,
  value: unknown,
  state?: AttributeBindingState,
): void {
  if (value == null || value === false || value === true || value === "") {
    el.style.cssText = "";
    if (state) {
      state.previousStyleProps.clear();
    }
    return;
  }

  if (typeof value === "string") {
    el.style.cssText = value;
    if (state) {
      state.previousStyleProps.clear();
    }
    return;
  }

  const nextProps = new Set<string>();
  const sources = Array.isArray(value) ? value : [value];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source == null) continue;

    if (typeof source === "string") {
      const parsed = parseStyleString(source);
      for (const key in parsed) {
        if (!Object.prototype.hasOwnProperty.call(parsed, key)) continue;
        nextProps.add(key);
        el.style.setProperty(key, parsed[key]!);
      }
      continue;
    }

    if (typeof source !== "object") continue;

    const obj = source as Record<string, unknown>;
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      nextProps.add(key);

      const val = resolve(obj[key]);
      if (val == null || val === false) {
        removeStyleProperty(el, key);
        continue;
      }

      const kebabProp = key.startsWith("--") ? key : camelToKebab(key);
      el.style.setProperty(kebabProp, String(val));
    }
  }

  if (!state) {
    return;
  }

  for (const previousProp of state.previousStyleProps) {
    if (!nextProps.has(previousProp)) {
      removeStyleProperty(el, previousProp);
    }
  }

  state.previousStyleProps = nextProps;
}

function removeStyleProperty(el: HTMLElement, prop: string): void {
  const kebabProp = prop.startsWith("--") ? prop : camelToKebab(prop);
  el.style.removeProperty(kebabProp);
}

function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  const rules = style.split(";");
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    const idx = rule.indexOf(":");
    if (idx > 0) {
      const prop = rule.slice(0, idx).trim();
      const val = rule.slice(idx + 1).trim();
      if (prop && val) {
        result[prop] = val;
      }
    }
  }
  return result;
}

function applyClass(el: Element, value: unknown): void {
  domOps.setAttribute(el, "class", normalizeClass(value));
}

/**
 * HTML `className` is a string. SVG and MathML `className` is a readonly
 * animated string, so assigning it throws. Those elements use the attribute.
 */
export function assignClassName(el: Element, value: string): void {
  const current = (el as HTMLElement).className;
  if (typeof current === "string") {
    if (current !== value) {
      (el as HTMLElement).className = value;
    }
    return;
  }
  if (value === "") {
    if (el.hasAttribute("class")) {
      domOps.removeAttribute(el, "class");
    }
    return;
  }
  if (el.getAttribute("class") !== value) {
    domOps.setAttribute(el, "class", value);
  }
}

function normalizeClass(value: unknown): string {
  const resolved = resolve(value);
  if (!resolved) return "";
  if (typeof resolved === "string") return resolved;

  if (Array.isArray(resolved)) {
    const parts: string[] = [];
    for (let i = 0; i < resolved.length; i++) {
      const normalized = normalizeClass(resolved[i]);
      if (normalized) {
        parts.push(normalized);
      }
    }
    return parts.join(" ");
  }

  if (typeof resolved === "object") {
    const parts: string[] = [];
    const obj = resolved as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (Boolean(resolve(value))) {
          parts.push(key);
        }
      }
    }
    return parts.join(" ");
  }

  return String(resolved);
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
