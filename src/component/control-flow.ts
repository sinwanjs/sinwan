import type {
  Reactive,
  SinwanComponent,
  SinwanElement,
  SinwanNode,
} from "../types.ts";
import { computed } from "../reactivity/computed.ts";
import { resolve } from "../reactivity/index.ts";
import { normalizeChildren } from "sinwan/jsx-runtime";

export const SHOW_TYPE = Symbol.for("Sinwan.Show");
export const FOR_TYPE = Symbol.for("Sinwan.For");
export const SWITCH_TYPE = Symbol.for("Sinwan.Switch");
export const MATCH_TYPE = Symbol.for("Sinwan.Match");
export const INDEX_TYPE = Symbol.for("Sinwan.Index");
export const KEY_TYPE = Symbol.for("Sinwan.Key");
export const DYNAMIC_TYPE = Symbol.for("Sinwan.Dynamic");
export const PORTAL_TYPE = Symbol.for("Sinwan.Portal");
export const SUSPENSE_TYPE = Symbol.for("Sinwan.Suspense");
export const ACTIVITY_TYPE = Symbol.for("Sinwan.Activity");
export const VIEW_TRANSITION_TYPE = Symbol.for("Sinwan.ViewTransition");
export const ERROR_BOUNDARY_TYPE = Symbol.for("Sinwan.ErrorBoundary");
export const VIRTUAL_TYPE = Symbol.for("Sinwan.Virtual");

/**
 * Props for the `<Show>` control flow component.
 * @template T - Type of the `when` value.
 * @property when - Reactive truthy value that determines rendering.
 * @property fallback - Content to render if `when` is falsy.
 * @property children - Content or render function to render when `when` is truthy.
 */
