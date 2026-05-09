// ─── Types ─────────────────────────────────────────────────

export type {
  SinwanNode,
  SinwanElement,
  SinwanComponent,
  SinwanPage,
  SinwanLayout,
  SinwanSlots,
  SinwanPrimitive,
  Reactive,
  RenderResult,
  PropsWithChildren,
  PropsWithSlots,
} from "./types.ts";

// ─── JSX Runtime ───────────────────────────────────────────

export {
  jsx,
  jsxs,
  jsxDEV,
  Fragment,
  raw,
  HtmlEscapedString,
} from "./jsx/jsx-runtime.ts";
export { escapeHtml, safeHtml, isSafeHtml } from "./escaper.ts";

// ─── Reactivity ────────────────────────────────────────────

export {
  signal,
  isSignal,
  computed,
  isComputed,
  effect,
  batch,
  nextTick,
} from "./reactivity/index.ts";

export type {
  Signal,
  Computed,
  CleanupFn,
  EffectFn,
} from "./reactivity/index.ts";

// ─── Components ────────────────────────────────────────────

export {
  createComponent,
  createPage,
  createLayout,
  Show,
  For,
  Switch,
  Match,
  Index,
  Key,
  Dynamic,
  Visible,
  Portal,
} from "./component/index.ts";

export {
  onMounted,
  onUnmounted,
  onUpdated,
  onError,
} from "./component/index.ts";

export { provide, inject, getCurrentInstance } from "./component/index.ts";

export type {
  ComponentInstance,
  InjectionKey,
  ShowProps,
  ForProps,
  SwitchProps,
  MatchProps,
  IndexProps,
  KeyProps,
  DynamicProps,
  DynamicTag,
  VisibleProps,
  PortalProps,
} from "./component/index.ts";

// ─── Renderer ──────────────────────────────────────────────

export {
  mount,
  render,
  unmountNode,
  renderNodeToDOM,
  renderElementToDOM,
  domOps,
  setDOMOps,
  resetDOMOps,
} from "./renderer/index.ts";

export type { MountedNode, AppInstance, DOMOps } from "./renderer/index.ts";

// ─── Hydration ─────────────────────────────────────────────

export { hydrate } from "./hydration/index.ts";

// ─── Server (SSR) ──────────────────────────────────────────

export {
  renderToString,
  renderPage,
  registerPage,
  getPage,
  hasPage,
  streamPage,
  streamHydratablePage,
  streamHydratableNode,
  renderToHydratableString,
  renderNodeToHydratableString,
} from "./server/index.ts";
