/**
 * Sinwan Export Dependency Graph
 *
 * Maps public Sinwan exports to their internal/local dependencies.
 * This is used to determine which code must be preserved when only
 * a subset of exports is used.
 *
 * The graph covers two scenarios:
 * 1. **Module-level**: which source modules import which other modules.
 * 2. **Export-level**: which exports reference other local bindings.
 */

/** Set of all known Sinwan public export names */
export type SinwanExportName = string;

/**
 * Module-level dependency map.
 * Key: module path relative to src/
 * Value: modules it directly imports from within Sinwan.
 */
export const MODULE_DEPENDENCIES: Record<string, string[]> = {
  // JSX runtime is mostly self-contained
  "jsx/jsx-runtime.ts": ["types.ts", "jsx/jsx-types.ts"],
  "jsx/jsx-dev-runtime.ts": ["jsx/jsx-runtime.ts"],

  // Reactivity core
  "reactivity/signal.ts": [],
  "reactivity/computed.ts": ["reactivity/signal.ts", "reactivity/scheduler.ts"],
  "reactivity/effect.ts": [
    "reactivity/signal.ts",
    "reactivity/scheduler.ts",
  ],
  "reactivity/on.ts": ["reactivity/effect.ts"],
  "reactivity/observable.ts": ["reactivity/signal.ts"],
  "reactivity/batch.ts": ["reactivity/scheduler.ts"],
  "reactivity/scheduler.ts": [],
  "reactivity/normalization.ts": ["reactivity/signal.ts"],

  // Component runtime
  "component/create.ts": ["types.ts", "component/instance.ts"],
  "component/instance.ts": [
    "types.ts",
    "renderer/types.ts",
    "reactivity/scheduler.ts",
  ],
  "component/lifecycle.ts": [
    "component/instance.ts",
    "reactivity/effect.ts",
  ],
  "component/control-flow.ts": [
    "types.ts",
    "reactivity/computed.ts",
    "reactivity/normalization.ts",
  ],
  "component/provide-inject.ts": ["component/instance.ts"],
  "component/island.ts": [
    "types.ts",
    "renderer/template.ts",
    "renderer/dom-ops.ts",
  ],

  // Renderer
  "renderer/mount.ts": [
    "types.ts",
    "renderer/types.ts",
    "renderer/render-children.ts",
    "renderer/render-element.ts",
    "renderer/unmount.ts",
    "renderer/dom-ops.ts",
    "component/instance.ts",
  ],
  "renderer/render-children.ts": [
    "types.ts",
    "renderer/types.ts",
    "renderer/render-element.ts",
    "renderer/dom-ops.ts",
    "renderer/events.ts",
    "reactivity/signal.ts",
    "reactivity/effect.ts",
    "component/control-flow.ts",
  ],
  "renderer/render-element.ts": [
    "types.ts",
    "renderer/types.ts",
    "renderer/attributes.ts",
    "renderer/events.ts",
    "renderer/dom-ops.ts",
    "reactivity/signal.ts",
    "reactivity/effect.ts",
    "component/control-flow.ts",
    "component/instance.ts",
  ],
  "renderer/attributes.ts": ["renderer/dom-ops.ts", "reactivity/signal.ts"],
  "renderer/events.ts": ["renderer/dom-ops.ts"],
  "renderer/dom-ops.ts": [],
  "renderer/unmount.ts": ["renderer/types.ts", "renderer/dom-ops.ts"],
  "renderer/template.ts": [],

  // Hydration
  "hydration/hydrate.ts": [
    "types.ts",
    "renderer/types.ts",
    "renderer/dom-ops.ts",
    "component/control-flow.ts",
    "component/instance.ts",
    "hydration/walk.ts",
    "hydration/markers.ts",
  ],
  "hydration/islands.ts": [
    "types.ts",
    "renderer/types.ts",
    "renderer/dom-ops.ts",
    "hydration/markers.ts",
    "hydration/walk.ts",
  ],
  "hydration/markers.ts": [],
  "hydration/walk.ts": ["types.ts", "renderer/types.ts", "hydration/markers.ts"],

  // Server
  "server/renderer.ts": [
    "types.ts",
    "escaper.ts",
    "component/control-flow.ts",
  ],
  "server/stream.ts": [
    "server/renderer.ts",
    "server/hydration-markers.ts",
  ],
  "server/hydration-markers.ts": [
    "types.ts",
    "renderer/template.ts",
    "hydration/markers.ts",
  ],
  "server/shell.ts": [],

  // React interop (shared)
  "integrations/react/_shared.ts": [
    "types.ts",
    "reactivity/signal.ts",
    "reactivity/computed.ts",
    "reactivity/effect.ts",
    "component/instance.ts",
    "component/control-flow.ts",
  ],

  // Escaper
  "escaper.ts": [],
};

