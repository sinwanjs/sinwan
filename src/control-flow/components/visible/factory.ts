import type { Reactive, SinwanElement, SinwanNode } from "../../../types.ts";
import { computed } from "../../../reactivity/computed.ts";
import { resolve } from "../../../reactivity/index.ts";
import { normalizeChildren } from "sinwan/jsx-runtime";
import { appendHiddenDisplay } from "../../shared/appendHiddenDisplay.ts";

/**
 * Props for the `<Visible>` component.
 */
export interface VisibleProps {
  /** Reactive value that controls visibility. */
  when: Reactive<unknown>;
  /** HTML tag to render (default: `"span"`). */
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
 * Conditionally renders an element with a given tag and style.
 * Hides the element by setting `display: none` when `when` is falsy.
 *
 * Unlike other control-flow primitives, `<Visible>` expands to a plain
 * intrinsic element (no symbol tag) so client/SSR/hydrate treat it as DOM.
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
 * Expand an `el(Visible, props)` node into the intrinsic element Visible returns.
 */
export function expandVisibleElement(element: SinwanElement): SinwanElement {
  return Visible(element.props as VisibleProps);
}
