import type { SinwanElement, SinwanNode } from "../../../types.ts";
import type { MountedNode } from "../../../renderer/types.ts";
import { resolve, signal, untrack } from "../../../reactivity/index.ts";
import {
  hydrateContent,
  makeReactiveBlock,
  type HydrationCursor,
} from "../../../hydration/walk.ts";
import { resolveFallbackDelay } from "../../shared/resolveFallbackDelay.ts";
import { resolveShowChildren } from "./client.ts";
import { SHOW_FALLBACK, SHOW_WAITING } from "./resolve.ts";

/**
 * Hydrate a `<Show>` boundary and keep it reactive on `when` changes.
 */
export function hydrateShow(
  element: SinwanElement,
  cursor: HydrationCursor,
): MountedNode {
  const props = element.props as {
    when?: unknown;
    fallback?: SinwanNode;
    fallbackDelay?: unknown;
  };
  const when = resolve(props.when);
  const content = when
    ? resolveShowChildren(element, when)
    : props.fallback;
  const initialMounted = hydrateContent(content, cursor);

  const delay = resolveFallbackDelay(props.fallbackDelay);
  if (delay > 0) return hydrateDelayedShow(element, props, initialMounted, !when, delay);

  return makeReactiveBlock(
    initialMounted,
    () => {
      const newWhen = resolve(props.when);
      return newWhen
        ? resolveShowChildren(element, newWhen)
        : props.fallback;
    },
    () => resolve(props.when),
  );
}

/**
 * `<Show fallbackDelay>` after hydration: the server already painted the
 * fallback for a falsy `when` (it counts as shown); later falsy periods
 * render nothing until the delay has passed.
 */
function hydrateDelayedShow(
  element: SinwanElement,
  props: { when?: unknown; fallback?: SinwanNode },
  initialMounted: MountedNode,
  fallbackPainted: boolean,
  delay: number,
): MountedNode {
  const delayElapsed = signal(fallbackPainted);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const renderKey = (): unknown => {
    const value = resolve(props.when);
    if (value) {
      clearTimeout(timer);
      timer = undefined;
      if (untrack(() => delayElapsed.value)) delayElapsed.value = false;
      return value;
    }
    if (delayElapsed.value) return SHOW_FALLBACK;
    timer ??= setTimeout(() => {
      timer = undefined;
      delayElapsed.value = true;
    }, delay);
    return SHOW_WAITING;
  };

  return makeReactiveBlock(
    initialMounted,
    () => {
      const value = resolve(props.when);
      if (value) return resolveShowChildren(element, value);
      return untrack(() => delayElapsed.value) ? props.fallback : null;
    },
    renderKey,
  );
}
