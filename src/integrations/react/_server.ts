/**
 * SERVER React adapters — Bun-first SSR (Node-compatible).
 *
 * Re-exports SHARED so consumers can import everything from `sinwan/react-server`.
 */

// SHARED (re-exported)
export * from "./_shared.ts";

// SERVER APIs (Phase 4)
export { renderToString } from "./render-to-string.ts";
export { renderToStaticMarkup } from "./render-to-static-markup.ts";
export {
  renderToReadableStream,
  type ReactReadableStream,
} from "./render-to-readable-stream.ts";
export { renderToPipeableStream } from "./render-to-pipeable-stream.ts";
export { resume, resumeToPipeableStream } from "./resume.ts";

// Shell helpers — automatic full-document SSR + hydrate boot snippet.
// These are framework-agnostic (any Sinwan component, including React JSX
// authored against `sinwan/jsx-runtime`).
export { renderShell, streamShell } from "../../server/shell.ts";
export type {
  ShellOptions,
  ShellScript,
  ShellStylesheet,
} from "../../server/shell.ts";

// Islands (partial hydration). React-style components flow through `island()`
// unchanged because the wrapper accepts any function component.
export { island, isIslandElement } from "../../component/island.ts";
export type { IslandOptions, IslandMeta } from "../../component/island.ts";

// SERVER type re-exports
export type {
  RenderToReadableStreamOptions,
  RenderToPipeableStreamOptions,
  PipeableStream,
  NodeJS_WritableStream,
  BootstrapScript,
  ResumeOptions,
  ResumeToPipeableStreamOptions,
} from "./_types/server.ts";
