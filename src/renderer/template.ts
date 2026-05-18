import { domOps } from "./dom-ops.ts";
import { isReactive, effect, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import { getCurrentInstance } from "../component/instance.ts";

/** Runtime symbol to identify compiler-generated template results. */
export const SINWAN_TEMPLATE = Symbol.for("sinwan.template");

export interface SinwanTemplateResult {
  [SINWAN_TEMPLATE]: true;
  /** The root document fragment containing cloned DOM nodes. */
  fragment: DocumentFragment;
  /** Disposer functions for reactive bindings and event listeners. */
  disposers: CleanupFn[];
}

interface TemplateSlot {
  path: number[];
  type: string;
  name?: string;
}

interface TemplateDef {
  html: string;
  slots: TemplateSlot[];
}

const templateEl =
  typeof document !== "undefined" ? document.createElement("template") : null;

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

/** Create a DOM tree from a compiled template and bind dynamic expressions. */
export function _$createTemplate(
  def: TemplateDef,
  dynamics: unknown[],
): SinwanTemplateResult {
  if (!templateEl) {
    throw new Error("_$createTemplate can only be used in the browser");
  }

  templateEl.innerHTML = def.html;
  const root = templateEl.content.cloneNode(true) as DocumentFragment;
  const disposers: CleanupFn[] = [];

  // Walk slots and bind dynamic expressions
  let dynIdx = 0;
  for (const slot of def.slots) {
    const target = walkToSlot(root, slot.path);
    if (!target) continue;

    const value = dynamics[dynIdx++];

    if (slot.type === "child") {
      const comment = findCommentMarker(target, slot.path);
      if (comment && value != null) {
        if (isReactive(value)) {
          const text = domOps.createTextNode("");
          comment.parentNode?.replaceChild(text, comment);
          const dispose = effect(() => {
            text.textContent = String(resolve(value));
          });
          disposers.push(dispose);
          const instance = getCurrentInstance();
          if (instance) instance.effects.push(dispose);
        } else if (typeof value === "string" || typeof value === "number") {
          const text = domOps.createTextNode(String(value));
          comment.parentNode?.replaceChild(text, comment);
        } else if (value instanceof Node) {
          comment.parentNode?.replaceChild(value, comment);
        }
      }
    } else if (slot.type === "attr" && slot.name) {
      if (target instanceof Element) {
        const attrName = slot.name;
        if (isReactive(value)) {
          const dispose = effect(() => {
            const resolved = resolve(value);
            if (resolved == null || resolved === false) {
              domOps.removeAttribute(target, attrName);
            } else if (resolved === true) {
              domOps.setAttribute(target, attrName, "");
            } else {
              domOps.setAttribute(target, attrName, String(resolved));
            }
          });
          disposers.push(dispose);
          const instance = getCurrentInstance();
          if (instance) instance.effects.push(dispose);
        } else {
          if (value == null || value === false) {
            domOps.removeAttribute(target, attrName);
          } else if (value === true) {
            domOps.setAttribute(target, attrName, "");
          } else {
            domOps.setAttribute(target, attrName, String(value));
          }
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
    }
  }

  return { [SINWAN_TEMPLATE]: true as const, fragment: root, disposers };
}

function walkToSlot(root: Node, path: number[]): Node {
  let node: Node = root;
  // If root is a fragment, start from first child
  if (node instanceof DocumentFragment) {
    node = node.firstChild!;
  }
  for (const idx of path) {
    let child = node.firstChild;
    for (let i = 0; i < idx && child; i++) {
      child = child.nextSibling;
    }
    if (child) node = child;
  }
  return node;
}

function findCommentMarker(node: Node, path: number[]): Comment | null {
  if (node instanceof Comment && /^s:\d+$/.test(node.data)) {
    return node;
  }
  if (node instanceof Element) {
    for (const child of node.childNodes) {
      if (child instanceof Comment && /^s:\d+$/.test(child.data)) {
        return child;
      }
    }
  }
  return null;
}
