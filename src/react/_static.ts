/**
 * STATIC React adapters — build-time prerendering.
 *
 * _shared.ts is exported directly by index.ts, so no re-export needed here.
 */

// STATIC APIs (Phase 5)
export { prerender, prerenderToNodeStream } from "./prerender.ts";
export {
  resumeAndPrerender,
  resumeAndPrerenderToNodeStream,
} from "./resume-and-prerender.ts";

// STATIC type re-exports
export type {
  PrerenderOptions,
  PrerenderResult,
  PrerenderToNodeStreamResult,
  PostponedState,
  BootstrapScriptDescriptor,
} from "./_types/static.ts";