export interface ShowProps<T> {
  /**
   * Reactive truthy value that determines rendering.
   */
  when: Reactive<T | false | null | undefined>;
  /**
   * Content to render if `when` is falsy.
   */
  fallback?: SinwanNode;
  /**
   * Content or render function to render when `when` is truthy.
   */
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

/**
 * Props for the `<For>` control flow component (looping over arrays).
 * @template T - Type of array items.
 * @property each - Reactive array to iterate over.
 * @property key - Function to extract a unique key per item (optional).
 * @property fallback - Content to render if the array is empty.
 * @property children - Render function for each item.
 */
export interface ForProps<T> {
  /**
   * Reactive array to iterate over.
   */
  each: Reactive<readonly T[]>;
  /**
   * Function to extract a unique key for each item (optional).
   */
  key?: (item: T, index: number) => string | number | symbol;
  /**
   * Content to render if the array is empty.
   */
  fallback?: SinwanNode;
  /**
   * Render function for each item, receives the item and an index accessor.
   */
  children?: (item: T, index: () => number) => SinwanNode;
}

/**
 * Props for the `<Switch>` control flow component.
 * @template T - Type of the `when` value.
 * @property when - Reactive gate; if provided and truthy, evaluate `<Match>` children.
 * @property fallback - Content to render if `when` is falsy or no `<Match>` is truthy.
 * @property children - List of `<Match>` elements to evaluate.
 */
export interface SwitchProps<T = unknown> {
  /**
   * Reactive gate. If provided and falsy, the switch renders `fallback`
   * without evaluating any `<Match>` branches.
   */
  when?: Reactive<T | false | null | undefined>;
  /**
   * Content to render if `when` is falsy or no <Match> branch is truthy.
   */
  fallback?: SinwanNode;
  /**
   * List of <Match> elements to evaluate, or an array of nodes.
   */
  children?: SinwanNode | SinwanNode[];
}

/**
 * Props for a `<Match>` branch in `<Switch>`.
 * @template T - Type of the `when` value.
 * @property when - Reactive value; truthy triggers this branch.
 * @property children - Content or render function if this branch matches.
 */
export interface MatchProps<T> {
  when: Reactive<T | false | null | undefined>;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

/**
 * Props for the `<Index>` control flow component (looping with stable index).
 * @template T - Type of array items.
 * @property each - Reactive array to iterate over.
 * @property fallback - Content to render if the array is empty.
 * @property children - Render function, receives an accessor for the item and current index.
 */
export interface IndexProps<T> {
  /**
   * Reactive array to iterate over.
   */
  each: Reactive<readonly T[]>;
  /**
   * Content to render if the array is empty.
   */
  fallback?: SinwanNode;
  /**
   * Render function, receives an accessor for the item and current index.
   */
  children?: (item: () => T, index: number) => SinwanNode;
}

/**
 * Props for the `<Key>` control flow component.
 * @template T - Type of the `when` value.
 * @property when - Reactive value to pass to children.
 * @property children - Content or render function receiving the value.
 */
export interface KeyProps<T> {
  /**
   * Reactive value to pass to children.
   */
  when: Reactive<T | null | undefined>;
  /**
   * Whether to cache the subtree when the key changes.
   * - `true` (default): keep-alive style — state and DOM are preserved
   *   and reattached when the key switches back.
   * - `false`: React-style — fully unmount and remount on every key change.
   */
  cache?: boolean;
  /**
   * Content or render function receiving the value.
   */
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

/**
 * Type of tag accepted by the `<Dynamic>` component.
 * Can be a string HTML tag or a Sinwan component.
 * @template P - Props type for the dynamic component.
 */
export type DynamicTag<P extends object = any> = string | SinwanComponent<P>;

/**
 * Props for the `<Dynamic>` component.
 * @template P - Props type for the dynamic component.
 * @property component - Reactive tag (string or component) to render.
 * @property children - Content to render inside the dynamic component.
 */
export type DynamicProps<P extends object = Record<string, unknown>> = P & {
  /**
   * Reactive tag (string HTML tag or Sinwan component) to render.
   */
  component: Reactive<DynamicTag<P> | null | undefined>;
  /**
   * Content to render inside the dynamic component.
   */
  children?: SinwanNode;
};

/**
 * Props for the `<Visible>` component.
 * @property when - Reactive value that controls visibility.
 * @property as - HTML tag to render (default: "span").
 * @property style - Style object/string, can be reactive.
 * @property children - Content to render inside the element.
 * @property [key: string] - Additional props passed to the rendered element.
 */
export interface VisibleProps {
  /** Reactive value that controls visibility. */
  when: Reactive<unknown>;
  /** HTML tag to render (default: "span"). */
  as?: string;
  /** Style object/string, can be reactive. */
  style?: Reactive<
    | Record<string, string | number | null | undefined>
    | string
    | null
    | undefined
  >;
  /** Content to render inside the element. */
  children?: SinwanNode;
  /** Additional props passed to the rendered element. */
  [key: string]: unknown;
}

/**
 * Props for the `<Portal>` component.
 * @property mount - Reactive reference to a DOM node or selector to mount into.
 * @property children - Content to render inside the portal.
 */
export interface PortalProps {
  /**
   * Reference to a DOM node, CSS selector, or function returning a DOM node.
   * Determines where the portal's children will be mounted.
   */
  mount?: Reactive<Node | string | (() => Node | null) | null | undefined>;
  /**
   * Content to render inside the portal.
   */
  children?: SinwanNode;
}

/**
 * Props for the `<ErrorBoundary>` component.
 * @property fallback - Content or render function to render on error.
 * @property children - Content to render within the boundary.
 */
export interface ErrorBoundaryProps {
  /**
   * Content or render function to display when an error is caught.
   * Receives the error and a reset callback.
   */
  fallback?: SinwanNode | ((error: Error, reset: () => void) => SinwanNode);

