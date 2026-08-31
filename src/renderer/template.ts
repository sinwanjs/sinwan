import { domOps } from "./dom-ops.ts";
import { isReactive, effect, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";
import { renderNodeToDOM } from "./render-children.ts";
import { setSingleAttribute } from "./attributes.ts";
import { applyRef } from "./render-element.ts";
import {
  DEFAULT_TEMPLATE_SLOT_PROTOCOL,
  type TemplateSlot,
  type TemplateDef,
} from "./template-protocol.ts";
import type { SinwanNode } from "../types.ts";

/** Runtime symbol to identify compiler-generated template results. */
export const SINWAN_TEMPLATE = Symbol.for("sinwan.template");

export interface SinwanTemplateResult {
  [SINWAN_TEMPLATE]: true;
  /** The root document fragment containing cloned DOM nodes. */
  fragment: DocumentFragment;
  /** Disposer functions for reactive bindings and event listeners. */
  disposers: CleanupFn[];
}

/**
 * Runtime symbol identifying a server-side template result.
 *
 * When `_$createTemplate` runs in an environment without a `document` global
 * (SSR), it cannot build a live DOM fragment. Instead it returns this object,
 * carrying the original `TemplateDef` and `dynamics` so the SSR renderer can
 * serialize it to HTML (with hydration markers) and the hydration walker can
 * attach to the resulting DOM.
 */
export const SINWAN_SERVER_TEMPLATE = Symbol.for("sinwan.server_template");

export interface SinwanServerTemplateResult {
  [SINWAN_SERVER_TEMPLATE]: true;
  /** The compiled template definition (static HTML + slot descriptors). */
  def: TemplateDef;
  /** Dynamic values for each slot, in render order. */
  dynamics: unknown[];
}

/**
 * Parsed-template cache keyed by the active `document`.
 *
 * Hoisted `TemplateDef`s are module-level singletons, so the parsed
 * `<template>` element only needs to be built once per def per document. Tests
 * that swap `globalThis.document` get a fresh inner map automatically (the
 * outer `WeakMap` key is the document itself), so cache staleness across
 * environments is impossible. Each render then performs only a cheap
 * `cloneNode(true)` instead of re-parsing `def.html`.
 */
const templateCache = new WeakMap<
  Document,
  Map<TemplateDef, HTMLTemplateElement>
>();

// ─── Compiler-driven binding descriptors (Phase 2) ─────────────────

interface TextBindingDescriptor {
  type: "text";
  getter: () => unknown;
}

interface AttrBindingDescriptor {
  type: "attr";
  name: string;
  getter: () => unknown;
}

interface StyleBindingDescriptor {
  type: "style";
  getter: () => unknown;
}

interface ClassBindingDescriptor {
  type: "class";
  getter: () => unknown;
}

type BindingDescriptor =
  | TextBindingDescriptor
  | AttrBindingDescriptor
  | StyleBindingDescriptor
  | ClassBindingDescriptor;

export function isBindingDescriptor(
  value: unknown,
): value is BindingDescriptor {
  return (
    value != null &&
    typeof value === "object" &&
    "type" in (value as any) &&
    "getter" in (value as any) &&
    typeof (value as any).getter === "function"
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
    (value as any)[SINWAN_TEMPLATE] === true
  );
}

/** Check if a value is a server-side template result (no DOM available). */
export function isServerTemplateResult(
  value: unknown,
): value is SinwanServerTemplateResult {
  return (
    value != null &&
    typeof value === "object" &&
    (value as any)[SINWAN_SERVER_TEMPLATE] === true
  );
}

/**
 * Hydration mode flag. When true, `_$createTemplate` returns a
 * `SinwanServerTemplateResult` (def + dynamics) instead of building a live DOM
 * fragment, so the hydration walker can bind effects/events to the EXISTING
 * server-rendered DOM rather than creating + swapping new nodes.
 *
 * Set by `hydrate()` via `setHydrationMode(true)` around the component render.
 */
let hydrationMode = false;

/** Enable/disable hydration mode. Called by `hydrate()`. */
export function setHydrationMode(value: boolean): void {
  hydrationMode = value;
}

/** Create a DOM tree from a compiled template and bind dynamic expressions. */
export function _$createTemplate(
  def: TemplateDef,
  dynamics: unknown[],
): SinwanTemplateResult | SinwanServerTemplateResult {
  // SSR / no-DOM environment, or hydration mode: defer binding to the server
  // renderer or the hydration walker. Return a carrier object carrying the
  // def + dynamics so the consumer can serialize or in-place-bind them.
  if (typeof document === "undefined" || hydrationMode) {
    return { [SINWAN_SERVER_TEMPLATE]: true, def, dynamics };
  }

  // Reuse the parsed <template> element across renders. Hoisted defs are
  // module-level singletons, so we cache one parsed element per def per
  // document (see `templateCache` doc for the document-keying rationale).
  let perDocument = templateCache.get(document);
  if (!perDocument) {
    perDocument = new Map();
    templateCache.set(document, perDocument);
  }
  let templateEl = perDocument.get(def);
  if (!templateEl) {
    templateEl = document.createElement("template");
    templateEl.innerHTML = def.html;
    perDocument.set(def, templateEl);
  }
  const root = templateEl.content.cloneNode(true) as DocumentFragment;
  const disposers: CleanupFn[] = [];

  // Pre-collect all slot targets BEFORE processing any slots.
  // This avoids index-shift bugs: when a reactive child slot replaces a
  // comment marker with multiple nodes (e.g. reactive anchors), the sibling
  // indices used by walkToSlot become stale for subsequent slots in the same
  // parent. By collecting all targets upfront, we decouple slot lookup from
  // the mutating DOM tree.
  const childSlotMarkers: Comment[] = [];
  collectSlotMarkers(root, childSlotMarkers);

  // Pre-resolve attr/event slot targets on the unmutated DOM tree.
  const slotTargets: (Node | null)[] = def.slots.map((slot) =>
    slot.type === "child" ? null : walkToSlot(root, slot.path, def),
  );

  // Walk slots and bind dynamic expressions
  let dynIdx = 0;
  let childSlotIdx = 0;
  for (const slot of def.slots) {
    const value = dynamics[dynIdx++];

    if (slot.type === "child") {
      const comment = childSlotMarkers[childSlotIdx++];
      if (!comment || !comment.parentNode) continue;
      const parent = comment.parentNode;

      if (isBindingDescriptor(value) && value.type === "text") {
        const textNode = domOps.createTextNode("");
        parent.insertBefore(textNode, comment);
        parent.removeChild(comment);
        const owner = getCurrentInstance();
        let initialized = false;
        const dispose = effect(() => {
          const resolved = value.getter();
          textNode.textContent = resolved == null ? "" : String(resolved);
          if (initialized) {
            queueUpdatedHooks(owner);
          }
          initialized = true;
        });
        disposers.push(dispose);
      } else {
        const mounted = renderNodeToDOM(
          value as SinwanNode,
          parent,
          comment,
          null,
        );
        comment.parentNode?.removeChild(comment);
        if (
          mounted &&
          "dispose" in mounted &&
          typeof (mounted as any).dispose === "function"
        ) {
          disposers.push((mounted as any).dispose);
        }
      }
    } else {
      const target = slotTargets[dynIdx - 1];
      if (!target) continue;

      if (slot.type === "attr" && slot.name) {
        if (target instanceof Element) {
          const attrName = slot.name;
          const state =
            attrName === "style" || attrName === "class"
              ? { previousStyleProps: new Set<string>() }
              : undefined;

          if (isBindingDescriptor(value)) {
            if (value.type === "text") continue;
            const getter = value.getter;
            const dispose = effect(() => {
              setSingleAttribute(target, attrName, getter(), state);
            });
            disposers.push(dispose);
          } else if (isReactive(value)) {
            const dispose = effect(() => {
              setSingleAttribute(target, attrName, resolve(value), state);
            });
            disposers.push(dispose);
          } else {
            setSingleAttribute(target, attrName, value, state);
          }
        }
      } else if (slot.type === "event" && slot.name) {
        if (target instanceof Element && typeof value === "function") {
          const eventName = slot.name.slice(2).toLowerCase();
          target.addEventListener(eventName, value as any);
          disposers.push(() => {
            target.removeEventListener(eventName, value as any);
          });
        }
      } else if (slot.type === "ref") {
        if (target instanceof Element) {
          const refCleanup = applyRef(target, value);
          if (refCleanup) disposers.push(refCleanup);
        }
      }
    }
  }

  return { [SINWAN_TEMPLATE]: true as const, fragment: root, disposers };
}

function collectSlotMarkers(node: Node, out: Comment[]): void {
  if (node instanceof Comment) {
    if (DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(node) !== null) {
      out.push(node);
    }
    return;
  }
  if (node instanceof Element || node instanceof DocumentFragment) {
    for (const child of node.childNodes) {
      collectSlotMarkers(child, out);
    }
  }
}

export function walkToSlot(root: Node, path: number[], def: TemplateDef): Node {
  let node: Node = root;
  // If root is a fragment, start from first child
  if (node instanceof DocumentFragment) {
    if (!node.firstChild) {
      throw new Error(
        `Sinwan template: invalid slot path [${path.join(",")}] — template fragment has no children. Template html: "${def.html.slice(0, 120)}"`,
      );
    }
    node = node.firstChild;
  }
  for (let p = 0; p < path.length; p++) {
    const idx = path[p]!;
    let child = node.firstChild;
    for (let i = 0; i < idx && child; i++) {
      child = child.nextSibling;
    }
    if (!child) {
      throw new Error(
        `Sinwan template: invalid slot path [${path.join(",")}] — no child at index ${idx} (depth ${p}). Template html: "${def.html.slice(0, 120)}"`,
      );
    }
    node = child;
  }
  return node;
}
