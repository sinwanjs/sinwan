/**
 * Sinwan Tree-Shake Detector
 *
 * Scans project source files to detect which Sinwan exports are
 * actually used via imports, JSX tags, or direct function calls.
 */

export interface DetectionResult {
  /** Named imports found: { sourceFile => Set<exportName> } */
  imports: Map<string, Set<string>>;
  /** All unique Sinwan identifiers referenced across the project */
  usedIdentifiers: Set<string>;
  /** Detected JSX component tags */
  jsxTags: Set<string>;
  /** Detected direct function calls */
  functionCalls: Set<string>;
}

/** Patterns for detecting Sinwan component usage in JSX */
const JSX_COMPONENT_PATTERNS: Record<string, RegExp> = {
  Show: /<(Show)\b[^/>]*\/?>/g,
  For: /<(For)\b[^/>]*\/?>/g,
  Switch: /<(Switch)\b[^/>]*\/?>/g,
  Match: /<(Match)\b[^/>]*\/?>/g,
  Index: /<(Index)\b[^/>]*\/?>/g,
  Key: /<(Key)\b[^/>]*\/?>/g,
  Portal: /<(Portal)\b[^/>]*\/?>/g,
  Suspense: /<(Suspense)\b[^/>]*\/?>/g,
  ErrorBoundary: /<(ErrorBoundary)\b[^/>]*\/?>/g,
  Virtual: /<(Virtual)\b[^/>]*\/?>/g,
  Activity: /<(Activity)\b[^/>]*\/?>/g,
  ViewTransition: /<(ViewTransition)\b[^/>]*\/?>/g,
  Dynamic: /<(Dynamic)\b[^/>]*\/?>/g,
  Visible: /<(Visible)\b[^/>]*\/?>/g,
};

