import { domOps } from "./dom-ops.ts";
import {
  isReactive,
  effect,
  resolve,
  untrack,
  type CleanupFn,
} from "../reactivity/index.ts";
import { setActiveEffectScope } from "../reactivity/effect.ts";
import {
  getCurrentInstance,
  queueUpdatedHooks,
} from "../component/instance.ts";
import { renderNodeToDOM } from "./render-children.ts";
import { getParentNamespace } from "./render-element.ts";
import { unmountNode } from "./unmount.ts";
import { assignClassName, setSingleAttribute } from "./set-attribute.ts";
import { applyRef } from "./apply-ref.ts";
import { bindEvent } from "./events.ts";
import { type TemplateDef } from "./template-protocol.ts";
import type { SinwanNode } from "../types.ts";
import {
  SINWAN_TEMPLATE,
  SINWAN_SERVER_TEMPLATE,
  isBindingDescriptor,
  isTemplateResult,
  isServerTemplateResult,
  _$bindText,
  _$bindAttr,
  _$bindStyle,
  _$bindClass,
  type SinwanTemplateResult,
  type SinwanServerTemplateResult,
} from "./template-identity.ts";

export {
  SINWAN_TEMPLATE,
  SINWAN_SERVER_TEMPLATE,
  isBindingDescriptor,
  isTemplateResult,
  isServerTemplateResult,
  _$bindText,
  _$bindAttr,
  _$bindStyle,
  _$bindClass,
  type SinwanTemplateResult,
  type SinwanServerTemplateResult,
} from "./template-identity.ts";

/**
 * Parsed-template cache keyed by the active `document`.
 *
 * Hoisted `TemplateDef`s are module-level singletons, so the parsed
 * `<template>` element and compiled slot resolvers only need to be built
 * once per def per document. Each render then performs only a cheap
 * `cloneNode(true)` plus resolver calls instead of re-parsing `def.html`
 * or generic `walkToSlot` loops.
 */
interface CachedTemplate {
  templateEl: HTMLTemplateElement;
  resolvers: Array<(root: DocumentFragment) => Node>;
}

const templateCache = new WeakMap<Document, Map<TemplateDef, CachedTemplate>>();

/**
 * SVG element names that have no HTML meaning. A template rooted at one of
 * them (e.g. `<path>` hoisted from `paths.map((d) => <path d={d} />)`) is
 * parsed inside `<svg>`; the HTML parser would otherwise create HTML
 * elements that never paint. Names shared with HTML (`a`, `title`, `script`,
 * `style`) stay HTML because the markup alone does not say which is meant.
 */
const SVG_TEMPLATE_ROOTS: ReadonlySet<string> = new Set([
  "animate",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "foreignObject",
  "g",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "set",
  "stop",
  "switch",
  "symbol",
  "text",
  "textPath",
  "tspan",
  "use",
  "view",
]);

const TEMPLATE_ROOT_TAG = /^<([A-Za-z][\w-]*)/;

function parseTemplateHtml(html: string): HTMLTemplateElement {
  const templateEl = document.createElement("template");
  const rootTag = TEMPLATE_ROOT_TAG.exec(html)?.[1];
  if (rootTag === undefined || !SVG_TEMPLATE_ROOTS.has(rootTag)) {
    templateEl.innerHTML = html;
    return templateEl;
  }
  templateEl.innerHTML = `<svg>${html}</svg>`;
  const content = templateEl.content;
  const wrapper = content.firstChild!;
  while (wrapper.firstChild) content.insertBefore(wrapper.firstChild, wrapper);
  content.removeChild(wrapper);
  return templateEl;
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

  const owner = getCurrentInstance();
  if (owner?._replayingSetup) {
    return {
      [SINWAN_TEMPLATE]: true as const,
      fragment: document.createDocumentFragment(),
      disposers: [],
    };
  }

  const prevScope = setActiveEffectScope(null);
  try {
    return createLiveTemplate(def, dynamics);
  } finally {
    setActiveEffectScope(prevScope);
  }
}

