/**
 * SinwanJS Components — Islands (partial hydration).
 *
 * `island(Component, options?)` marks a component as a hydration boundary.
 * Wherever it appears in the render tree:
 *
 *   • The surrounding HTML stays static (no hydration markers).
 *   • The component subtree is rendered to a hydratable string with a fresh
 *     marker context (component / text / event indices restart at 0).
 *   • The output is wrapped in a tag carrying `data-sinwan-island="<name>"`
 *     and a JSON-encoded `data-sinwan-island-props` attribute so the client
 *     can call `hydrate(Component, el, props)` for that island only.
 *
 * Islands work with every server renderer (static `renderToString` /
 * `streamPage` and hydratable `renderToHydratableString` / `streamShell`
 * variants) — the marker wrapper is identical in all of them.
 */

import type { SinwanComponent, SinwanElement } from "../types.ts";

/** Sentinel tag used for island elements — recognised by every renderer. */
export const ISLAND_TAG = Symbol("sinwan.island");

/** Attribute that flags an island root in the SSR output. */
export const ISLAND_ATTR = "data-sinwan-island";

/** Attribute carrying the JSON-encoded props for an island. */
export const ISLAND_PROPS_ATTR = "data-sinwan-island-props";

let autoId = 0;

export interface IslandOptions {
  /** Public name used to look the component up at hydration time. */
  name?: string;
  /** HTML tag emitted around the island. Defaults to `"div"`. */
  tag?: string;
  /**
   * Custom serialiser for props. Defaults to `JSON.stringify`. Throwing here
   * surfaces a server error rather than emitting a broken marker.
   */
  serializeProps?: (props: unknown) => string;
}

export interface IslandMeta {
  readonly component: SinwanComponent<any>;
  readonly name: string;
  readonly tag: string;
  readonly serializeProps: (props: unknown) => string;
}

/**
 * Internal element shape produced by an island wrapper. The renderer reads
 * `props.__island` to find the metadata and the original props.
 */
export interface IslandElement extends SinwanElement {
  tag: typeof ISLAND_TAG;
  props: {
    __island: IslandMeta;
    __props: Record<string, unknown>;
    children: never[];
  };
  children: never[];
}

/**
 * Wrap a component as an island so the renderer treats it as a hydration
 * boundary. The returned component still behaves like the original on the
 * client (when `hydrate()` is called against it directly).
 */
export function island<P extends Record<string, unknown> = {}>(
  component: SinwanComponent<P>,
  options: IslandOptions = {},
): SinwanComponent<P> {
  if (typeof component !== "function") {
    throw new TypeError("island(): component must be a function component");
  }

  const meta: IslandMeta = {
    component,
    name: options.name ?? component.name ?? `island_${++autoId}`,
    tag: options.tag ?? "div",
    serializeProps: options.serializeProps ?? defaultSerialize,
  };

  const wrapper = function IslandWrapper(props: P): IslandElement {
    // Strip framework-injected `children` from the serialised props — they
    // are already rendered into the island's hydration markers and would
    // explode `JSON.stringify` if they contained JSX.
    const cleanProps: Record<string, unknown> = {};
    if (props) {
      for (const key of Object.keys(props)) {
        if (key === "children") continue;
        cleanProps[key] = (props as Record<string, unknown>)[key];
      }
    }

    return {
      tag: ISLAND_TAG,
      props: {
        __island: meta,
        __props: cleanProps,
        children: [],
      },
      children: [],
    } as IslandElement;
  } as unknown as SinwanComponent<P>;

  // Friendly name for tooling.
  Object.defineProperty(wrapper, "name", {
    value: `island(${meta.name})`,
    configurable: true,
  });

  return wrapper;
}

/** Type-guard: does `value` look like an island element? */
export function isIslandElement(value: unknown): value is IslandElement {
  return (
    value != null &&
    typeof value === "object" &&
    (value as SinwanElement).tag === ISLAND_TAG
  );
}

function defaultSerialize(props: unknown): string {
  return JSON.stringify(props ?? {});
}

/**
 * Escape a JSON string so it can live inside an HTML attribute value
 * (double-quoted) without breaking parsing or enabling injection.
 */
export function escapeIslandPropsJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/\0/g, "");
}
