import type { Reactive, SinwanComponent, SinwanElement, SinwanNode } from "../types.ts";
import { computed } from "../reactivity/computed.ts";
import { resolve } from "../reactivity/index.ts";

export const SHOW_TYPE = Symbol.for("Sinwan.Show");
export const FOR_TYPE = Symbol.for("Sinwan.For");
export const SWITCH_TYPE = Symbol.for("Sinwan.Switch");
export const MATCH_TYPE = Symbol.for("Sinwan.Match");
export const INDEX_TYPE = Symbol.for("Sinwan.Index");
export const KEY_TYPE = Symbol.for("Sinwan.Key");
export const DYNAMIC_TYPE = Symbol.for("Sinwan.Dynamic");
export const PORTAL_TYPE = Symbol.for("Sinwan.Portal");

export interface ShowProps<T> {
  when: Reactive<T | false | null | undefined>;
  fallback?: SinwanNode;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

export interface ForProps<T> {
  each: Reactive<readonly T[]>;
  key?: (item: T, index: number) => string | number | symbol;
  fallback?: SinwanNode;
  children?: (item: T, index: () => number) => SinwanNode;
}

export interface SwitchProps {
  fallback?: SinwanNode;
  children?: SinwanNode | SinwanNode[];
}

export interface MatchProps<T> {
  when: Reactive<T | false | null | undefined>;
  children?: SinwanNode | ((value: NonNullable<T>) => SinwanNode);
}

export interface IndexProps<T> {
  each: Reactive<readonly T[]>;
  fallback?: SinwanNode;
  children?: (item: () => T, index: number) => SinwanNode;
}

export interface KeyProps<T> {
  when: Reactive<T>;
  children?: SinwanNode | ((value: T) => SinwanNode);
}

export type DynamicTag<P extends object = any> =
  | string
  | SinwanComponent<P>;

export type DynamicProps<P extends object = Record<string, unknown>> = P & {
  component: Reactive<DynamicTag<P> | null | undefined>;
  children?: SinwanNode;
};

export interface VisibleProps {
  when: Reactive<unknown>;
  as?: string;
  style?: Reactive<
    Record<string, string | number | null | undefined> | string | null | undefined
  >;
  children?: SinwanNode;
  [key: string]: unknown;
}

export interface PortalProps {
  mount?: Reactive<Node | string | (() => Node | null) | null | undefined>;
  children?: SinwanNode;
}

export function Show<T>(props: ShowProps<T>): SinwanElement {
  return {
    tag: SHOW_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function For<T>(props: ForProps<T>): SinwanElement {
  return {
    tag: FOR_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Switch(props: SwitchProps): SinwanElement {
  return {
    tag: SWITCH_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Match<T>(props: MatchProps<T>): SinwanElement {
  return {
    tag: MATCH_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Index<T>(props: IndexProps<T>): SinwanElement {
  return {
    tag: INDEX_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Key<T>(props: KeyProps<T>): SinwanElement {
  return {
    tag: KEY_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Dynamic<P extends object = Record<string, unknown>>(
  props: DynamicProps<P>,
): SinwanElement {
  return {
    tag: DYNAMIC_TYPE,
    props: props as unknown as Record<string, unknown>,
    children: [],
  };
}

export function Visible(props: VisibleProps): SinwanElement {
  const {
    when,
    as = "span",
    style,
    children,
    ...rest
  } = props;

  const visibleStyle = computed(() => {
    const base = readReactive(style);
    const visible = Boolean(readReactive(when));

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

export function Portal(props: PortalProps): SinwanElement {
  return {
    tag: PORTAL_TYPE,
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

export function resolveSwitchContent(element: SinwanElement): SinwanNode {
  const props = element.props as { fallback?: SinwanNode; children?: SinwanNode };
  const children = normalizeContent(props.children ?? element.children);

  const match = findTruthyMatch(children);
  return match !== undefined ? match : props.fallback;
}

function findTruthyMatch(nodes: SinwanNode[]): SinwanNode | undefined {
  for (const node of nodes) {
    if (node == null || typeof node === "boolean") continue;

    if (Array.isArray(node)) {
      const match = findTruthyMatch(node);
      if (match !== undefined) return match;
      continue;
    }

    if (isElementLike(node)) {
      let element = node;

      // Expand functional control flow components if needed
      if (typeof element.tag === "function") {
        const tag = element.tag;
        if (
          tag === Match ||
          tag === Show ||
          tag === For ||
          tag === Index ||
          tag === Key ||
          tag === Switch
        ) {
          element = (tag as Function)(element.props);
        }
      }

      if (isMatchElement(element)) {
        const when = readReactive((element.props as any).when);
        if (when) {
          return resolveMatchChildren(element, when);
        }
      } else if (isShowElement(element)) {
        const when = readReactive((element.props as any).when);
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
      } else if (isForElement(element)) {
        const props = element.props as any;
        const items = readReactive(props.each);
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(items[i], () => i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isIndexElement(element)) {
        const props = element.props as any;
        const items = readReactive(props.each);
        if (Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const child = props.children(() => items[i], i);
            const match = findTruthyMatch(normalizeContent(child));
            if (match !== undefined) return match;
          }
        }
      } else if (isKeyElement(element)) {
        const key = readReactive((element.props as any).when);
        const child = resolveKeyChildren(element, key);
        const match = findTruthyMatch(normalizeContent(child));
        if (match !== undefined) return match;
      }
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

function normalizeContent(content: unknown): SinwanNode[] {
  if (content == null || typeof content === "boolean") {
    return [];
  }
  return Array.isArray(content) ? content : [content as SinwanNode];
}

function normalizeChildren(children: SinwanNode | undefined): SinwanNode[] {
  if (children == null || typeof children === "boolean") {
    return [];
  }
  return Array.isArray(children) ? children : [children];
}

function readReactive(value: unknown): unknown {
  return resolve(value as any);
}

function appendHiddenDisplay(style: string): string {
  const trimmed = style.trim();
  const separator = trimmed.length > 0 && !trimmed.endsWith(";") ? ";" : "";
  return `${trimmed}${separator}display:none`;
}
