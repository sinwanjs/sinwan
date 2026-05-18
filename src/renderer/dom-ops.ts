/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — DOM Operations
 *
 * Thin abstraction over native DOM APIs for testability
 * and potential future server-side DOM (e.g., happy-dom, linkedom).
 */

export interface DOMOps {
  createElement(tag: string): Element;
  createElementNS(namespace: string, tag: string): Element;
  createDocumentFragment(): DocumentFragment;
  createTextNode(text: string): Text;
  createComment(text: string): Comment;
  setAttribute(el: Element, key: string, value: string): void;
  removeAttribute(el: Element, key: string): void;
  setProperty(el: Element, key: string, value: unknown): void;
  insertBefore(parent: Node, child: Node, anchor: Node | null): void;
  appendChild(parent: Node, child: Node): void;
  remove(node: Node): void;
  setTextContent(node: Text, text: string): void;
  addEventListener(el: Element, event: string, handler: EventListener): void;
  removeEventListener(el: Element, event: string, handler: EventListener): void;
  parentNode(node: Node): Node | null;
  nextSibling(node: Node): Node | null;
}

function createDefaultDOMOps(): DOMOps {
  return {
    createElement(tag: string): Element {
      return document.createElement(tag);
    },

    createElementNS(namespace: string, tag: string): Element {
      return document.createElementNS(namespace, tag);
    },

    createDocumentFragment(): DocumentFragment {
      return document.createDocumentFragment();
    },

    createTextNode(text: string): Text {
      return document.createTextNode(text);
    },

    createComment(text: string): Comment {
      return document.createComment(text);
    },

    setAttribute(el: Element, key: string, value: string): void {
      el.setAttribute(key, value);
    },

    removeAttribute(el: Element, key: string): void {
      el.removeAttribute(key);
    },

    setProperty(el: Element, key: string, value: unknown): void {
      (el as any)[key] = value;
    },

    insertBefore(parent: Node, child: Node, anchor: Node | null): void {
      parent.insertBefore(child, anchor);
    },

    appendChild(parent: Node, child: Node): void {
      parent.appendChild(child);
    },

    remove(node: Node): void {
      node.parentNode?.removeChild(node);
    },

    setTextContent(node: Text, text: string): void {
      node.data = text;
    },

    addEventListener(el: Element, event: string, handler: EventListener): void {
      el.addEventListener(event, handler);
    },

    removeEventListener(
      el: Element,
      event: string,
      handler: EventListener,
    ): void {
      el.removeEventListener(event, handler);
    },

    parentNode(node: Node): Node | null {
      return node.parentNode;
    },

    nextSibling(node: Node): Node | null {
      return node.nextSibling;
    },
  };
}

const defaultDOMOps = createDefaultDOMOps();

/**
 * Live DOM operations object used by the renderer.
 */
export const domOps: DOMOps = { ...defaultDOMOps };

export function setDOMOps(overrides: Partial<DOMOps>): void {
  Object.assign(domOps, overrides);
}

export function resetDOMOps(): void {
  for (const key of Object.keys(domOps) as (keyof DOMOps)[]) {
    delete (domOps as any)[key];
  }
  Object.assign(domOps, defaultDOMOps);
}
