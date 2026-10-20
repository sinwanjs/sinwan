/**
 * SinwanJS Client Renderer — core public API (mount/render path).
 * Template/hoist helpers live in `web.ts` (`sinwan/renderer/web`).
 */

export { mount, render, unmountNode } from "./mount.ts";

export { renderNodeToDOM, renderChildrenToDOM } from "./render-children.ts";
export { renderElementToDOM } from "./render-element.ts";

export { domOps, setDOMOps, resetDOMOps } from "./dom-ops.ts";
export type { DOMOps } from "./dom-ops.ts";

export { applyAttributes } from "./attributes.ts";
export {
  bindEvents,
  bindEvent,
  bindDelegatedEvent,
  ensureDelegated,
  isEventProp,
  toEventName,
} from "./events.ts";

export type {
  MountedNode,
  MountedText,
  MountedReactiveText,
  MountedElement,
  MountedFragment,
  MountedReactiveBlock,
  MountedComponent,
  MountedAsync,
  MountedPortal,
  AppInstance,
} from "./types.ts";
