import { domOps } from "./dom-ops.ts";
import { isReactive, effect, resolve } from "../reactivity/index.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";
import { renderNodeToDOM } from "./render-children.ts";
import { setSingleAttribute } from "./attributes.ts";
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

function isBindingDescriptor(value: unknown): value is BindingDescriptor {
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

/** Create a DOM tree from a compiled template and bind dynamic expressions. */
export function _$createTemplate(
  def: TemplateDef,
  dynamics: unknown[],
): SinwanTemplateResult {
  if (typeof document === "undefined") {
    throw new Error("_$createTemplate can only be used in the browser");
  }

  // Create a fresh template element each call so it belongs to the current
  // document. A module-level cache is risky in tests / SSR environments where
  // the global document is swapped between calls.
  const templateEl = document.createElement("template");
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
      if (comment) {
        const parent = comment.parentNode;
        if (parent) {
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
        }
      }
    } else if (slot.type === "attr" && slot.name) {
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

function findCommentMarker(node: Node, _path: number[]): Comment | null {
  if (
    node instanceof Comment &&
    DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(node) !== null
  ) {
    return node;
  }
  if (node instanceof Element) {
    for (const child of node.childNodes) {
      if (
        child instanceof Comment &&
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot(child) !== null
      ) {
        return child;
      }
    }
  }
  return null;
}