/**
 * Export-level dependency map for the monolithic / bundled scenario.
 * Each key is a public export name; the value lists other public exports
 * (or internal binding names) that must be present for this export to work.
 *
 * This is a conservative over-approximation.  It is safe to keep *more*
 * code than strictly necessary, but removing a required dependency will
 * break the bundle.
 */
export const EXPORT_DEPENDENCIES: Record<string, string[]> = {
  // ─── JSX Runtime ──────────────────────────────────────────
  jsx: ["Fragment", "raw", "HtmlEscapedString"],
  jsxs: ["Fragment", "raw", "HtmlEscapedString"],
  jsxDEV: ["Fragment", "raw", "HtmlEscapedString"],
  Fragment: [],
  raw: ["HtmlEscapedString"],
  HtmlEscapedString: [],
  escapeHtml: [],
  safeHtml: [],
  isSafeHtml: [],

  // ─── Reactivity ───────────────────────────────────────────
  signal: [],
  isSignal: [],
  computed: [],
  isComputed: [],
  effect: [],
  untrack: [],
  on: ["effect"],
  observable: ["signal"],
  batch: [],
  nextTick: [],
  flushSync: [],
  isReactive: [],
  resolve: [],

  // ─── Components ───────────────────────────────────────────
  cc: [
    "createComponentInstance",
    "setCurrentInstance",
    "getCurrentInstance",
  ],
  Show: [],
  For: [],
  Switch: [],
  Match: [],
  Index: [],
  Key: [],
  Dynamic: [],
  Visible: ["computed", "resolve"],
  Portal: [],
  ErrorBoundary: [],
  Virtual: [],

  // ─── Lifecycle ────────────────────────────────────────────
  onMounted: ["getCurrentInstance"],
  onUnmounted: ["getCurrentInstance"],
  onUpdated: ["getCurrentInstance"],
  onError: ["getCurrentInstance"],
  onDispose: ["getCurrentInstance"],
  onClient: [],
  onHydrated: ["getCurrentInstance"],
  onServer: [],

  // ─── Instance ─────────────────────────────────────────────
  getCurrentInstance: [],
  setCurrentInstance: [],
  withInstance: ["getCurrentInstance", "setCurrentInstance"],
  createComponentInstance: ["nextTick"],

  // ─── DI ───────────────────────────────────────────────────
  provide: ["getCurrentInstance"],
  inject: ["getCurrentInstance"],

  // ─── Islands ──────────────────────────────────────────────
  island: [],
  isIslandElement: [],
  ISLAND_TAG: [],
  ISLAND_ATTR: [],
  ISLAND_PROPS_ATTR: [],

  // ─── Renderer ─────────────────────────────────────────────
  mount: [
    "renderNodeToDOM",
    "renderElementToDOM",
    "unmountNode",
    "domOps",
    "createComponentInstance",
    "setCurrentInstance",
    "getCurrentInstance",
    "fireMountedHooks",
    "fireUnmountedHooks",
    "handleComponentError",
  ],
  render: [
    "mount",
    "renderElementToDOM",
    "renderNodeToDOM",
    "createComponentInstance",
    "setCurrentInstance",
    "fireMountedHooks",
  ],
  unmountNode: ["domOps"],
  renderNodeToDOM: [
    "renderElementToDOM",
    "domOps",
    "signal",
    "effect",
    "isShowElement",
    "isForElement",
    "isSwitchElement",
    "isMatchElement",
    "isIndexElement",
    "isKeyElement",
    "isDynamicElement",
    "isPortalElement",
    "isErrorBoundaryElement",
    "isVirtualElement",
    "resolveSwitchContent",
    "resolveShowChildren",
    "resolveMatchChildren",
    "resolveKeyChildren",
  ],
  renderElementToDOM: [
    "domOps",
    "applyAttributes",
    "bindEvents",
    "signal",
    "effect",
    "createComponentInstance",
    "setCurrentInstance",
    "getCurrentInstance",
    "fireMountedHooks",
    "fireUnmountedHooks",
    "handleComponentError",
  ],
  domOps: [],
  setDOMOps: [],
  resetDOMOps: ["domOps"],
  _$createTemplate: [],

  // ─── Hydration ────────────────────────────────────────────
  hydrate: [
    "domOps",
    "isShowElement",
    "isForElement",
    "isSwitchElement",
    "isMatchElement",
    "isIndexElement",
    "isKeyElement",
    "isDynamicElement",
    "isPortalElement",
    "isErrorBoundaryElement",
    "isVirtualElement",
    "createComponentInstance",
    "setCurrentInstance",
    "getCurrentInstance",
    "fireMountedHooks",
    "fireHydratedHooks",
  ],
  hydrateIslands: [
    "domOps",
    "hydrate",
    "isIslandElement",
    "ISLAND_TAG",
    "ISLAND_ATTR",
    "ISLAND_PROPS_ATTR",
  ],

  // ─── React interop ────────────────────────────────────────
  ReactFragment: ["Fragment"],
  createContext: ["signal", "computed"],
  memo: ["computed"],
  lazy: [],
  use: [],
  cache: ["signal"],
  cacheSignal: ["signal", "computed"],
  addTransitionType: [],
  captureOwnerStack: [],

  // ─── Server ───────────────────────────────────────────────
  renderToString: ["escapeHtml", "isShowElement", "isForElement"],
  renderPage: ["renderToString"],
  registerPage: [],
  getPage: [],
  hasPage: [],
  streamPage: ["renderPage"],
  streamHydratablePage: ["streamPage", "renderToHydratableString"],
  streamHydratableNode: ["streamHydratablePage"],
  renderToHydratableString: [
    "renderToString",
    "_$createTemplate",
    "isTemplateResult",
  ],
  renderNodeToHydratableString: ["renderToHydratableString"],
  renderShell: [],
  streamShell: ["renderShell"],
};