/** Patterns for detecting direct Sinwan function calls */
const FUNCTION_CALL_PATTERNS: Record<string, RegExp> = {
  signal: /\bsignal\s*\(/g,
  computed: /\bcomputed\s*\(/g,
  effect: /\beffect\s*\(/g,
  untrack: /\buntrack\s*\(/g,
  batch: /\bbatch\s*\(/g,
  on: /\bon\s*\(/g,
  observable: /\bobservable\s*\(/g,
  nextTick: /\bnextTick\s*\(/g,
  mount: /\bmount\s*\(/g,
  render: /\brender\s*\(/g,
  renderToString: /\brenderToString\s*\(/g,
  renderPage: /\brenderPage\s*\(/g,
  streamPage: /\bstreamPage\s*\(/g,
  hydrate: /\bhydrate\s*\(/g,
  hydrateIslands: /\bhydrateIslands\s*\(/g,
  cc: /\bcc\s*\(/g,
  createContext: /\bcreateContext\s*\(/g,
  memo: /\bmemo\s*\(/g,
  lazy: /\blazy\s*\(/g,
  use: /\buse\s*\(/g,
  cache: /\bcache\s*\(/g,
  cacheSignal: /\bcacheSignal\s*\(/g,
  island: /\bisland\s*\(/g,
  provide: /\bprovide\s*\(/g,
  inject: /\binject\s*\(/g,
  getCurrentInstance: /\bgetCurrentInstance\s*\(/g,
  setCurrentInstance: /\bsetCurrentInstance\s*\(/g,
  onMounted: /\bonMounted\s*\(/g,
  onUnmounted: /\bonUnmounted\s*\(/g,
  onUpdated: /\bonUpdated\s*\(/g,
  onError: /\bonError\s*\(/g,
  onDispose: /\bonDispose\s*\(/g,
  onClient: /\bonClient\s*\(/g,
  onHydrated: /\bonHydrated\s*\(/g,
  onServer: /\bonServer\s*\(/g,
  escapeHtml: /\bescapeHtml\s*\(/g,
  safeHtml: /\bsafeHtml\s*\(/g,
  raw: /\braw\s*\(/g,
  jsx: /\bjsx\s*\(/g,
  jsxs: /\bjsxs\s*\(/g,
  jsxDEV: /\bjsxDEV\s*\(/g,
  unmountNode: /\bunmountNode\s*\(/g,
  renderNodeToDOM: /\brenderNodeToDOM\s*\(/g,
  renderElementToDOM: /\brenderElementToDOM\s*\(/g,
  domOps: /\bdomOps\b/g,
  setDOMOps: /\bsetDOMOps\s*\(/g,
  resetDOMOps: /\bresetDOMOps\s*\(/g,
  _$createTemplate: /\_\$createTemplate\s*\(/g,
};

/** Sinwan package identifiers that trigger scanning */
const SINWAN_PACKAGES = new Set([
  "sinwan",
  "@sinwan/core",
  "@sinwan/react",
  "@sinwan/react-client",
  "@sinwan/react-server",
  "@sinwan/react-static",
]);

/** Re-export names from the main sinwan entry */
const SINWAN_EXPORTS = new Set([
  // JSX Runtime
  "jsx",
  "jsxs",
  "jsxDEV",
  "Fragment",
  "raw",
  "HtmlEscapedString",
  "escapeHtml",
  "safeHtml",
  "isSafeHtml",
  // Reactivity
  "signal",
  "isSignal",
  "computed",
  "isComputed",
  "effect",
  "untrack",
  "on",
  "observable",
  "batch",
  "nextTick",
  "flushSync",
  "isReactive",
  "resolve",
  // Components
  "cc",
  "Show",
  "For",
  "Switch",
  "Match",
  "Index",
  "Key",
  "Dynamic",
  "Visible",
  "Portal",
  "ErrorBoundary",
  "Virtual",
  // Lifecycle
  "onMounted",
  "onUnmounted",
  "onUpdated",
  "onError",
  "onDispose",
  "onClient",
  "onHydrated",
  "onServer",
  // Instance
  "getCurrentInstance",
  "setCurrentInstance",
  "withInstance",
  "createComponentInstance",
  // DI
  "provide",
  "inject",
  // Islands
  "island",
  "isIslandElement",
  "ISLAND_TAG",
  "ISLAND_ATTR",
  "ISLAND_PROPS_ATTR",
  // Renderer
  "mount",
  "render",
  "unmountNode",
  "renderNodeToDOM",
  "renderElementToDOM",
  "domOps",
  "setDOMOps",
  "resetDOMOps",
  "_$createTemplate",
  // Hydration
  "hydrate",
  "hydrateIslands",
  // React interop
  "ReactFragment",
  "createContext",
  "memo",
  "lazy",
  "use",
  "cache",
  "cacheSignal",
  "addTransitionType",
  "captureOwnerStack",
  // Server
  "renderToString",
  "renderPage",
  "registerPage",
  "getPage",
  "hasPage",
  "streamPage",
  "streamHydratablePage",
  "streamHydratableNode",
  "renderToHydratableString",
  "renderNodeToHydratableString",
  "renderShell",
  "streamShell",
]);

/**
 * Extract named imports from an import declaration string.
 */
function extractNamedImports(importClause: string): string[] {
  const result: string[] = [];
  // Match patterns like: import { A, B as C } from 'sinwan'
  const specifierPattern =
    /\b([A-Za-z_$][A-Za-z0-9_$]*)\b(?:\s+as\s+\b[A-Za-z_$][A-Za-z0-9_$]*\b)?/g;
  let match: RegExpExecArray | null;
  while ((match = specifierPattern.exec(importClause)) !== null) {
    result.push(match[1]!);
  }
  return result;
}

/**
 * Scan a single source file for Sinwan usage.
 */
export function scanFile(code: string, filePath: string): DetectionResult {
  const imports = new Map<string, Set<string>>();
  const usedIdentifiers = new Set<string>();
  const jsxTags = new Set<string>();
  const functionCalls = new Set<string>();

  // 1. Detect import declarations from Sinwan packages
  const importRegex =
    /import\s+(?:(?:type\s+)?\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+)\s*,\s*(?:type\s+)?\{([^}]+)\})\s+from\s+['"]([^'"]+)['"];?/g;

  let importMatch: RegExpExecArray | null;
  while ((importMatch = importRegex.exec(code)) !== null) {
    const source = importMatch[5]!;
    if (!SINWAN_PACKAGES.has(source)) continue;

    const localImports = new Set<string>();

    // Named imports: import { A, B } from 'sinwan'
    if (importMatch[1]) {
      for (const name of extractNamedImports(importMatch[1])) {
        if (SINWAN_EXPORTS.has(name)) {
          localImports.add(name);
          usedIdentifiers.add(name);
        }
      }
    }

    // Namespace import: import * as sinwan from 'sinwan'
    if (importMatch[2]) {
      const nsName = importMatch[2]!;
      // Scan for namespace member access: sinwan.Show, sinwan.createSignal
      const nsAccessPattern = new RegExp(
        `\\b${nsName}\\.([A-Za-z_$][A-Za-z0-9_$]*)`,
        "g",
      );
      let nsMatch: RegExpExecArray | null;
      while ((nsMatch = nsAccessPattern.exec(code)) !== null) {
        const member = nsMatch[1]!;
        if (SINWAN_EXPORTS.has(member)) {
          localImports.add(member);
          usedIdentifiers.add(member);
        }
      }
    }

    // Default + named: import sinwan, { A } from 'sinwan'
    if (importMatch[4]) {
      for (const name of extractNamedImports(importMatch[4])) {
        if (SINWAN_EXPORTS.has(name)) {
          localImports.add(name);
          usedIdentifiers.add(name);
        }
      }
    }

    if (localImports.size > 0) {
      imports.set(filePath, localImports);
    }
  }

  // 2. Detect JSX component usage
  for (const [component, pattern] of Object.entries(JSX_COMPONENT_PATTERNS)) {
    if (pattern.test(code)) {
      jsxTags.add(component);
      usedIdentifiers.add(component);
    }
    // Reset lastIndex for next test
    pattern.lastIndex = 0;
  }

  // 3. Detect direct function calls
  for (const [fn, pattern] of Object.entries(FUNCTION_CALL_PATTERNS)) {
    if (pattern.test(code)) {
      functionCalls.add(fn);
      usedIdentifiers.add(fn);
    }
    pattern.lastIndex = 0;
  }

  // 4. Detect usage of aliased imports
  // If import { Show as S } from 'sinwan', then <S ...> should count as Show
  const aliasedImportRegex =
    /import\s+(?:type\s+)?\{[^}]*\b([A-Za-z_$][A-Za-z0-9_$]*)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)[^}]*\}\s+from\s+['"]([^'"]+)['"];?/g;
  let aliasMatch: RegExpExecArray | null;
  while ((aliasMatch = aliasedImportRegex.exec(code)) !== null) {
    const original = aliasMatch[1]!;
    const alias = aliasMatch[2]!;
    const source = aliasMatch[3]!;
    if (!SINWAN_PACKAGES.has(source)) continue;

    // Check if alias is used as JSX tag
    const aliasJsxPattern = new RegExp(`<(${alias})\\b[^/>]*\\/?>`, "g");
    if (aliasJsxPattern.test(code)) {
      jsxTags.add(original);
      usedIdentifiers.add(original);
    }

    // Check if alias is called as function
    const aliasCallPattern = new RegExp(`\\b${alias}\\s*\\(`, "g");
    if (aliasCallPattern.test(code)) {
      functionCalls.add(original);
      usedIdentifiers.add(original);
    }
  }

  return { imports, usedIdentifiers, jsxTags, functionCalls };
}

/**
 * Merge multiple file detection results into a global summary.
 */
export function mergeResults(results: DetectionResult[]): {
  allUsedIdentifiers: Set<string>;
  allJsxTags: Set<string>;
  allFunctionCalls: Set<string>;
  fileImports: Map<string, Set<string>>;
} {
  const allUsedIdentifiers = new Set<string>();
  const allJsxTags = new Set<string>();
  const allFunctionCalls = new Set<string>();
  const fileImports = new Map<string, Set<string>>();

  for (const r of results) {
    for (const id of r.usedIdentifiers) allUsedIdentifiers.add(id);
    for (const tag of r.jsxTags) allJsxTags.add(tag);
    for (const fn of r.functionCalls) allFunctionCalls.add(fn);
    for (const [file, ids] of r.imports) {
      if (!fileImports.has(file)) fileImports.set(file, new Set());
      for (const id of ids) fileImports.get(file)!.add(id);
    }
  }

  return { allUsedIdentifiers, allJsxTags, allFunctionCalls, fileImports };
}
