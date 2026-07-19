/**
 * React-compatible resource-hint APIs — `[CLIENT]`.
 *
 *   preconnect, prefetchDNS, preload, preloadModule, preinit, preinitModule
 *
 * Each call appends an idempotent `<link>` (or `<script type="module">`)
 * tag to `document.head`. Duplicate calls with identical args are no-ops.
 *
 * SSR: guarded — currently no-op on the server. Phase 4's streaming SSR
 * will collect hints and emit them in the document head before the shell.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { preload, preconnect } from "sinwan/react-client";
 *
 * preconnect("https://cdn.example.com");
 * preload("/fonts/inter.woff2", { as: "font", crossOrigin: "anonymous" });
 * ```
 */

import { isServer } from "./_internal/is-server.ts";

const seen = new Set<string>();

function appendLink(
  rel: string,
  href: string,
  attrs: Record<string, string | undefined>,
): void {
  if (isServer()) return;
  const key = rel + "|" + href + "|" + JSON.stringify(attrs);
  if (seen.has(key)) return;
  seen.add(key);

  const link = document.createElement("link");
  link.rel = rel;
  link.href = href;
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) link.setAttribute(k, v);
  }
  document.head.appendChild(link);
}

/**
 * Hints the browser to open an early connection to the given origin.
 * Appends a `<link rel="preconnect">` tag to `document.head`.
 *
 * @param href — URL of the origin to preconnect to.
 * @param options — `crossOrigin` for CORS requests.
 */
export function preconnect(
  href: string,
  options?: { crossOrigin?: string },
): void {
  appendLink("preconnect", href, { crossorigin: options?.crossOrigin });
}

/**
 * Hints the browser to perform an early DNS lookup for the given origin.
 * Appends a `<link rel="dns-prefetch">` tag to `document.head`.
 *
 * @param href — URL whose DNS should be resolved early.
 */
export function prefetchDNS(href: string): void {
  appendLink("dns-prefetch", href, {});
}

/**
 * Options for `preload` — mirrors React's `PreloadOptions`.
 */
export interface PreloadOptions {
  as:
    | "audio"
    | "document"
    | "embed"
    | "fetch"
    | "font"
    | "image"
    | "object"
    | "script"
    | "style"
    | "track"
    | "video"
    | "worker";
  crossOrigin?: string;
  referrerPolicy?: string;
  integrity?: string;
  type?: string;
  nonce?: string;
  fetchPriority?: "high" | "low" | "auto";
  imageSrcSet?: string;
  imageSizes?: string;
}

/**
 * Hints the browser to preload a resource (font, image, script, etc.).
 * Appends a `<link rel="preload">` tag to `document.head`.
 * Image preloads include `imageSrcSet` and `imageSizes` in dedup logic.
 *
 * @param href — URL of the resource to preload.
 * @param options — `as` type and optional attributes (`crossOrigin`, `integrity`, etc.).
 */
export function preload(href: string, options: PreloadOptions): void {
  if (isServer()) return;
  const attrs = {
    as: options.as,
    crossorigin: options.crossOrigin,
    referrerpolicy: options.referrerPolicy,
    integrity: options.integrity,
    type: options.type,
    nonce: options.nonce,
    fetchpriority: options.fetchPriority,
    imagesrcset: options.imageSrcSet,
    imagesizes: options.imageSizes,
  };
  // React: for images, dedup considers href + imageSrcSet + imageSizes
  const key =
    options.as === "image"
      ? "preload|" +
        href +
        "|" +
        options.imageSrcSet +
        "|" +
        options.imageSizes +
        "|" +
        JSON.stringify(attrs)
      : "preload|" + href + "|" + JSON.stringify(attrs);
  if (seen.has(key)) return;
  seen.add(key);

  const link = document.createElement("link");
  link.rel = "preload";
  link.href = href;
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) link.setAttribute(k, v);
  }
  document.head.appendChild(link);
}

/**
 * Options for `preloadModule`.
 */
export interface PreloadModuleOptions {
  as?: "script";
  crossOrigin?: string;
  integrity?: string;
  nonce?: string;
}

/**
 * Hints the browser to preload an ES module.
 * Appends a `<link rel="modulepreload">` tag to `document.head`.
 *
 * @param href — URL of the module to preload.
 * @param options — Optional `crossOrigin`, `integrity`, and `nonce`.
 */
export function preloadModule(
  href: string,
  options?: PreloadModuleOptions,
): void {
  appendLink("modulepreload", href, {
    crossorigin: options?.crossOrigin,
    integrity: options?.integrity,
    nonce: options?.nonce,
  });
}

/**
 * Options for `preinit` — mirrors React's `PreinitOptions`.
 */
export interface PreinitOptions {
  as: "style" | "script";
  precedence?: string;
  crossOrigin?: string;
  integrity?: string;
  nonce?: string;
  fetchPriority?: "high" | "low" | "auto";
}

/**
 * Eagerly fetches and executes a stylesheet or script.
 * Styles append a `<link rel="stylesheet">`; scripts append an async `<script>`.
 *
 * @param href — URL of the resource.
 * @param options — `as: "style" | "script"` plus optional attributes.
 */
export function preinit(href: string, options: PreinitOptions): void {
  if (isServer()) return;
  const key = "preinit|" + href + "|" + JSON.stringify(options);
  if (seen.has(key)) return;
  seen.add(key);

  if (options.as === "style") {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    if (options.crossOrigin) link.crossOrigin = options.crossOrigin;
    if (options.integrity) link.integrity = options.integrity;
    if (options.precedence)
      link.setAttribute("data-precedence", options.precedence);
    document.head.appendChild(link);
  } else {
    const script = document.createElement("script");
    script.src = href;
    script.async = true;
    if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
    if (options.integrity) script.integrity = options.integrity;
    if (options.nonce) script.nonce = options.nonce;
    if (options.fetchPriority)
      script.setAttribute("fetchpriority", options.fetchPriority);
    document.head.appendChild(script);
  }
}

/**
 * Options for `preinitModule`.
 */
export interface PreinitModuleOptions {
  crossOrigin?: string;
  integrity?: string;
  nonce?: string;
}

/**
 * Eagerly fetches and executes an ES module.
 * Appends a `<script type="module">` tag to `document.head`.
 *
 * @param href — URL of the module to execute.
 * @param options — Optional `crossOrigin`, `integrity`, and `nonce`.
 */
export function preinitModule(
  href: string,
  options?: PreinitModuleOptions,
): void {
  if (isServer()) return;
  const key = "preinitModule|" + href + "|" + JSON.stringify(options ?? {});
  if (seen.has(key)) return;
  seen.add(key);

  const script = document.createElement("script");
  script.type = "module";
  script.src = href;
  if (options?.crossOrigin) script.crossOrigin = options.crossOrigin;
  if (options?.integrity) script.integrity = options.integrity;
  if (options?.nonce) script.nonce = options.nonce;
  document.head.appendChild(script);
}

/** Internal — clears the dedup cache (test-only). */
export function _resetResourceHints(): void {
  seen.clear();
}