  /**
   * Content to render within the error boundary.
   */
  children?: SinwanNode;
}

/**
 * Props for the `<Virtual>` control flow component.
 * @template T - Type of array items.
 * @property each - Reactive array to render virtually.
 * @property key - Function to extract a unique key per item (optional).
 * @property fallback - Content to render if the array is empty.
 * @property children - Render function for each item, receives the item and index.
 */

export interface VirtualProps<T> {
  /**
   * Items to render virtually. Should be a reactive array.
   */
  each: Reactive<readonly T[]>;
  /**
   * Function to extract a unique key for each item. Optional.
   */
  key?: (item: T, index: number) => string | number | symbol;
  /**
   * Height of each item in pixels.
   */
  itemHeight: number;
  /**
   * Height of the scrollable container in pixels.
   */
  containerHeight: number;
  /**
   * Number of extra items to render above and below the visible window. Optional.
   * Clamped to list bounds at the edges.
   */
  overscan?: number;
  /**
   * Minimum number of items to keep in the DOM regardless of scroll position.
   * When the computed window (including overscan) is smaller than this value,
   * the window is expanded symmetrically and clamped to list bounds.
   * Useful for guaranteeing a consistent rendered count near boundaries.
   */
  minRendered?: number;
  /**
   * Content to render when the array is empty. Optional.
   */
  fallback?: SinwanNode;
  /**
   * Render function for each item, receives the item and a getter for its index.
   */
  children?: (item: T, index: () => number) => SinwanNode;
}

/**
 * Control flow primitive for conditional rendering.
 * Renders children if `when` is truthy, otherwise renders fallback.
 */
export function Show<T>(props: ShowProps<T>): SinwanElement {
  return {
    tag: SHOW_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Control flow primitive for looping over arrays.
 * Renders children for each item in the array, with optional fallback.
 */
export function For<T>(props: ForProps<T>): SinwanElement {
  return {
    tag: FOR_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Control flow primitive for exclusive branching.
 * Renders the first matching `<Match>` child, or fallback if none match.
 */
export function Switch<T>(props: SwitchProps<T>): SinwanElement {
  return {
    tag: SWITCH_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Control flow primitive for a single branch in `<Switch>`.
 * Renders children if the `when` prop is truthy.
 */
export function Match<T>(props: MatchProps<T>): SinwanElement {
  return {
    tag: MATCH_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Control flow primitive for array iteration with stable indices.
 * Renders children with an accessor for each item and its index.
 */
export function Index<T>(props: IndexProps<T>): SinwanElement {
  return {
    tag: INDEX_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Control flow primitive for keyed value rendering.
 * Passes the value from `when` to children or render function.
 */
export function Key<T>(props: KeyProps<T>): SinwanElement {
  return {
    tag: KEY_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Renders a dynamic tag or component, determined by the reactive `component` prop.
 * Accepts children and additional props.
 */
export function Dynamic<P extends object = Record<string, unknown>>(
  props: DynamicProps<P>,
): SinwanElement {
  return {
    tag: DYNAMIC_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Conditionally renders an element or component with a given tag and style.
 * Hides the element by setting `display: none` when `when` is falsy.
 */
export function Visible(props: VisibleProps): SinwanElement {
  const { when, as = "span", style, children, ...rest } = props;

  const visibleStyle = computed(() => {
    const base = resolve(style);
    const visible = Boolean(resolve(when));

    if (typeof base === "string") {
      return visible ? base : appendHiddenDisplay(base);
    }

    const styleObject =
      base && typeof base === "object"
        ? { ...(base as Record<string, string | number | null | undefined>) }
        : {};

    styleObject.display = visible ? styleObject.display : "none";
    return styleObject;
  });

  return {
    tag: as,
    props: {
      ...rest,
      style: visibleStyle,
      children,
    },
    children: normalizeChildren(children),
  };
}

/**
 * Renders children into a DOM node outside the normal hierarchy.
 * Mount point is controlled by the `mount` prop.
 */
export function Portal(props: PortalProps): SinwanElement {
  return {
    tag: PORTAL_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Error boundary for catching render errors in children.
 * Renders fallback content or function on error.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): SinwanElement {
  return {
    tag: ERROR_BOUNDARY_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

/**
 * Virtualized list control flow primitive.
 * Efficiently renders only visible items in a scrollable container.
 */
export function Virtual<T>(props: VirtualProps<T>): SinwanElement {
  return {
    tag: VIRTUAL_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function isElementLike(value: unknown): value is SinwanElement {
  return value != null && typeof value === "object" && "tag" in value;
}

export function isShowElement(element: SinwanElement): boolean {
  return element.tag === SHOW_TYPE;
}

export function isForElement(element: SinwanElement): boolean {
  return element.tag === FOR_TYPE;
}

export function isSwitchElement(element: SinwanElement): boolean {
  return element.tag === SWITCH_TYPE;
}

export function isMatchElement(element: SinwanElement): boolean {
  return element.tag === MATCH_TYPE;
}

export function isIndexElement(element: SinwanElement): boolean {
  return element.tag === INDEX_TYPE;
}

export function isKeyElement(element: SinwanElement): boolean {
  return element.tag === KEY_TYPE;
}

export function isDynamicElement(element: SinwanElement): boolean {
  return element.tag === DYNAMIC_TYPE;
}

export function isPortalElement(element: SinwanElement): boolean {
  return element.tag === PORTAL_TYPE;
}

export function isSuspenseElement(element: SinwanElement): boolean {
  return element.tag === SUSPENSE_TYPE;
}

export function isActivityElement(element: SinwanElement): boolean {
  return element.tag === ACTIVITY_TYPE;
}

export function isViewTransitionElement(element: SinwanElement): boolean {
  return element.tag === VIEW_TRANSITION_TYPE;
}

export function isErrorBoundaryElement(element: SinwanElement): boolean {
  return element.tag === ERROR_BOUNDARY_TYPE;
}

export function isVirtualElement(element: SinwanElement): boolean {
  return element.tag === VIRTUAL_TYPE;
}

export function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
    children?: SinwanNode;
  };

  // If a top-level `when` is provided, act as a reactive gate:
  // falsy → render fallback immediately without evaluating matches.
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

      // Handle el(Match, ...) where tag is the Match function itself
      if ((element as any).tag === Match) {
        element = Match((element as any).props);
      }

      // Expand functional control flow components if needed
      if (typeof element.tag === "function") {
        const tag = element.tag;
        const expanded = (tag as Function)(element.props);
        if (
          expanded &&
          typeof expanded === "object" &&
          "tag" in expanded &&
          (expanded.tag === MATCH_TYPE ||
            expanded.tag === SHOW_TYPE ||
            expanded.tag === FOR_TYPE ||
            expanded.tag === INDEX_TYPE ||
            expanded.tag === KEY_TYPE ||
            expanded.tag === SWITCH_TYPE ||
            expanded.tag === DYNAMIC_TYPE ||
            expanded.tag === PORTAL_TYPE ||
            expanded.tag === VIRTUAL_TYPE ||
            expanded.tag === ERROR_BOUNDARY_TYPE ||
            expanded.tag === SUSPENSE_TYPE ||
            expanded.tag === ACTIVITY_TYPE ||
            expanded.tag === VIEW_TRANSITION_TYPE)
        ) {
          element = expanded;
        }
      }

      if (isMatchElement(element)) {
        const when = resolve((element.props as any).when);
        if (when) {
          return resolveMatchChildren(element, when);
        }
      } else if (isShowElement(element)) {
        const when = resolve((element.props as any).when);
        if (when) {
          const content = resolveShowChildren(element, when);
          const match = findTruthyMatch(normalizeContent(content));
          if (match !== undefined) return match;
        } else if ((element.props as any).fallback) {
          const match = findTruthyMatch(
            normalizeContent((element.props as any).fallback),
          );
          if (match !== undefined) return match;
        }
      } else if (isSwitchElement(element)) {
        const content = resolveSwitchContent(element);
        const match = findTruthyMatch(normalizeContent(content));
        if (match !== undefined) return match;
      } else if (isForElement(element)) {
        const props = element.props as any;
        const items = resolve(props.each);
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(items[i], () => i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isIndexElement(element)) {
        const props = element.props as any;
        const items = resolve(props.each);
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(() => items[i], i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isKeyElement(element)) {
        const key = resolve((element.props as any).when);
        const child = resolveKeyChildren(element, key);
        const match = findTruthyMatch(normalizeContent(child));
        if (match !== undefined) return match;
      } else if (isDynamicElement(element)) {
        const tag = resolve((element.props as any).component);
        if (typeof tag === "string" || typeof tag === "function") {
          const { component, ...rest } = element.props as Record<
            string,
            unknown
          >;
          const children = normalizeContent(rest.children ?? element.children);
          const dynamicEl: SinwanElement = {
            tag: tag as SinwanElement["tag"],
            props: rest,
            children,
          };
          const match = findTruthyMatch([dynamicEl]);
          if (match !== undefined) return match;
        }
      } else if (isVirtualElement(element)) {
        const props = element.props as any;
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
        // It's a standard/non-control-flow element (like a div), so it's a truthy match
        return element;
      }
    } else {
      // It's a primitive (like a string or a number), which is a truthy match
      return node;
    }
  }
  return undefined;
}

export function resolveMatchChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

export function resolveShowChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

export function resolveKeyChildren(
  element: SinwanElement,
  value: unknown,
): SinwanNode {
  const children = (element.props as any).children ?? element.children;
  if (typeof children === "function") {
    return children(value);
  }
  return children as SinwanNode;
}

function appendHiddenDisplay(style: string): string {
  const trimmed = style.trim();
  const separator = trimmed.length > 0 && !trimmed.endsWith(";") ? ";" : "";
  return `${trimmed}${separator}display:none`;
}

export function createDynamicElement(
  element: SinwanElement,
  tag: unknown,
): SinwanElement | null {
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

export function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}
