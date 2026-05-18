import { streamHydratableNode } from "../../server/stream.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../../types.ts";
import type {
  PipeableStream,
  NodeJS_WritableStream,
  RenderToPipeableStreamOptions,
  BootstrapScript,
} from "./_types/server.ts";
import { setRequestAbortSignal } from "./cache-signal.ts";

/**
 * React-compatible `renderToPipeableStream` — `[SERVER]`.
 *
 * Returns a `PipeableStream`-shaped object whose `.pipe(writable)` method
 * pumps Sinwan's hydratable stream into a Node.js `Writable` (also works
 * with Bun's `node:stream` shim). The shell-ready callback fires on the
 * first chunk; `onAllReady` fires when the inner stream closes.
 *
 * SSR: server-only.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { renderToPipeableStream } from "sinwan/react-server";
 * import { createServer } from "node:http";
 *
 * createServer((_, res) => {
 *   res.setHeader("content-type", "text/html");
 *   const { pipe } = renderToPipeableStream(<App />, {
 *     onShellReady() { pipe(res); },
 *   });
 * }).listen(3000);
 * ```
 */
export function renderToPipeableStream(
  node: ReactNode,
  options: RenderToPipeableStreamOptions = {},
): PipeableStream {
  setRequestAbortSignal(null);
  let aborted = false;
  let writable: NodeJS_WritableStream | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let bytesEmitted = false;
  let shellReadyFired = false;

  const inner = streamHydratableNode(node as SinwanNode, {
    identifierPrefix: options.identifierPrefix,
  });
  let started = false;

  function buildBootstrapScripts(): string {
    const parts: string[] = [];
    if (options.bootstrapScriptContent !== undefined) {
      const nonce = options.nonce ? ` nonce="${options.nonce}"` : "";
      parts.push(`<script${nonce}>${options.bootstrapScriptContent}</script>`);
    }
    for (const s of options.bootstrapScripts ?? []) {
      parts.push(scriptTag(s, options.nonce, false));
    }
    for (const s of options.bootstrapModules ?? []) {
      parts.push(scriptTag(s, options.nonce, true));
    }
    return parts.join("");
  }

  const pump = async () => {
    if (started) return;
    started = true;
    reader = inner.getReader();
    const encoder = new TextEncoder();
    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!shellReadyFired) {
          shellReadyFired = true;
          options.onShellReady?.();
        }
        bytesEmitted = true;
        writable?.write(value);
      }
      if (aborted) {
        // Abort requested before stream finished — don't write bootstrap or end
        return;
      }
      // Bootstrap scripts (after main content)
      const bootstrap = buildBootstrapScripts();
      if (bootstrap.length > 0) {
        bytesEmitted = true;
        writable?.write(encoder.encode(bootstrap));
      }

      writable?.end();
      options.onAllReady?.();
    } catch (err) {
      if (!bytesEmitted) {
        options.onShellError?.(err);
      }
      options.onError?.(err);
    } finally {
      setRequestAbortSignal(null);
    }
  };

  return {
    pipe<W extends NodeJS_WritableStream>(destination: W): W {
      writable = destination;
      void pump();
      return destination;
    },
    abort(reason?: unknown) {
      aborted = true;
      try {
        reader?.cancel(reason);
      } catch {
        /* ignore */
      }
      try {
        writable?.end();
      } catch {
        /* ignore */
      }
    },
  };
}

function scriptTag(
  s: string | BootstrapScript,
  nonce: string | undefined,
  module: boolean,
): string {
  const src = typeof s === "string" ? s : s.src;
  const integrity =
    typeof s === "object" && s.integrity ? ` integrity="${s.integrity}"` : "";
  const crossOrigin =
    typeof s === "object" && s.crossOrigin
      ? ` crossorigin="${s.crossOrigin}"`
      : "";
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  const typeAttr = module ? ` type="module"` : "";
  const asyncAttr = module ? "" : ` async=""`;
  return `<script src="${src}"${typeAttr}${nonceAttr}${integrity}${crossOrigin}${asyncAttr}></script>`;
}
