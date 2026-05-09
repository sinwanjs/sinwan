/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Element Rendering
 *
 * Converts SinwanElement trees into live DOM nodes.
 * Handles intrinsic HTML elements, functional components, and fragments.
 */

import type { SinwanElement, SinwanNode } from "../types.ts";
import type { MountedNode, MountedElement, MountedComponent } from "./types.ts";
import type { CleanupFn } from "../reactivity/index.ts";
import { domOps } from "./dom-ops.ts";
import { applyAttributes } from "./attributes.ts";
import { bindEvents } from "./events.ts";
import { renderChildrenToDOM, renderNodeToDOM } from "./render-children.ts";
import { Fragment } from "../jsx/jsx-runtime.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Portal,
  Switch,
  Visible,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
  Show,
} from "../component/control-flow.ts";
import { renderControlFlowToDOM } from "./render-control-flow.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
  handleComponentError,
  type ComponentInstance,
} from "../component/instance.ts";

// Void elements — no children, self-closing
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const SVG_NS = "http://www.w3.org/2000/svg";
const MATH_NS = "http://www.w3.org/1998/Math/MathML";

/**
 * Render an SinwanElement to DOM and insert into parent.
 */
export function renderElementToDOM(
  element: SinwanElement,
  parent: Node,
  anchor: Node | null = null,
  namespace: string | null = null,
): MountedNode {
  const { tag, props, children } = element;

  // Fragment — render children directly into parent
  if (tag === "" || (tag as any) === Fragment) {
    return renderFragmentToDOM(children, parent, anchor, namespace);
  }

  // Built-in control-flow components should belong to the current owner,
  // not create their own component instance.
  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal
  ) {
    return renderElementToDOM((tag as Function)(props), parent, anchor, namespace);
  }

  if (tag === Visible) {
    return renderElementToDOM((tag as Function)(props), parent, anchor, namespace);
  }

  if (
    isShowElement(element) ||
    isForElement(element) ||
    isSwitchElement(element) ||
    isIndexElement(element) ||
    isKeyElement(element) ||
    isDynamicElement(element) ||
    isPortalElement(element)
  ) {
    return renderControlFlowToDOM(element, parent, anchor, namespace);
  }

  // Functional component — call it and render the result
  if (typeof tag === "function") {
    return renderComponentToDOM(tag, props, parent, anchor, namespace);
  }

  // Intrinsic HTML element
  if (typeof tag === "string") {
    return renderIntrinsicToDOM(tag, props, children, parent, anchor, namespace);
  }

  // Fallback — render children
  return renderFragmentToDOM(children, parent, anchor, namespace);
}

/**
 * Render an intrinsic HTML element (<div>, <p>, <button>, etc.).
 */
function renderIntrinsicToDOM(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  parent: Node,
  anchor: Node | null,
  parentNamespace: string | null,
): MountedElement {
  const namespace = getElementNamespace(tag, parentNamespace);
  const el = namespace
    ? domOps.createElementNS(namespace, tag)
    : domOps.createElement(tag);

  // Apply attributes (returns disposers for reactive attrs)
  const attrDisposers = applyAttributes(el, props);

  // Bind event handlers
  const eventCleanups = bindEvents(el, props);

  // Render children (unless void element)
  let mountedChildren: MountedNode[] = [];
  if (!VOID_ELEMENTS.has(tag)) {
    // Handle dangerouslySetInnerHTML
    const dangerous = props.dangerouslySetInnerHTML as
      | { __html?: string }
      | undefined;
    if (dangerous && typeof dangerous.__html === "string") {
      (el as HTMLElement).innerHTML = dangerous.__html;
    } else {
      mountedChildren = renderChildrenToDOM(
        children,
        el,
        getChildNamespace(tag, namespace),
      );
    }
  }

  // Insert into parent
  if (anchor) {
    domOps.insertBefore(parent, el, anchor);
  } else {
    domOps.appendChild(parent, el);
  }

  const refCleanup = applyRef(el, props.ref);

  return {
    type: "element",
    node: el,
    children: mountedChildren,
    eventCleanups,
    attrDisposers,
    refCleanup,
  };
}

/**
 * Render a functional component.
 *
 * Creates a ComponentInstance, sets it as the active instance during
 * setup so lifecycle hooks (onMounted, etc.) register on it, then
 * renders the returned element tree.
 */
function renderComponentToDOM(
  component: Function,
  props: Record<string, unknown>,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedComponent {
  // Create instance with parent context
  const parentInstance = getCurrentInstance();
  const instance = createComponentInstance(
    component as any,
    props,
    parentInstance,
  );

  // Register as child of parent
  if (parentInstance) {
    parentInstance.children.push(instance);
  }

  // Set this instance as current during BOTH setup AND rendering,
  // so nested child components discover it as their parent.
  const prevInstance = setCurrentInstance(instance);

  let result: any;
  let child: MountedNode;

  try {
    result = component(props);

    // Render the returned element tree (still under this instance)
    if (result && typeof result === "object" && "tag" in result) {
      child = renderElementToDOM(result as SinwanElement, parent, anchor, namespace);
    } else {
      child = renderNodeToDOM(result as SinwanNode, parent, anchor, namespace);
    }
  } catch (err) {
    // Restore parent before error handling
    setCurrentInstance(prevInstance);
    handleComponentError(instance, err as Error);
    // Return empty placeholder on error
    const text = domOps.createTextNode("");
    if (anchor) {
      domOps.insertBefore(parent, text, anchor);
    } else {
      domOps.appendChild(parent, text);
    }
    return {
      type: "component",
      children: [{ type: "text", node: text }],
      disposers: [],
      instance,
    };
  }

  // Restore parent instance
  setCurrentInstance(prevInstance);

  instance.element = child;

  return {
    type: "component",
    children: [child],
    disposers: instance.effects,
    instance,
  };
}

/**
 * Render children as a fragment (no wrapper element).
 */
function renderFragmentToDOM(
  children: SinwanNode[],
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
): MountedNode {
  const anchorComment = domOps.createComment("Sinwan-f");
  if (anchor) {
    domOps.insertBefore(parent, anchorComment, anchor);
  } else {
    domOps.appendChild(parent, anchorComment);
  }

  const mounted: MountedNode[] = [];
  for (const child of children) {
    mounted.push(renderNodeToDOM(child, parent, anchor, namespace));
  }

  return { type: "fragment", children: mounted, anchor: anchorComment };
}

function getElementNamespace(tag: string, parentNamespace: string | null): string | null {
  if (tag === "svg") return SVG_NS;
  if (tag === "math") return MATH_NS;
  return parentNamespace;
}

function getChildNamespace(tag: string, namespace: string | null): string | null {
  if (namespace === SVG_NS && tag === "foreignObject") {
    return null;
  }
  return namespace;
}

type RefValue =
  | ((el: Element | null) => void)
  | { current: Element | null }
  | null
  | undefined;

function applyRef(el: Element, ref: unknown): CleanupFn | null {
  const value = ref as RefValue;
  if (!value) {
    return null;
  }

  if (typeof value === "function") {
    value(el);
    return () => value(null);
  }

  if (typeof value === "object" && "current" in value) {
    value.current = el;
    return () => {
      value.current = null;
    };
  }

  return null;
}
