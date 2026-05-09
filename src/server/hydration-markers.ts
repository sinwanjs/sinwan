/**
 * SinwanJS Server — Hydration-Aware SSR Renderer
 *
 * Enhanced `renderToString` that injects hydration markers:
 *
 *   data-sinwan-id="c0"             — component boundary
 *   <!--sinwan-t:0-->val<!--/sinwan-t-->  — reactive text boundary
 *   data-sinwan-ev="click:0"        — event binding reference
 *
 * Usage:
 *   const html = await renderToHydratableString(App, { name: "World" });
 *   // → '<div data-sinwan-id="c0"><p>Count: <!--sinwan-t:0-->5<!--/sinwan-t--></p>...</div>'
 */

import type { SinwanElement, SinwanNode, SinwanComponent } from "../types.ts";
import { HtmlEscapedString, escapeHtml } from "../escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { isSignal } from "../reactivity/signal.ts";
import { isComputed } from "../reactivity/computed.ts";
import {
  compId,
  textMarkerOpen,
  textMarkerCloseStr,
  COMP_ID_ATTR,
  EVENT_ATTR,
} from "../hydration/markers.ts";
import { isEventProp, toEventName } from "../renderer/events.ts";
import {
  createComponentInstance,
  getCurrentInstance,
  setCurrentInstance,
} from "../component/instance.ts";
import {
  Dynamic,
  For,
  Index,
  Key,
  Match,
  Portal,
  Switch,
  Visible,
  Show,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isPortalElement,
  isShowElement,
  isSwitchElement,
} from "../component/control-flow.ts";

// ─── Hydration context ─────────────────────────────────────

interface HydrationContext {
  componentIndex: number;
  textIndex: number;
  eventIndex: number;
}

function createHydrationContext(): HydrationContext {
  return { componentIndex: 0, textIndex: 0, eventIndex: 0 };
}

// ─── Public API ────────────────────────────────────────────

/**
 * Render a component to an HTML string with hydration markers.
 */
export async function renderToHydratableString(
  component: SinwanComponent<any>,
  props?: Record<string, unknown>,
): Promise<string> {
  const ctx = createHydrationContext();
  const mergedProps = props ?? {};

  // Create a temporary instance so lifecycle hooks register silently
  const instance = createComponentInstance(component, mergedProps, null);
  const prev = setCurrentInstance(instance);

  try {
    // Call the component to get the element tree
    const result = await component(mergedProps);
    if (result && typeof result === "object" && "tag" in result) {
      return renderElementH(result, ctx, true /* isComponentRoot */);
    }

    return renderNodeH(result as SinwanNode, ctx);
  } finally {
    setCurrentInstance(prev);
  }
}

/**
 * Render a raw SinwanNode tree with hydration markers.
 */
export async function renderNodeToHydratableString(
  node: SinwanNode,
): Promise<string> {
  const ctx = createHydrationContext();
  return renderNodeH(node, ctx);
}

// ─── Internal rendering ────────────────────────────────────

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

/**
 * Render a node with hydration markers.
 */
function renderNodeH(node: SinwanNode, ctx: HydrationContext): string {
  if (node == null || typeof node === "boolean") return "";

  if (typeof node === "string") return escapeHtml(node);
  if (typeof node === "number") return String(node);

  if (node instanceof HtmlEscapedString) return node.value;

  // Signal or Computed → wrap with text markers
  if (isSignal(node) || isComputed(node)) {
    const value = (node as any).value;
    const idx = ctx.textIndex++;
    return `${textMarkerOpen(idx)}${escapeHtml(String(value))}${textMarkerCloseStr()}`;
  }

  if (Array.isArray(node)) {
    return node.map((child) => renderNodeH(child, ctx)).join("");
  }

  if (node instanceof Promise) {
    // Sync-only for hydration SSR — await should be handled at top level
    return "";
  }

  if (typeof node === "object" && "tag" in node) {
    return renderElementH(node, ctx, false);
  }

  return escapeHtml(String(node));
}

/**
 * Render an element with hydration markers.
 */
function renderElementH(
  element: SinwanElement,
  ctx: HydrationContext,
  isComponentRoot: boolean,
): string {
  const { tag, props, children } = element;

  // Fragment
  if (tag === "") {
    return children.map((child) => renderNodeH(child, ctx)).join("");
  }

  if (
    tag === Show ||
    tag === For ||
    tag === Switch ||
    tag === Index ||
    tag === Key ||
    tag === Dynamic ||
    tag === Portal
  ) {
    return renderElementH((tag as Function)(props), ctx, isComponentRoot);
  }

  if (tag === Visible) {
    return renderElementH((tag as Function)(props), ctx, isComponentRoot);
  }

  if (isShowElement(element)) {
    const when = readReactive(props.when);
    const content = when
      ? resolveShowChildren(element, when)
      : (props.fallback as SinwanNode);
    return renderNodeMaybeRoot(content, ctx, isComponentRoot);
  }

  if (isForElement(element)) {
    return renderForElementH(element, ctx);
  }

  if (isSwitchElement(element)) {
    return renderNodeMaybeRoot(resolveSwitchContent(element), ctx, isComponentRoot);
  }

  if (isMatchElement(element)) {
    const when = readReactive(props.when);
    return renderNodeMaybeRoot(
      when ? resolveMatchChildren(element, when) : null,
      ctx,
      isComponentRoot,
    );
  }

  if (isIndexElement(element)) {
    return renderIndexElementH(element, ctx);
  }

  if (isKeyElement(element)) {
    const key = readReactive(props.when);
    return renderNodeMaybeRoot(resolveKeyChildren(element, key), ctx, isComponentRoot);
  }

  if (isDynamicElement(element)) {
    const dynamicTag = readReactive(props.component);
    const dynamic = createDynamicElement(element, dynamicTag);
    return dynamic ? renderElementH(dynamic, ctx, isComponentRoot) : "";
  }

  if (isPortalElement(element)) {
    return "";
  }

  // Functional component
  if (typeof tag === "function") {
    return renderComponentH(tag, props, ctx);
  }

  // Intrinsic HTML element
  if (typeof tag === "string") {
    return renderIntrinsicH(tag, props, children, ctx, isComponentRoot);
  }

  return children.map((child) => renderNodeH(child, ctx)).join("");
}

