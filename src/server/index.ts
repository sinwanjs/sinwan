/**
 * Sinwan Server — Public API
 *
 * Server-side rendering, streaming, and hydration marker injection.
 */

export {
  renderToString,
  renderPage,
  registerPage,
  getPage,
  hasPage,
  isSlots,
} from "./renderer.ts";

export {
  streamPage,
  streamHydratablePage,
  streamHydratableNode,
} from "./stream.ts";

export {
  renderToHydratableString,
  renderNodeToHydratableString,
} from "./hydration-markers.ts";

export { renderShell, streamShell } from "./shell.ts";
export type { ShellOptions, ShellScript, ShellStylesheet } from "./shell.ts";
