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
const SKIP_PROPS = new Set(["children", "key", "ref", "dangerouslySetInnerHTML"]);

// Props that map to DOM properties rather than attributes
export const DOM_PROPERTIES = new Set(["value", "checked", "selected", "disabled", "readOnly", "multiple", "indeterminate"]);

// Prop name aliases
export const PROP_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  crossOrigin: "crossorigin",
};

interface AttributeBindingState {
  previousStyleProps: Set<string>;
}

/**
 * Apply all non-event props to a DOM element.
 * Handles static values, reactive signals, and special cases.
 * Returns an array of disposers for reactive attributes.
 */
export function applyAttributes(
  el: Element,
  props: Record<string, unknown>,
): CleanupFn[] {
  const disposers: CleanupFn[] = [];
  const owner = getCurrentInstance();

  for (const [key, value] of Object.entries(props)) {
    if (SKIP_PROPS.has(key) || isEventProp(key)) continue;

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
      disposers.push(dispose);
    } else {
      setSingleAttribute(el, key, value);
    }
  }

  return disposers;
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
    return resolved.reduce((acc, item) => {
      const normalized = normalizeStyle(item);
      return Object.assign(acc, normalized);
    }, {} as Record<string, any>);
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
  style.split(";").forEach((rule) => {
    const i = rule.indexOf(":");
    if (i > 0) {
      const prop = rule.slice(0, i).trim();
      const val = rule.slice(i + 1).trim();
      if (prop && val) {
        result[prop] = val;
      }
    }
  });
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
    return resolved
      .map(normalizeClass)
      .filter(Boolean)
      .join(" ");
  }

  if (typeof resolved === "object") {
    // { foo: true, bar: false, baz: signal } → "foo baz"
    return Object.entries(resolved)
      .filter(([, v]) => Boolean(resolve(v)))
      .map(([k]) => k)
      .join(" ");
  }

  return String(resolved);
}

/**
 * Recursively check if a value contains any reactive element.
 */
function containsReactive(value: unknown): boolean {
  if (isReactive(value)) return true;
  if (Array.isArray(value)) return value.some(containsReactive);
  if (typeof value === "object" && value !== null) {
    // For style objects/class objects, we only check one level deep for performance
    // but recursive is safer for nested class arrays.
    return Object.values(value).some(containsReactive);
  }
  return false;
}

/**
 * Convert camelCase to kebab-case.
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
