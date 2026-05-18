import { renderNodeToHydratableString } from "../../server/hydration-markers.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../../types.ts";
import type {
  PrerenderOptions,
  PrerenderResult,
  PrerenderToNodeStreamResult,
  BootstrapScriptDescriptor,
} from "./_types/static.ts";
import { setRequestAbortSignal } from "./cache-signal.ts";

/**
 * React-compatible `prerender` & `prerenderToNodeStream` — `[STATIC]`.
 *
 * Build-time prerender that produces a fully-resolved HTML prelude. React's
 * `prerender` waits for all data (including Suspense boundaries) to finish
 * before resolving. Sinwan's renderer is single-pass and always finishes, so
 * `postponed` is always `null`.
 *
 * SSR: build-time / server-only.
 * Reactivity: pass-through to Sinwan's `renderNodeToHydratableString`.
 *
 * @example
 * ```ts
 * import { prerender } from "sinwan/react-static";
 *
 * const { prelude } = await prerender(<Page />, {
 *   bootstrapModules: ["/client.js"],
 * });
 * const reader = prelude.getReader();
 * let html = "";
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   html += new TextDecoder().decode(value);
 * }
 * ```
 */
export async function prerender(
  node: ReactNode,
  options: PrerenderOptions = {},
): Promise<PrerenderResult> {
  setRequestAbortSignal(options.signal ?? null);

  if (options.signal?.aborted) {
    setRequestAbortSignal(null);
    throw options.signal.reason;
  }

  try {
    const html = await renderNodeToHydratableString(node as SinwanNode, {
      identifierPrefix: options.identifierPrefix,
    });

    if (options.signal?.aborted) {
      throw options.signal.reason;
    }

    const bootstrap = buildBootstrapString(options);
    const fullHtml = html + bootstrap;

    const encoder = new TextEncoder();
    const prelude = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(fullHtml));
        controller.close();
      },
    });

    return { prelude, postponed: null };
  } catch (err) {
    options.onError?.(err);
    throw err;
  } finally {
    setRequestAbortSignal(null);
  }
}

/**
 * React-compatible `prerenderToNodeStream` — `[STATIC]`.
 *
 * Wraps `prerender` and converts the resulting `ReadableStream` into a
 * Node.js `ReadableStream` via `node:stream`. Useful in server environments
 * (e.g., Express, Fastify, custom Node HTTP servers) where Node streams are
 * expected instead of Web Streams.
 *
 * SSR: server-only (requires Node.js stream module).
 *
 * @example
 * ```ts
 * import { prerenderToNodeStream } from "sinwan/react-static";
 *
 * const { prelude } = await prerenderToNodeStream(<Page />, {
 *   bootstrapModules: ["/client.js"],
 * });
 * res.writeHead(200, { "Content-Type": "text/html" });
 * prelude.pipe(res);
 * ```
 */
export async function prerenderToNodeStream(
  node: ReactNode,
  options: PrerenderOptions = {},
): Promise<PrerenderToNodeStreamResult> {
  const { prelude } = await prerender(node, options);
  // Lazy import so this file stays bundler-friendly in non-Node environments.
  const { Readable } = await import("node:stream");
  const nodeStream = (
    Readable as unknown as {
      fromWeb: (s: ReadableStream<Uint8Array>) => unknown;
    }
  ).fromWeb(prelude) as unknown as NodeJS.ReadableStream;
  return {
    prelude: nodeStream as PrerenderToNodeStreamResult["prelude"],
    postponed: null,
  };
}

// ─── helpers ───────────────────────────────────────────────

function buildBootstrapString(options: PrerenderOptions): string {
  const parts: string[] = [];
  if (options.bootstrapScriptContent) {
    parts.push(`<script>${options.bootstrapScriptContent}</script>`);
  }
  for (const s of options.bootstrapScripts ?? []) {
    parts.push(scriptTag(s, false));
  }
  for (const s of options.bootstrapModules ?? []) {
    parts.push(scriptTag(s, true));
  }
  return parts.join("");
}

function scriptTag(
  s: string | BootstrapScriptDescriptor,
  module: boolean,
): string {
  const src = typeof s === "string" ? s : s.src;
  const integrity =
    typeof s === "object" && s.integrity ? ` integrity="${s.integrity}"` : "";
  const crossOrigin =
    typeof s === "object" && s.crossOrigin
      ? ` crossorigin="${s.crossOrigin}"`
      : "";
  const typeAttr = module ? ` type="module"` : "";
  const asyncAttr = module ? "" : ` async=""`;
  return `<script src="${src}"${typeAttr}${asyncAttr}${integrity}${crossOrigin}></script>`;
}
