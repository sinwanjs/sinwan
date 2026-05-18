/// <reference lib="dom" />

/**
 * SinwanJS Hydration — Islands runtime
 *
 * `hydrateIslands(registry, root?)` finds every `[data-sinwan-island]`
 * element under `root` (defaults to `document`), looks up the matching
 * component in `registry` by `data-sinwan-island="<name>"`, deserialises
 * its `data-sinwan-island-props`, and calls `hydrate(Component, el, props)`
 * to make that island interactive — without touching the rest of the page.
 *
 * Islands are produced by `island(Component, { name })` on the server. Each
 * island carries an independent hydration marker counter, so they can be
 * hydrated lazily and in any order.
 */

import type { SinwanComponent } from "../types.ts";
import type { AppInstance } from "../renderer/types.ts";
import { hydrate } from "./hydrate.ts";
import { ISLAND_ATTR, ISLAND_PROPS_ATTR } from "../component/island.ts";

export type IslandRegistry = Record<string, SinwanComponent<any>>;

export interface HydrateIslandsOptions {
  /**
   * Optional callback invoked when an island name has no entry in the
   * registry. Defaults to a `console.warn` in development.
   */
  onMissing?: (name: string, element: Element) => void;
  /**
   * Optional callback invoked when props JSON fails to parse. Defaults to a
   * `console.error`. The island is skipped on parse failure.
   */
  onError?: (name: string, error: unknown, element: Element) => void;
}

export interface HydratedIsland {
  /** The island name (`data-sinwan-island` attribute). */
  name: string;
  /** The DOM element that was hydrated. */
  element: Element;
  /** The `AppInstance` returned by `hydrate()` — call `.unmount()` to detach. */
  instance: AppInstance;
}

/**
 * Hydrate every island under `root` using `registry` to resolve component
 * names. Returns an array of `{ name, element, instance }` tuples so callers
 * can later unmount specific islands.
 */
export function hydrateIslands(
  registry: IslandRegistry,
  root: ParentNode = typeof document !== "undefined" ? document : (null as any),
  options: HydrateIslandsOptions = {},
): HydratedIsland[] {
  if (!root) {
    throw new Error("hydrateIslands(): a DOM root is required");
  }

  const onMissing =
    options.onMissing ??
    ((name) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[sinwan] island "${name}" has no matching component in the registry — skipping.`,
      );
    });
  const onError =
    options.onError ??
    ((name, err) => {
      // eslint-disable-next-line no-console
      console.error(`[sinwan] island "${name}" failed to hydrate:`, err);
    });

  const elements = collectIslandElements(root);
  const hydrated: HydratedIsland[] = [];

  elements.forEach((el: Element) => {
    const name = el.getAttribute(ISLAND_ATTR);
    if (!name) return;

    const component = registry[name];
    if (!component) {
      onMissing(name, el);
      return;
    }

    let props: Record<string, unknown> = {};
    const raw = el.getAttribute(ISLAND_PROPS_ATTR);
    if (raw) {
      try {
        props = JSON.parse(raw);
      } catch (err) {
        onError(name, err, el);
        return;
      }
    }

    try {
      const instance = hydrate(component, el, props);
      hydrated.push({ name, element: el, instance });
    } catch (err) {
      onError(name, err, el);
    }
  });

  return hydrated;
}

/**
 * Walk the DOM under `root` and return every element carrying the island
 * attribute. Implemented manually rather than via `querySelectorAll(...)`
 * because some non-browser DOM emulators (notably happy-dom) reject
 * attribute selectors that contain dashes.
 */
function collectIslandElements(root: ParentNode): Element[] {
  const out: Element[] = [];
  const visit = (node: Element) => {
    if (node.getAttribute && node.getAttribute(ISLAND_ATTR) != null) {
      out.push(node);
    }
    const children = node.children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        visit(children[i]);
      }
    }
  };

  if ((root as Element).nodeType === 1) {
    visit(root as Element);
  } else {
    const children = (root as ParentNode).children;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        visit(children[i]);
      }
    }
  }
  return out;
}
