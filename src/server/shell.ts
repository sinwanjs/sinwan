/**
 * SinwanJS Server — HTML Shell helpers
 *
 * `renderShell` / `streamShell` produce a complete HTML document around a
 * hydratable component render. They auto-inject:
 *
 *   • `<!doctype html>` + `<html>` / `<head>` / `<body>` scaffolding
 *   • A configurable mount container (default `<div id="app">`)
 *   • A `<script type="application/json" data-sinwan-props>` block carrying
 *     the props JSON so the client can call `hydrate()` with the same shape
 *   • Optional client `<script>` tags (module by default)
 *   • An optional inline boot snippet that calls `hydrate()` against the
 *     mount container — fixes the v1 limitation where users had to wire
 *     the script tag and `hydrate()` call themselves.
 */

import type { SinwanComponent, SinwanNode } from "../types.ts";
import { escapeHtml } from "../common/escaper.ts";
import { renderServerAttribute } from "./attribute-utils.ts";
import { renderToHydratableString } from "./hydration-markers.ts";
import { streamHydratablePage } from "./stream.ts";

export interface ShellScript {
  /** Script source URL. */
  src: string;
  /** Defaults to `true` — emit `type="module"`. */
  module?: boolean;
  /** Defer attribute (ignored when `module` is true). */
  defer?: boolean;
  /** Async attribute. */
  async?: boolean;
  /** crossOrigin attribute. */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Subresource integrity hash. */
  integrity?: string;
  /** Where to place the script — defaults to `"body-end"`. */
  placement?: "head" | "body-end";
}

export interface ShellStylesheet {
  /** Stylesheet href. */
  href: string;
  crossOrigin?: "anonymous" | "use-credentials";
  integrity?: string;
}

export interface ShellOptions<P extends Record<string, unknown> = {}> {
  /** Component to hydrate on the client. */
  component: SinwanComponent<P>;
  /** Props passed to the component on the server (and embedded for client hydration). */
  props?: P;
  /** Document language attribute. Defaults to `"en"`. */
  lang?: string;
  /** Document title (rendered as `<title>`). */
  title?: string;
  /** Additional `<head>` HTML — trusted, inserted verbatim. */
  head?: string;
  /** Stylesheets to add to `<head>`. */
  stylesheets?: ShellStylesheet[];
  /** Charset meta. Defaults to `"utf-8"`. */
  charset?: string;
  /** Viewport meta content. Defaults to `"width=device-width, initial-scale=1"`. Pass `null` to omit. */
  viewport?: string | null;
  /** Container element id. Defaults to `"app"`. */
  containerId?: string;
  /** Container HTML tag. Defaults to `"div"`. */
  containerTag?: string;
  /** Extra attributes on the `<html>` element. */
  htmlAttrs?: Record<string, unknown>;
  /** Extra attributes on the `<body>` element. */
  bodyAttrs?: Record<string, unknown>;
  /** Client script(s) to load. */
  scripts?: (string | ShellScript)[];
  /**
   * Inline boot snippet behaviour:
   *   • `false` — no inline boot snippet emitted.
   *   • `true` (default) — emit a script that imports `module` and calls
   *     `hydrate(named, container, props)`.
   *   • `string` — emit the provided JS verbatim (must call `hydrate` itself).
   *   • Object — explicit configuration. `module` is the URL to dynamic-import,
   *     `componentExport` defaults to `"default"`, `hydrateExport` defaults to
   *     `"hydrate"` and is imported from the same module unless `hydrateModule`
   *     is given.
   */
  bootScript?:
    | boolean
    | string
    | {
        module: string;
        componentExport?: string;
        hydrateModule?: string;
        hydrateExport?: string;
      };
  /** When true (default), embed the props JSON for the client. */
  embedProps?: boolean;
  /** Custom JSON serialiser for props. Defaults to `JSON.stringify`. */
  serializeProps?: (props: P) => string;
}

const PROPS_ATTR = "data-sinwan-props";
const ROOT_ATTR = "data-sinwan-root";

// ─── Public API ────────────────────────────────────────────

/**
 * Render a complete HTML document with hydration markers and an auto-wired
 * client boot script. Returns the full HTML string ready to send.
 */
