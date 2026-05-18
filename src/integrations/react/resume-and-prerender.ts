import { prerender, prerenderToNodeStream } from "./prerender.ts";
import type { ReactNode } from "./_types/core.ts";
import type {
  PrerenderOptions,
  PrerenderResult,
  PrerenderToNodeStreamResult,
} from "./_types/static.ts";

/**
 * React-compatible `resumeAndPrerender` & `resumeAndPrerenderToNodeStream`
 * — `[STATIC]`.
 *
 * Resume a previously-postponed prerender and produce another prerender
 * result. Sinwan's renderer never postpones, so these adapters re-render
 * `node` from scratch. `postponedState` is accepted for API compatibility
 * and ignored.
 *
 * SSR: build-time / server-only.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { resumeAndPrerender } from "sinwan/react-static";
 *
 * const { prelude } = await resumeAndPrerender(<Page />, postponed);
 * ```
 */
export function resumeAndPrerender(
  node: ReactNode,
  _postponedState: unknown,
  options: PrerenderOptions = {},
): Promise<PrerenderResult> {
  return prerender(node, options);
}

/**
 * React-compatible `resumeAndPrerenderToNodeStream` — `[STATIC]`.
 *
 * Same as `resumeAndPrerender`, but returns a Node.js `ReadableStream`
 * instead of a Web `ReadableStream`.
 *
 * `postponedState` is accepted for API compatibility and ignored.
 *
 * SSR: server-only (requires Node.js stream module).
 *
 * @example
 * ```ts
 * import { resumeAndPrerenderToNodeStream } from "sinwan/react-static";
 *
 * const { prelude } = await resumeAndPrerenderToNodeStream(<Page />, postponed);
 * res.writeHead(200, { "Content-Type": "text/html" });
 * prelude.pipe(res);
 * ```
 */
export function resumeAndPrerenderToNodeStream(
  node: ReactNode,
  _postponedState: unknown,
  options: PrerenderOptions = {},
): Promise<PrerenderToNodeStreamResult> {
  return prerenderToNodeStream(node, options);
}
