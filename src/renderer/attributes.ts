/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Attribute Handling
 *
 * Applies native DOM props to elements.
 * Handles special cases: style objects, boolean attributes, and reactive attributes.
 */

import { domOps } from "./dom-ops.ts";
import { isEventProp } from "./events.ts";
import { effect, isReactive, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";

/**
 * Duck-type check for compiler-generated binding descriptors.
 *
 * Inlined here (rather than imported from `./template.ts`) to avoid a circular
 * dependency: `template.ts` imports `setSingleAttribute` from this file.
 */
function isBindingDescriptor(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in (value as any) &&
    "getter" in (value as any) &&
    typeof (value as any).getter === "function"
  );
}

// Props that should be skipped during attribute rendering
const SKIP_PROPS = new Set([
  "children",
  "key",
  "ref",
  "dangerouslySetInnerHTML",
]);

// Props that map to DOM properties rather than attributes
export const DOM_PROPERTIES = new Set([
  "value",
  "checked",
  "selected",
  "disabled",
  "readOnly",
  "multiple",
  "indeterminate",
]);

// HTML enumerated attributes that accept "true" / "false" rather than being
// boolean presence/absence attributes. For these, value === true must render as
// the string "true" (e.g. draggable="true"), not a bare attribute name.
const ENUMERATED_BOOLEAN_ATTRIBUTES = new Set([
  "draggable",
  "contentEditable",
  "contenteditable",
  "spellcheck",
  "autocorrect",
  "writingsuggestions",
]);

interface AttributeBindingState {
  previousStyleProps: Set<string>;
}

/**
 * Apply all non-event props to a DOM element.
 * Handles static values, reactive signals, and special cases.
 * Returns an array of disposers for reactive attributes.
 */
export interface ApplyAttrsResult {
  disposers: CleanupFn[] | null;
  hasEventProps: boolean;
}

export function applyAttributes(
  el: Element,
  props: Record<string, unknown>,
): ApplyAttrsResult {
  let disposers: CleanupFn[] | null = null;
  let hasEventProps = false;
  const owner = getCurrentInstance();

  for (const key in props) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
    if (SKIP_PROPS.has(key)) continue;

    if (isEventProp(key)) {
      hasEventProps = true;
      continue;
    }

    const value = props[key];

    // Binding descriptor (from explicitBindings mode in non-hoisted JSX).
    // Unwrap to the getter function — isReactive handles it below.
    const attrValue = isBindingDescriptor(value)
      ? (value as any).getter
      : value;

    const isComplex = key === "class" || key === "style";

    if (isReactive(attrValue) || (isComplex && containsReactive(attrValue))) {
      const state: AttributeBindingState = { previousStyleProps: new Set() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, resolve(attrValue as any), state);
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
      });
      if (!disposers) disposers = [];
      disposers.push(dispose);
    } else {
      setSingleAttribute(el, key, attrValue);
    }
  }

  return { disposers, hasEventProps };
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
  // Handle style values (object, string, null, etc.) without parsing CSS strings
  if (key === "style") {
    patchStyle(el as HTMLElement, value, state);
    return;
  }

  // Handle class arrays/objects
  if (key === "class" && typeof value === "object" && value !== null) {
    applyClass(el, value);
    return;
  }

  // Handle null/undefined/false — remove attribute
  if (value == null || value === false) {
    domOps.removeAttribute(el, key);
    if (DOM_PROPERTIES.has(key)) {
      domOps.setProperty(el, key, key === "value" ? "" : false);
    }
    return;
  }

  // Handle boolean true — set as attribute name only, except for enumerated
  // HTML attributes like draggable which require "true" as a string value.
  if (value === true) {
    const attrValue = ENUMERATED_BOOLEAN_ATTRIBUTES.has(key) ? "true" : "";
    domOps.setAttribute(el, key, attrValue);
    if (DOM_PROPERTIES.has(key)) {
      domOps.setProperty(el, key, true);
    }
    return;
  }

  // DOM properties — set directly on the element
  if (DOM_PROPERTIES.has(key)) {
    domOps.setProperty(el, key, value);
    return;
  }

  // Default — set as string attribute
  domOps.setAttribute(el, key, String(value));
}

/**
 * Apply a style value to an element without parsing CSS strings.
 *
 * - Strings are assigned directly to `el.style.cssText`.
 * - Objects/arrays are applied property-by-property with `el.style.setProperty`.
 * - Falsy values clear the element's styles.
 */
function patchStyle(
  el: HTMLElement,
  value: unknown,
  state?: AttributeBindingState,
): void {
  // Clear styles for null/undefined/false/true/empty string
  if (value == null || value === false || value === true || value === "") {
    el.style.cssText = "";
    if (state) {
      state.previousStyleProps.clear();
    }
    return;
  }

  // String: let the browser parse the CSS directly
  if (typeof value === "string") {
    el.style.cssText = value;
    if (state) {
      state.previousStyleProps.clear();
    }
    return;
  }

  // Object or array of objects/strings: apply properties individually.
  // Strings inside arrays are still parsed so they can be merged with objects
  // and so stale properties are correctly removed on updates.
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
        el.style.setProperty(key, parsed[key]);
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

/**
 * Parse a CSS string into property/value pairs.
 * Only used for string elements inside style arrays; top-level strings are
 * assigned directly to `el.style.cssText` without parsing.
 */
function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  const rules = style.split(";");
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
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

/**
 * Apply class value — supports string, array, or object notation.
 * Recursively resolves reactive values.
 */
function applyClass(el: Element, value: unknown): void {
  domOps.setAttribute(el, "class", normalizeClass(value));
}

function normalizeClass(value: unknown): string {
  const resolved = resolve(value);
  if (!resolved) return "";
  if (typeof resolved === "string") return resolved;

  if (Array.isArray(resolved)) {
    // ["foo", "bar", false && "baz", signal] → "foo bar val"
    // replace map/filter with for loop to avoid creating intermediate arrays
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
    // { foo: true, bar: false, baz: signal } → "foo baz"
    // replace Object.entries/filter/map with for loop to avoid creating intermediate arrays
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

/**
 * Recursively check if a value contains any reactive element.
 */
function containsReactive(value: unknown): boolean {
  if (isReactive(value)) return true;
  if (Array.isArray(value)) {
    // replace some with for loop and break to stop as soon as a reactive value is found
    for (let i = 0; i < value.length; i++) {
      if (containsReactive(value[i])) return true;
    }
    return false;
  }
  if (typeof value === "object" && value !== null) {
    // For style objects/class objects, we only check one level deep for performance
    // but recursive is safer for nested class arrays.
    // replace Object.values/some with for loop and break to stop as soon as a reactive value is found
    const obj = value as Record<string, unknown>;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (containsReactive(obj[key])) return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * Convert camelCase to kebab-case.
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