/**
 * Render a functional component — calls it and marks the root element.
 */
function renderComponentH(
  component: Function,
  props: Record<string, unknown>,
  ctx: HydrationContext,
): string {
  // Set a temporary instance for lifecycle hooks
  const parentInstance = getCurrentInstance();
  const instance = createComponentInstance(component as any, props, parentInstance);
  if (parentInstance) {
    parentInstance.children.push(instance);
  }
  const prev = setCurrentInstance(instance);

  try {
    const result = component(props);

    if (result && typeof result === "object" && "tag" in result) {
      return renderElementH(
        result as SinwanElement,
        ctx,
        true /* mark as component root */,
      );
    }

    return renderNodeH(result as SinwanNode, ctx);
  } finally {
    setCurrentInstance(prev);
  }
}

/**
 * Render an intrinsic element with hydration markers.
 */
function renderIntrinsicH(
  tag: string,
  props: Record<string, unknown>,
  children: SinwanNode[],
  ctx: HydrationContext,
  isComponentRoot: boolean,
): string {
  let attrs = "";

  // Component boundary marker
  if (isComponentRoot) {
    attrs += ` ${COMP_ID_ATTR}="${compId(ctx.componentIndex++)}"`;
  }

  // Event markers + regular attributes
  const eventParts: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "children" ||
      key === "key" ||
      key === "ref" ||
      key === "dangerouslySetInnerHTML"
    ) {
      continue;
    }

    if (isEventProp(key)) {
      // Collect event markers
      const eventName = toEventName(key);
      eventParts.push(`${eventName}:${ctx.eventIndex++}`);
      continue;
    }

    if (value == null || value === false) continue;

    // Resolve signal/computed values to their current values for SSR
    let resolvedValue = value;
    if (isSignal(value) || isComputed(value)) {
      resolvedValue = (value as any).value;
    }

    attrs += renderServerAttribute(key, resolvedValue);
  }

  // Add event attribute
  if (eventParts.length > 0) {
    attrs += ` ${EVENT_ATTR}="${eventParts.join(",")}"`;
  }

  // Void elements
  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`;
  }

  // Dangerous inner HTML
  const dangerous = props.dangerouslySetInnerHTML as
    | { __html?: string }
    | undefined;
  if (dangerous && typeof dangerous.__html === "string") {
    return `<${tag}${attrs}>${dangerous.__html}</${tag}>`;
  }

  // Render children with markers
  const childrenHtml = children
    .map((child) => renderNodeH(child, ctx))
    .join("");

  return `<${tag}${attrs}>${childrenHtml}</${tag}>`;
}

function renderNodeMaybeRoot(
  node: SinwanNode,
  ctx: HydrationContext,
  isComponentRoot: boolean,
): string {
  if (
    isComponentRoot &&
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    "tag" in node
  ) {
    return renderElementH(node as SinwanElement, ctx, true);
  }
  return renderNodeH(node, ctx);
}

function renderForElementH(element: SinwanElement, ctx: HydrationContext): string {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: unknown, index: () => number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? renderNodeH(props.fallback, ctx) : "";
  }

  return each
    .map((item, index) => renderNodeH(props.children!(item, () => index), ctx))
    .join("");
}

function renderIndexElementH(element: SinwanElement, ctx: HydrationContext): string {
  const props = element.props as {
    each?: unknown;
    fallback?: SinwanNode;
    children?: (item: () => unknown, index: number) => SinwanNode;
  };
  const each = readReactive(props.each);
  if (!Array.isArray(each) || typeof props.children !== "function") {
    return props.fallback ? renderNodeH(props.fallback, ctx) : "";
  }

  if (each.length === 0) {
    return props.fallback ? renderNodeH(props.fallback, ctx) : "";
  }

  return each
    .map((item, index) => renderNodeH(props.children!(() => item, index), ctx))
    .join("");
}

function resolveShowChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as { fallback?: SinwanNode; children?: SinwanNode };
  const children = normalizeContent(props.children ?? element.children);

  for (const child of children) {
    const match = getMatchElement(child);
    if (!match) {
      continue;
    }

    const when = readReactive((match.props as any).when);
    if (when) {
      return resolveMatchChildren(match, when);
    }
  }

  return props.fallback;
}

function resolveMatchChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function resolveKeyChildren(element: SinwanElement, value: unknown): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function createDynamicElement(element: SinwanElement, tag: unknown): SinwanElement | null {
  if (typeof tag !== "string" && typeof tag !== "function") {
    return null;
  }

  const { component, ...props } = element.props as Record<string, unknown>;
  const children = normalizeContent(props.children ?? element.children);

  return {
    tag: tag as SinwanElement["tag"],
    props,
    children,
  };
}

function readReactive(value: unknown): unknown {
  return isSignal(value) || isComputed(value) ? (value as any).value : value;
}

function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}

function isElementLike(value: unknown): value is SinwanElement {
  return value != null && typeof value === "object" && "tag" in value;
}

function getMatchElement(value: unknown): SinwanElement | null {
  if (!isElementLike(value)) {
    return null;
  }
  if (isMatchElement(value)) {
    return value;
  }
  return value.tag === Match ? Match(value.props as any) : null;
}
