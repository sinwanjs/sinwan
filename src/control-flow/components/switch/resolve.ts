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
import { isValueRenderProp } from "../../shared/isValueRenderProp.ts";

const CONTROL_FLOW_TYPES: ReadonlySet<unknown> = new Set([
  MATCH_TYPE,
  SHOW_TYPE,
  FOR_TYPE,
  INDEX_TYPE,
  KEY_TYPE,
  SWITCH_TYPE,
  DYNAMIC_TYPE,
  PORTAL_TYPE,
  VIRTUAL_TYPE,
  ERROR_BOUNDARY_TYPE,
  SUSPENSE_TYPE,
  ACTIVITY_TYPE,
  VIEW_TRANSITION_TYPE,
]);

/** True for a built-in control-flow element (what a Match wrapper returns). */
export function isControlFlowResult(value: unknown): value is SinwanElement {
  return (
    value !== null &&
    typeof value === "object" &&
    "tag" in value &&
    CONTROL_FLOW_TYPES.has((value as SinwanElement).tag)
  );
}

/**
 * Turns a component child into what Switch should inspect: the control-flow
 * element it returns (a Match wrapper), or an element to render as a branch.
 */
export type ExpandComponent = (element: SinwanElement) => SinwanElement;

/** Default expansion: call the component directly (SSR, hydration, public helpers). */
function callComponent(element: SinwanElement): SinwanElement {
  const expanded = (element.tag as (p: Record<string, unknown>) => unknown)(
    element.props,
  );
  return isControlFlowResult(expanded) ? expanded : element;
}

/** The `<Switch>` fallback, as a branch key that stays equal across runs. */
const SWITCH_FALLBACK: unique symbol = Symbol("switch-fallback");

/**
 * The branch a `<Switch>` selected: `key` and `value` tell whether a re-run
 * picked the same branch; `build` creates its content (call it untracked).
 */
export interface SwitchBranch {
  key: unknown;
  value: unknown;
  /** True when the content is a render prop that receives `value`. */
  usesValue: boolean;
  build: () => SinwanNode;
}

function nodeBranch(content: SinwanNode, key: unknown = content): SwitchBranch {
  return { key, value: undefined, usesValue: false, build: () => content };
}

function fallbackBranch(fallback: SinwanNode): SwitchBranch {
  return {
    key: SWITCH_FALLBACK,
    value: undefined,
    usesValue: false,
    build: () => fallback,
  };
}

/**
 * Select the Switch branch (or fallback) for the current reactive state.
 * Reads the `when` conditions; builds Match content only through `build`.
 */
export function selectSwitchBranch(
  element: SinwanElement,
  expand: ExpandComponent = callComponent,
): SwitchBranch {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
    children?: SinwanNode;
  };
  if ("when" in props && props.when !== undefined) {
    const gate = resolve(props.when);
    if (!gate) {
      return fallbackBranch(props.fallback);
    }
  }
  const children = normalizeContent(props.children ?? element.children);
  return findBranch(children, expand) ?? fallbackBranch(props.fallback);
}

/**
 * Resolve which Switch branch (or fallback) should render for the current
 * reactive state.
 */
export function resolveSwitchContent(element: SinwanElement): SinwanNode {
  return selectSwitchBranch(element).build();
}

/** Content of the first truthy Match (or other branch) in `nodes`. */
export function findTruthyMatch(nodes: SinwanNode[]): SinwanNode | undefined {
  return findBranch(nodes)?.build();
}

/** Content found inside nested control flow, as a branch of its own. */
function findInContent(
  content: SinwanNode,
  expand: ExpandComponent,
): SwitchBranch | undefined {
  return findBranch(normalizeContent(content), expand);
}

/**
 * Walk a node list and return the first truthy Match (or nested control-flow
 * content) as a branch. Used by Switch and nested Match resolution.
 */
function findBranch(
  nodes: SinwanNode[],
  expand: ExpandComponent = callComponent,
): SwitchBranch | undefined {
  for (const node of nodes) {
    if (node == null || typeof node === "boolean") continue;

    if (Array.isArray(node)) {
      const match = findBranch(node, expand);
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
        element = expand(element);
      }

      if (isMatchElement(element)) {
        const when = resolve((element.props as { when?: unknown }).when);
        if (when) {
          const match = element;
          return {
            key: node,
            value: when,
            usesValue: isValueRenderProp(
              (match.props as { children?: unknown }).children,
            ),
            build: () => resolveMatchChildren(match, when),
          };
        }
      } else if (isShowElement(element)) {
        const when = resolve((element.props as { when?: unknown }).when);
        if (when) {
          const content = resolveShowChildren(element, when);
          const match = findInContent(content, expand);
          if (match !== undefined) return match;
        } else if ((element.props as { fallback?: SinwanNode }).fallback) {
          const match = findInContent(
            (element.props as { fallback?: SinwanNode }).fallback,
            expand,
          );
          if (match !== undefined) return match;
        }
      } else if (isSwitchElement(element)) {
        const content = selectSwitchBranch(element, expand).build();
        const match = findInContent(content, expand);
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
            const match = findInContent(child, expand);
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
            const match = findInContent(child, expand);
            if (match !== undefined) return match;
          }
        }
      } else if (isKeyElement(element)) {
        const key = resolve((element.props as { when?: unknown }).when);
        const child = resolveKeyChildren(element, key);
        const match = findInContent(child, expand);
        if (match !== undefined) return match;
      } else if (isDynamicElement(element)) {
        const tag = resolve(
          (element.props as { component?: unknown }).component,
        );
        if (typeof tag === "string" || typeof tag === "function") {
          const dynamicEl = createDynamicElement(element, tag);
          if (dynamicEl) {
            const match = findBranch([dynamicEl], expand);
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
            const match = findInContent(props.fallback, expand);
            if (match !== undefined) return match;
          }
        } else if (typeof props.children === "function") {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(items[i], () => i);
            const match = findInContent(child, expand);
            if (match !== undefined) return match;
          }
        }
      } else {
        return nodeBranch(element, node);
      }
    } else {
      return nodeBranch(node);
    }
  }
  return undefined;
}
