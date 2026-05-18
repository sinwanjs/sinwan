/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Attribute Handling
 *
 * Maps JSX props to DOM attributes and properties.
 * Handles special cases: className→class, htmlFor→for,
 * style objects, boolean attributes, and reactive attributes.
 */

import { domOps } from "./dom-ops.ts";
import { isEventProp } from "./events.ts";
import { effect, isReactive, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";

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

// Prop name aliases
export const PROP_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  crossOrigin: "crossorigin",
  httpEquiv: "http-equiv",
};

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

    const attrName = resolveAttributeName(key);
    const isComplex = attrName === "class" || attrName === "style";

    if (isReactive(value) || (isComplex && containsReactive(value))) {
      // Reactive attribute — wrap in an effect
      const state: AttributeBindingState = { previousStyleProps: new Set() };
      let initialized = false;
      const dispose = effect(() => {
        setSingleAttribute(el, key, resolve(value as any), state);
        if (initialized) {
          queueUpdatedHooks(owner);
        }
        initialized = true;
      });
      if (!disposers) disposers = [];
      disposers.push(dispose);
    } else {
      setSingleAttribute(el, key, value);
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
  // Resolve alias
  const attrName = resolveAttributeName(key);

  // Handle style objects
  if (attrName === "style" && typeof value === "object" && value !== null) {
    applyStyle(
      el as HTMLElement,
      value as Record<string, string | number | null | undefined>,
      state,
    );
    return;
  }

  // Handle class arrays/objects
  if (attrName === "class" && typeof value === "object" && value !== null) {
    applyClass(el, value);
    return;
  }

  // Handle null/undefined/false — remove attribute
  if (value == null || value === false) {
    domOps.removeAttribute(el, attrName);
    if (attrName === "style" && state) {
      state.previousStyleProps.clear();
    }
    // Also clear the property if it's a DOM property
    if (DOM_PROPERTIES.has(attrName)) {
      domOps.setProperty(el, attrName, attrName === "value" ? "" : false);
    }
    return;
  }

  // Handle boolean true — set as attribute name only
  if (value === true) {
    domOps.setAttribute(el, attrName, "");
    if (attrName === "style" && state) {
      state.previousStyleProps.clear();
    }
    if (DOM_PROPERTIES.has(attrName)) {
      domOps.setProperty(el, attrName, true);
    }
    return;
  }

  // DOM properties — set directly on the element
  if (DOM_PROPERTIES.has(attrName)) {
    if (attrName === "style" && state) {
      state.previousStyleProps.clear();
    }
    domOps.setProperty(el, attrName, value);
    return;
  }

  // Default — set as string attribute
  if (attrName === "style" && state) {
    state.previousStyleProps.clear();
  }
  domOps.setAttribute(el, attrName, String(value));
}

export function resolveAttributeName(key: string): string {
  return PROP_ALIASES[key] ?? key;
}

/**
 * Apply a style object to an element.
 */
/**
 * Apply a style object to an element.
 */
function applyStyle(
  el: HTMLElement,
  value: unknown,
  state?: AttributeBindingState,
): void {
  const styleObj = normalizeStyle(value);
  const nextProps = new Set<string>();

  for (const [prop, val] of Object.entries(styleObj)) {
    nextProps.add(prop);

    if (val == null) {
      removeStyleProperty(el, prop);
      continue;
    }

    const kebabProp = prop.startsWith("--") ? prop : camelToKebab(prop);
    el.style.setProperty(kebabProp, String(val));
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

function normalizeStyle(
  value: unknown,
): Record<string, string | number | null | undefined> {
  const resolved = resolve(value);
  if (!resolved) return {};

  if (typeof resolved === "string") {
    return parseStyleString(resolved);
  }

  if (Array.isArray(resolved)) {
    // replace reduce with for loop to avoid function call overhead
    const result: Record<string, any> = {};
    for (let i = 0; i < resolved.length; i++) {
      const normalized = normalizeStyle(resolved[i]);
      for (const key in normalized) {
        if (Object.prototype.hasOwnProperty.call(normalized, key)) {
          result[key] = normalized[key];
        }
      }
    }
    return result;
  }

  if (typeof resolved === "object") {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(resolved)) {
      result[k] = resolve(v);
    }
    return result;
  }

  return {};
}

function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  // replace forEach with for loop to avoid creating a callback function
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

function removeStyleProperty(el: HTMLElement, prop: string): void {
  const kebabProp = prop.startsWith("--") ? prop : camelToKebab(prop);
  el.style.removeProperty(kebabProp);
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
