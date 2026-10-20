import type { Reactive, SinwanElement, SinwanNode } from "../../../types.ts";
import { resolve } from "../../../reactivity/index.ts";
import {
  ACTIVITY_TYPE,
  DYNAMIC_TYPE,
  ERROR_BOUNDARY_TYPE,
  FOR_TYPE,
  INDEX_TYPE,
  KEY_TYPE,
  MATCH_TYPE,
  PORTAL_TYPE,
  SHOW_TYPE,
  SUSPENSE_TYPE,
  SWITCH_TYPE,
  VIEW_TRANSITION_TYPE,
  VIRTUAL_TYPE,
} from "../../const.ts";
import { isElementLike } from "../../shared/isElementLike.ts";
import { normalizeContent } from "../../shared/normalizeContent.ts";
import { createDynamicElement } from "../dynamic/element.ts";
import {
  Match,
  isDynamicElement,
  isForElement,
  isIndexElement,
  isKeyElement,
  isMatchElement,
  isShowElement,
  isSwitchElement,
} from "../../identity.ts";
import { resolveKeyChildren } from "../key/resolve.ts";
import { resolveMatchChildren } from "../match/client.ts";
import { resolveShowChildren } from "../show/resolve.ts";

/**
 * Resolve which Switch branch (or fallback) should render for the current
 * reactive state.
 */
export function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
    children?: SinwanNode;
  };

  if ("when" in props && props.when !== undefined) {
    const gate = resolve(props.when);
    if (!gate) {
      return props.fallback;
    }
  }

  const children = normalizeContent(props.children ?? element.children);
  const match = findTruthyMatch(children);
  return match !== undefined ? match : props.fallback;
}

/**
 * Walk a node list and return the first truthy Match (or nested control-flow
 * content). Used by Switch and nested Match resolution.
 */
export function findTruthyMatch(nodes: SinwanNode[]): SinwanNode | undefined {
  for (const node of nodes) {
    if (node == null || typeof node === "boolean") continue;

    if (Array.isArray(node)) {
      const match = findTruthyMatch(node);
      if (match !== undefined) return match;
      continue;
    }

    if (isElementLike(node)) {
      let element = node;

      if (element.tag === Match) {
        element = Match(
          element.props as {
            when: Reactive<unknown>;
            children?: SinwanNode;
          },
        );
      }

      if (typeof element.tag === "function") {
        const tag = element.tag;
        const expanded = (tag as (p: Record<string, unknown>) => unknown)(
          element.props,
        );
        if (
          expanded &&
          typeof expanded === "object" &&
          "tag" in expanded &&
          ((expanded as SinwanElement).tag === MATCH_TYPE ||
            (expanded as SinwanElement).tag === SHOW_TYPE ||
            (expanded as SinwanElement).tag === FOR_TYPE ||
            (expanded as SinwanElement).tag === INDEX_TYPE ||
            (expanded as SinwanElement).tag === KEY_TYPE ||
            (expanded as SinwanElement).tag === SWITCH_TYPE ||
            (expanded as SinwanElement).tag === DYNAMIC_TYPE ||
            (expanded as SinwanElement).tag === PORTAL_TYPE ||
            (expanded as SinwanElement).tag === VIRTUAL_TYPE ||
            (expanded as SinwanElement).tag === ERROR_BOUNDARY_TYPE ||
            (expanded as SinwanElement).tag === SUSPENSE_TYPE ||
            (expanded as SinwanElement).tag === ACTIVITY_TYPE ||
            (expanded as SinwanElement).tag === VIEW_TRANSITION_TYPE)
        ) {
          element = expanded as SinwanElement;
        }
      }

      if (isMatchElement(element)) {
        const when = resolve((element.props as { when?: unknown }).when);
        if (when) {
          return resolveMatchChildren(element, when);
        }
      } else if (isShowElement(element)) {
        const when = resolve((element.props as { when?: unknown }).when);
        if (when) {
          const content = resolveShowChildren(element, when);
          const match = findTruthyMatch(normalizeContent(content));
          if (match !== undefined) return match;
        } else if ((element.props as { fallback?: SinwanNode }).fallback) {
          const match = findTruthyMatch(
            normalizeContent(
              (element.props as { fallback?: SinwanNode }).fallback,
            ),
          );
          if (match !== undefined) return match;
        }
      } else if (isSwitchElement(element)) {
        const content = resolveSwitchContent(element);
        const match = findTruthyMatch(normalizeContent(content));
        if (match !== undefined) return match;
      } else if (isForElement(element)) {
        const props = element.props as {
          each?: unknown;
          children?: (item: unknown, index: () => number) => SinwanNode;
        };
        const items = resolve(props.each);
        if (Array.isArray(items) && typeof props.children === "function") {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(items[i], () => i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isIndexElement(element)) {
        const props = element.props as {
          each?: unknown;
          children?: (item: () => unknown, index: number) => SinwanNode;
        };
        const items = resolve(props.each);
        if (Array.isArray(items) && typeof props.children === "function") {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(() => items[i], i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isKeyElement(element)) {
        const key = resolve((element.props as { when?: unknown }).when);
        const child = resolveKeyChildren(element, key);
        const match = findTruthyMatch(normalizeContent(child));
        if (match !== undefined) return match;
      } else if (isDynamicElement(element)) {
        const tag = resolve(
          (element.props as { component?: unknown }).component,
        );
        if (typeof tag === "string" || typeof tag === "function") {
          const dynamicEl = createDynamicElement(element, tag);
          if (dynamicEl) {
            const match = findTruthyMatch([dynamicEl]);
            if (match !== undefined) return match;
          }
        }
      } else if (element.tag === VIRTUAL_TYPE) {
        const props = element.props as {
          each?: unknown;
          fallback?: SinwanNode;
          children?: (item: unknown, index: () => number) => SinwanNode;
        };
        const items = resolve(props.each);
        if (!Array.isArray(items) || items.length === 0) {
          if (props.fallback) {
            const match = findTruthyMatch(normalizeContent(props.fallback));
            if (match !== undefined) return match;
          }
        } else if (typeof props.children === "function") {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(items[i], () => i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else {
        return element;
      }
    } else {
      return node;
    }
  }
  return undefined;
}