export async function renderShell<P extends Record<string, unknown> = {}>(
  options: ShellOptions<P>,
): Promise<string> {
  const cfg = normaliseOptions(options);
  const body = await renderToHydratableString(cfg.component, cfg.props);
  const { head, openBody, closeBody } = renderShellChrome(cfg, body);
  return `<!doctype html>${head}${openBody}${body}${closeBody}`;
}

/**
 * Stream a complete HTML document with hydration markers. Emits the document
 * head immediately, streams the hydratable component body, then closes the
 * shell with the boot script.
 */
export function streamShell<P extends Record<string, unknown> = {}>(
  options: ShellOptions<P>,
): ReadableStream<Uint8Array> {
  const cfg = normaliseOptions(options);
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const { head, openBody, closeBody } = renderShellChrome(cfg, "");
        controller.enqueue(encoder.encode(`<!doctype html>${head}${openBody}`));

        const inner = streamHydratablePage(
          cfg.component as SinwanComponent<any>,
          cfg.props as Record<string, unknown>,
        );
        const reader = inner.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }

        controller.enqueue(encoder.encode(closeBody));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ─── Internal helpers ──────────────────────────────────────

interface NormalisedShellOptions<P extends Record<string, unknown>> {
  component: SinwanComponent<P>;
  props: P;
  lang: string;
  title: string | undefined;
  head: string;
  stylesheets: ShellStylesheet[];
  charset: string;
  viewport: string | null;
  containerId: string;
  containerTag: string;
  htmlAttrs: Record<string, unknown>;
  bodyAttrs: Record<string, unknown>;
  scripts: ShellScript[];
  bootScript: ShellOptions<P>["bootScript"];
  embedProps: boolean;
  serializeProps: (props: P) => string;
}

function normaliseOptions<P extends Record<string, unknown>>(
  options: ShellOptions<P>,
): NormalisedShellOptions<P> {
  if (!options || typeof options.component !== "function") {
    throw new TypeError(
      "renderShell/streamShell: `component` must be a function component",
    );
  }

  return {
    component: options.component,
    props: (options.props ?? ({} as P)) as P,
    lang: options.lang ?? "en",
    title: options.title,
    head: options.head ?? "",
    stylesheets: options.stylesheets ?? [],
    charset: options.charset ?? "utf-8",
    viewport:
      options.viewport === null
        ? null
        : (options.viewport ?? "width=device-width, initial-scale=1"),
    containerId: options.containerId ?? "app",
    containerTag: options.containerTag ?? "div",
    htmlAttrs: options.htmlAttrs ?? {},
    bodyAttrs: options.bodyAttrs ?? {},
    scripts: (options.scripts ?? []).map(normaliseScript),
    bootScript: options.bootScript ?? true,
    embedProps: options.embedProps !== false,
    serializeProps: options.serializeProps ?? defaultSerializeProps,
  };
}

function normaliseScript(entry: string | ShellScript): ShellScript {
  return typeof entry === "string" ? { src: entry } : entry;
}

function defaultSerializeProps<P>(props: P): string {
  return JSON.stringify(props ?? {});
}

function renderShellChrome<P extends Record<string, unknown>>(
  cfg: NormalisedShellOptions<P>,
  _body: string,
): { head: string; openBody: string; closeBody: string } {
  const htmlAttrs = serialiseAttrs({ lang: cfg.lang, ...cfg.htmlAttrs });
  const bodyAttrs = serialiseAttrs(cfg.bodyAttrs);

  const headParts: string[] = [];
  if (cfg.charset) {
    headParts.push(`<meta charset="${escapeHtml(cfg.charset)}">`);
  }
  if (cfg.viewport) {
    headParts.push(
      `<meta name="viewport" content="${escapeHtml(cfg.viewport)}">`,
    );
  }
  if (cfg.title) {
    headParts.push(`<title>${escapeHtml(cfg.title)}</title>`);
  }
  for (const sheet of cfg.stylesheets) {
    headParts.push(renderStylesheet(sheet));
  }
  if (cfg.head) {
    headParts.push(cfg.head);
  }
  for (const script of cfg.scripts.filter((s) => s.placement === "head")) {
    headParts.push(renderScript(script));
  }

  const containerTag = cfg.containerTag;
  const containerOpen = `<${containerTag} id="${escapeHtml(
    cfg.containerId,
  )}" ${ROOT_ATTR}="">`;
  const containerClose = `</${containerTag}>`;

  const tailParts: string[] = [containerClose];

  if (cfg.embedProps) {
    let json: string;
    try {
      json = cfg.serializeProps(cfg.props);
    } catch (err) {
      throw new Error(
        "renderShell: failed to serialise props — provide `serializeProps` or omit non-JSON values: " +
          (err as Error).message,
      );
    }
    tailParts.push(
      `<script type="application/json" ${PROPS_ATTR}>${escapeJsonForScript(
        json,
      )}</script>`,
    );
  }

  for (const script of cfg.scripts.filter((s) => s.placement !== "head")) {
    tailParts.push(renderScript(script));
  }

  const boot = renderBootScript(cfg);
  if (boot) tailParts.push(boot);

  const head = `<html${htmlAttrs}><head>${headParts.join("")}</head>`;
  const openBody = `<body${bodyAttrs}>${containerOpen}`;
  const closeBody = `${tailParts.join("")}</body></html>`;

  return { head, openBody, closeBody };
}