/**
 * Core reactivity primitives that many other features transitively need.
 * These are always safe to keep because they are tiny and widely used.
 */
export const ALWAYS_KEEP = new Set<string>([
  "signal",
  "computed",
  "effect",
  "untrack",
  "batch",
  "nextTick",
  "resolve",
  "isReactive",
  "Fragment",
]);

/**
 * Internal type guards / helpers that are referenced by renderers.
 * Kept automatically if any renderer function is kept.
 */
export const RENDERER_HELPERS = new Set<string>([
  "isShowElement",
  "isForElement",
  "isSwitchElement",
  "isMatchElement",
  "isIndexElement",
  "isKeyElement",
  "isDynamicElement",
  "isPortalElement",
  "isSuspenseElement",
  "isActivityElement",
  "isViewTransitionElement",
  "isErrorBoundaryElement",
  "isVirtualElement",
  "isElementLike",
  "resolveSwitchContent",
  "resolveShowChildren",
  "resolveMatchChildren",
  "resolveKeyChildren",
  "normalizeContent",
  "normalizeChildren",
  "readReactive",
  "appendHiddenDisplay",
]);

/**
 * Compute the full set of exports (and internal bindings) that must be
 * preserved given a set of explicitly used identifiers.
 *
 * @param used - Set of directly-used export names.
 * @returns Expanded set including all transitive dependencies.
 */
export function resolveTransitiveDependencies(used: Set<string>): Set<string> {
  const needed = new Set<string>([...ALWAYS_KEEP]);
  for (const id of used) needed.add(id);

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of needed) {
      const deps = EXPORT_DEPENDENCIES[id];
      if (!deps) continue;
      for (const dep of deps) {
        if (!needed.has(dep)) {
          needed.add(dep);
          changed = true;
        }
      }
    }
  }

  // If any renderer or control-flow component is kept, also keep helpers
  const hasRenderer = [...needed].some(
    (id) =>
      id.startsWith("render") ||
      id === "mount" ||
      id === "unmountNode" ||
      id === "hydrate" ||
      id === "hydrateIslands"
  );
  if (hasRenderer) {
    for (const h of RENDERER_HELPERS) needed.add(h);
  }

  return needed;
}

/**
 * Determine which source modules are required to build the given set
 * of used exports.
 *
 * @param usedExports - Final set of exports to preserve.
 * @returns Set of module paths (relative to src/) that must be included.
 */
