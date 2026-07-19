/**
 * STATIC React adapters — build-time prerendering.
 *
 * Re-exports SHARED so consumers can import everything from `sinwan/react-static`.
 */

// SHARED (re-exported)
export * from "./_shared.ts";

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