function createLiveTemplate(
  def: TemplateDef,
  dynamics: unknown[],
): SinwanTemplateResult {
  // Reuse the parsed <template> element and compiled slot resolvers across
  // renders. Hoisted defs are module-level singletons, so we cache one entry
  // per def per document (see `templateCache` doc for the document-keying
  // rationale).
  let perDocument = templateCache.get(document);
  if (!perDocument) {
    perDocument = new Map();
    templateCache.set(document, perDocument);
  }
  let cached = perDocument.get(def);
  if (!cached) {
    const templateEl = parseTemplateHtml(def.html);
    cached = {
      templateEl,
      resolvers: def.slots.map((slot) => compileSlotResolver(slot.path, def)),
    };
    perDocument.set(def, cached);
  }
  const root = cached.templateEl.content.cloneNode(true) as DocumentFragment;
  const resolvers = cached.resolvers;
  const disposers: CleanupFn[] = [];

  // Pre-resolve every slot target on the unmutated tree. Child slots may be
  // comment markers (mixed static+dynamic) or parent Elements (sole-dynamic
  // path fill with no <!--s:N-->). Resolving upfront avoids sibling-index
  // shift after earlier slots mutate the DOM.
  const slotTargets: (Node | null)[] = new Array(def.slots.length);
  for (let i = 0; i < def.slots.length; i++) {
    slotTargets[i] = resolvers[i]!(root);
  }

  // Walk slots and bind dynamic expressions
  let dynIdx = 0;
  for (const slot of def.slots) {
    const value = dynamics[dynIdx++];

    if (slot.type === "child") {
      const target = slotTargets[dynIdx - 1];
      if (!target) continue;

      let parent: Node;
      let anchor: Comment | null;
      if (target instanceof Comment) {
        if (!target.parentNode) continue;
        parent = target.parentNode;
        anchor = target;
      } else if (target instanceof Element) {
        parent = target;
        anchor = null;
      } else {
        continue;
      }
      const namespace = getParentNamespace(parent);

      if (isBindingDescriptor(value) && value.type === "text") {
        const initial = value.getter();
        if (initial != null && typeof initial === "object") {
          const mounted = renderNodeToDOM(
            value.getter as SinwanNode,
            parent,
            anchor,
            namespace,
          );
          anchor?.parentNode?.removeChild(anchor);
          disposers.push(() => unmountNode(mounted));
        } else {
          disposers.push(bindScalarTextSlot(parent, anchor, value.getter));
        }
      } else if (isScalarReactiveChild(value)) {
        // Solid-style: reactive string/number children bind textContent
        // without comment-anchored reactive blocks (no sinwan-r pairs).
        const peek = untrack(() => resolve(value as () => unknown));
        if (peek != null && typeof peek === "object") {
          const mounted = renderNodeToDOM(
            value as SinwanNode,
            parent,
            anchor,
            namespace,
          );
          anchor?.parentNode?.removeChild(anchor);
          disposers.push(() => unmountNode(mounted));
        } else {
          disposers.push(bindScalarTextSlot(parent, anchor, value));
        }
      } else if (
        value == null ||
        typeof value === "boolean" ||
        typeof value === "string" ||
        typeof value === "number"
      ) {
        // Static scalar — replace marker or append into empty parent.
        const text = domOps.createTextNode(
          value == null || typeof value === "boolean" ? "" : String(value),
        );
        if (anchor) {
          parent.replaceChild(text, anchor);
        } else {
          parent.appendChild(text);
        }
      } else {
        const mounted = renderNodeToDOM(
          value as SinwanNode,
          parent,
          anchor,
          namespace,
        );
        anchor?.parentNode?.removeChild(anchor);
        disposers.push(() => unmountNode(mounted));
      }
    } else {
      const target = slotTargets[dynIdx - 1];
      if (!target) continue;

      if (slot.type === "attr" && slot.name) {
        if (target instanceof Element) {
          const attrName = slot.name;
          // previousStyleProps is only needed for style object diffing — not class.
          const state =
            attrName === "style"
              ? { previousStyleProps: new Set<string>() }
              : undefined;

          if (isBindingDescriptor(value)) {
            if (value.type === "text") continue;
            const getter = value.getter;
            const dispose = effect(() => {
              if (attrName === "class") {
                applyClassString(target, getter());
              } else {
                setSingleAttribute(target, attrName, getter(), state);
              }
            });
            disposers.push(dispose);
          } else if (isReactive(value)) {
            const dispose = effect(() => {
              const next = resolve(value);
              if (attrName === "class") {
                applyClassString(target, next);
              } else {
                setSingleAttribute(target, attrName, next, state);
              }
            });
            disposers.push(dispose);
          } else if (attrName === "class") {
            applyClassString(target, value);
          } else {
            setSingleAttribute(target, attrName, value, state);
          }
        }
      } else if (slot.type === "event" && slot.name) {
        if (target instanceof Element && typeof value === "function") {
          const eventName = slot.name.slice(2).toLowerCase();
          disposers.push(
            bindEvent(target, eventName, value as EventListener),
          );
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

/**
 * Zero-arity getters / signals / computeds that resolve to scalars bind as
 * textContent. Render-prop functions (arity > 0) are not used as template
 * child dynamics from the compiler; they take the vnode path if present.
 */
function isScalarReactiveChild(value: unknown): boolean {
  return isReactive(value);
}

/**
 * Bind a live text node into a child slot (Solid insertExpression).
 * `anchor` is the `<!--s:N-->` marker when present; null for parent-fill slots.
 */
function bindScalarTextSlot(
  parent: Node,
  anchor: Comment | null,
  source: unknown,
): CleanupFn {
  const textNode = domOps.createTextNode("");
  if (anchor) {
    parent.insertBefore(textNode, anchor);
    parent.removeChild(anchor);
  } else {
    parent.appendChild(textNode);
  }
  const owner = getCurrentInstance();
  let initialized = false;
  // Fixed effect: Update-every-10th re-runs ~1100 text bindings without
  // full cleanupDeps/retrack. queueUpdatedHooks is skipped when unused.
  return effect(
    () => {
      const resolved = resolve(source as () => unknown);
      const next =
        resolved == null || typeof resolved === "boolean"
          ? ""
          : String(resolved);
      if (textNode.data !== next) {
        textNode.data = next;
      }
      if (
        initialized &&
        owner &&
        owner._updatedHooks.length > 0
      ) {
        queueUpdatedHooks(owner);
      }
      initialized = true;
    },
    { fixed: true },
  );
}

/**
 * Fast class updates for template slots. HTML uses `className`; SVG and
 * MathML go through the class attribute.
 */
function applyClassString(el: Element, value: unknown): void {
  if (value == null || value === false || value === "") {
    assignClassName(el, "");
    return;
  }
  if (typeof value === "object") {
    setSingleAttribute(el, "class", value);
    return;
  }
  assignClassName(el, String(value));
}

/**
 * Compile a path into a one-shot walker used on every template clone.
 * Same fragment-unwrap semantics as `walkToSlot`, without per-call path loops
 * for the common length 0–3 cases (bench parent-fill / attr paths).
 */
function compileSlotResolver(
  path: number[],
  def: TemplateDef,
): (root: DocumentFragment) => Node {
  const htmlHint = () => def.html.slice(0, 120);
  const len = path.length;

  if (len === 0) {
    return (root) => {
      const node = root.firstChild;
      if (!node) {
        throw new Error(
          `Sinwan template: invalid slot path [] — template fragment has no children. Template html: "${htmlHint()}"`,
        );
      }
      return node;
    };
  }

  if (len === 1) {
    const i0 = path[0]!;
    return (root) => {
      const base = root.firstChild;
      if (!base) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0}] — template fragment has no children. Template html: "${htmlHint()}"`,
        );
      }
      let child = base.firstChild;
      for (let i = 0; i < i0 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0}] — no child at index ${i0} (depth 0). Template html: "${htmlHint()}"`,
        );
      }
      return child;
    };
  }

  if (len === 2) {
    const i0 = path[0]!;
    const i1 = path[1]!;
    return (root) => {
      const base = root.firstChild;
      if (!base) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1}] — template fragment has no children. Template html: "${htmlHint()}"`,
        );
      }
      let child = base.firstChild;
      for (let i = 0; i < i0 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1}] — no child at index ${i0} (depth 0). Template html: "${htmlHint()}"`,
        );
      }
      let node: Node = child;
      child = node.firstChild;
      for (let i = 0; i < i1 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1}] — no child at index ${i1} (depth 1). Template html: "${htmlHint()}"`,
        );
      }
      return child;
    };
  }

  if (len === 3) {
    const i0 = path[0]!;
    const i1 = path[1]!;
    const i2 = path[2]!;
    return (root) => {
      const base = root.firstChild;
      if (!base) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1},${i2}] — template fragment has no children. Template html: "${htmlHint()}"`,
        );
      }
      let child = base.firstChild;
      for (let i = 0; i < i0 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1},${i2}] — no child at index ${i0} (depth 0). Template html: "${htmlHint()}"`,
        );
      }
      let node: Node = child;
      child = node.firstChild;
      for (let i = 0; i < i1 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1},${i2}] — no child at index ${i1} (depth 1). Template html: "${htmlHint()}"`,
        );
      }
      node = child;
      child = node.firstChild;
      for (let i = 0; i < i2 && child; i++) child = child.nextSibling;
      if (!child) {
        throw new Error(
          `Sinwan template: invalid slot path [${i0},${i1},${i2}] — no child at index ${i2} (depth 2). Template html: "${htmlHint()}"`,
        );
      }
      return child;
    };
  }

  // Longer paths: closed-over loop (still one call per slot, no map alloc).
  const pathCopy = path.slice();
  return (root) => walkToSlot(root, pathCopy, def);
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