export function resolveRequiredModules(usedExports: Set<string>): Set<string> {
  const modules = new Set<string>();

  // Map export names back to their originating module
  const EXPORT_TO_MODULE: Record<string, string> = {
    // JSX
    jsx: "jsx/jsx-runtime.ts",
    jsxs: "jsx/jsx-runtime.ts",
    jsxDEV: "jsx/jsx-dev-runtime.ts",
    Fragment: "jsx/jsx-runtime.ts",
    raw: "jsx/jsx-runtime.ts",
    HtmlEscapedString: "jsx/jsx-runtime.ts",
    escapeHtml: "escaper.ts",
    safeHtml: "escaper.ts",
    isSafeHtml: "escaper.ts",
    // Reactivity
    signal: "reactivity/signal.ts",
    isSignal: "reactivity/signal.ts",
    computed: "reactivity/computed.ts",
    isComputed: "reactivity/computed.ts",
    effect: "reactivity/effect.ts",
    untrack: "reactivity/effect.ts",
    on: "reactivity/on.ts",
    observable: "reactivity/observable.ts",
    batch: "reactivity/batch.ts",
    nextTick: "reactivity/scheduler.ts",
    flushSync: "reactivity/scheduler.ts",
    isReactive: "reactivity/normalization.ts",
    resolve: "reactivity/normalization.ts",
    // Components
    cc: "component/create.ts",
    Show: "component/control-flow.ts",
    For: "component/control-flow.ts",
    Switch: "component/control-flow.ts",
    Match: "component/control-flow.ts",
    Index: "component/control-flow.ts",
    Key: "component/control-flow.ts",
    Dynamic: "component/control-flow.ts",
    Visible: "component/control-flow.ts",
    Portal: "component/control-flow.ts",
    ErrorBoundary: "component/control-flow.ts",
    Virtual: "component/control-flow.ts",
    // Instance
    getCurrentInstance: "component/instance.ts",
    setCurrentInstance: "component/instance.ts",
    withInstance: "component/instance.ts",
    createComponentInstance: "component/instance.ts",
    fireMountedHooks: "component/instance.ts",
    fireUnmountedHooks: "component/instance.ts",
    fireUpdatedHooks: "component/instance.ts",
    fireHydratedHooks: "component/instance.ts",
    queueUpdatedHooks: "component/instance.ts",
    handleComponentError: "component/instance.ts",
    // Lifecycle
    onMounted: "component/lifecycle.ts",
    onUnmounted: "component/lifecycle.ts",
    onUpdated: "component/lifecycle.ts",
    onError: "component/lifecycle.ts",
    onDispose: "component/lifecycle.ts",
    onClient: "component/lifecycle.ts",
    onHydrated: "component/lifecycle.ts",
    onServer: "component/lifecycle.ts",
    // DI
    provide: "component/provide-inject.ts",
    inject: "component/provide-inject.ts",
    // Islands
    island: "component/island.ts",
    isIslandElement: "component/island.ts",
    ISLAND_TAG: "component/island.ts",
    ISLAND_ATTR: "component/island.ts",
    ISLAND_PROPS_ATTR: "component/island.ts",
    // Renderer
    mount: "renderer/mount.ts",
    render: "renderer/mount.ts",
    unmountNode: "renderer/unmount.ts",
    renderNodeToDOM: "renderer/render-children.ts",
    renderElementToDOM: "renderer/render-element.ts",
    domOps: "renderer/dom-ops.ts",
    setDOMOps: "renderer/dom-ops.ts",
    resetDOMOps: "renderer/dom-ops.ts",
    _$createTemplate: "renderer/template.ts",
    isTemplateResult: "renderer/template.ts",
    SINWAN_TEMPLATE: "renderer/template.ts",
    applyAttributes: "renderer/attributes.ts",
    bindEvents: "renderer/events.ts",
    bindEvent: "renderer/events.ts",
    isEventProp: "renderer/events.ts",
    toEventName: "renderer/events.ts",
    // Hydration
    hydrate: "hydration/hydrate.ts",
    hydrateIslands: "hydration/islands.ts",
    // React interop
    ReactFragment: "integrations/react/_shared.ts",
    createContext: "integrations/react/_shared.ts",
    memo: "integrations/react/_shared.ts",
    lazy: "integrations/react/_shared.ts",
    use: "integrations/react/_shared.ts",
    cache: "integrations/react/_shared.ts",
    cacheSignal: "integrations/react/_shared.ts",
    addTransitionType: "integrations/react/_shared.ts",
    captureOwnerStack: "integrations/react/_shared.ts",
    // Server
    renderToString: "server/renderer.ts",
    renderPage: "server/renderer.ts",
    registerPage: "server/renderer.ts",
    getPage: "server/renderer.ts",
    hasPage: "server/renderer.ts",
    streamPage: "server/stream.ts",
    streamHydratablePage: "server/stream.ts",
    streamHydratableNode: "server/stream.ts",
    renderToHydratableString: "server/hydration-markers.ts",
    renderNodeToHydratableString: "server/hydration-markers.ts",
    renderShell: "server/shell.ts",
    streamShell: "server/shell.ts",
  };

  for (const exportName of usedExports) {
    const mod = EXPORT_TO_MODULE[exportName];
    if (mod) modules.add(mod);
  }

  // Resolve module-level transitive dependencies
  let changed = true;
  while (changed) {
    changed = false;
    for (const mod of modules) {
      const deps = MODULE_DEPENDENCIES[mod];
      if (!deps) continue;
      for (const dep of deps) {
        if (!modules.has(dep)) {
          modules.add(dep);
          changed = true;
        }
      }
    }
  }

  return modules;
}