function renderStylesheet(sheet: ShellStylesheet): string {
  let attrs = ` rel="stylesheet" href="${escapeHtml(sheet.href)}"`;
  if (sheet.crossOrigin) {
    attrs += ` crossorigin="${escapeHtml(sheet.crossOrigin)}"`;
  }
  if (sheet.integrity) {
    attrs += ` integrity="${escapeHtml(sheet.integrity)}"`;
  }
  return `<link${attrs}>`;
}

function renderScript(script: ShellScript): string {
  const isModule = script.module !== false;
  let attrs = ` src="${escapeHtml(script.src)}"`;
  if (isModule) {
    attrs += ` type="module"`;
  } else if (script.defer) {
    attrs += ` defer`;
  }
  if (script.async) attrs += ` async`;
  if (script.crossOrigin) {
    attrs += ` crossorigin="${escapeHtml(script.crossOrigin)}"`;
  }
  if (script.integrity) {
    attrs += ` integrity="${escapeHtml(script.integrity)}"`;
  }
  return `<script${attrs}></script>`;
}

function renderBootScript<P extends Record<string, unknown>>(
  cfg: NormalisedShellOptions<P>,
): string {
  const boot = cfg.bootScript;
  if (boot === false || boot == null) return "";

  if (typeof boot === "string") {
    return `<script type="module">${boot}</script>`;
  }

  // `true` ⇒ require an explicit module; nothing to do otherwise. We can't
  // guess where the user's component lives, so we only emit the auto boot
  // snippet when an explicit module URL is given.
  if (boot === true) return "";
  if (typeof boot !== "object") return "";

  const componentExport = boot.componentExport ?? "default";
  const hydrateExport = boot.hydrateExport ?? "hydrate";
  const hydrateModule = boot.hydrateModule ?? boot.module;

  const containerSel = `#${cssEscape(cfg.containerId)}`;
  const sameModule = hydrateModule === boot.module;

  const importLine = sameModule
    ? `const m=await import(${jsString(boot.module)});` +
      `const C=m[${jsString(componentExport)}];` +
      `const H=m[${jsString(hydrateExport)}];`
    : `const [m,h]=await Promise.all([` +
      `import(${jsString(boot.module)}),` +
      `import(${jsString(hydrateModule)})]);` +
      `const C=m[${jsString(componentExport)}];` +
      `const H=h[${jsString(hydrateExport)}];`;

  const propsRead = cfg.embedProps
    ? `const p=JSON.parse(document.querySelector(${jsString(
        `script[${PROPS_ATTR}]`,
      )}).textContent||"{}");`
    : `const p={};`;

  return (
    `<script type="module">` +
    `(async()=>{` +
    importLine +
    propsRead +
    `const el=document.querySelector(${jsString(containerSel)});` +
    `if(el&&C&&typeof H==="function")H(C,el,p);` +
    `})();` +
    `</script>`
  );
}

function serialiseAttrs(attrs: Record<string, unknown>): string {
  let out = "";
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    out += renderServerAttribute(key, value);
  }
  return out;
}

/**
 * Escape `</script` and `<!--` sequences inside JSON to keep it safe inside
 * `<script type="application/json">`.
 */
function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function cssEscape(id: string): string {
  // CSS.escape is not available everywhere; do the minimal subset we need
  // for an id that came from the developer (assume valid identifier-ish).
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

// Keep `_body` reachable so future tree-shakers don't drop the parameter.
export type { SinwanNode };
