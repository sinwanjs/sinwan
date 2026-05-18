import { streamHydratableNode } from "../../server/stream.ts";
import type { ReactNode } from "./_types/core.ts";
import type { SinwanNode } from "../../types.ts";
import type {
  RenderToReadableStreamOptions,
  BootstrapScript,
} from "./_types/server.ts";
import { setRequestAbortSignal } from "./cache-signal.ts";

export interface ReactReadableStream extends ReadableStream<Uint8Array> {
  allReady: Promise<void>;
}

/**
 * React-compatible `renderToReadableStream` — `[SERVER]` (Bun-first).
 *
 * Returns a `Promise<ReadableStream<Uint8Array>>` that resolves when the
 * shell is ready (first chunk successfully produced) and rejects if the
 * shell fails before emitting any bytes. The returned stream carries an
 * `allReady` property that resolves when all rendering is complete.
 *
 * SSR: server-only. Bun-native (`ReadableStream`); Node 18+ compatible.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { renderToReadableStream } from "sinwan/react-server";
 *
 * const stream = await renderToReadableStream(<App />, {
 *   bootstrapScriptContent: "console.log('hydrating');",
 *   bootstrapModules: ["/client.js"],
 * });
 * return new Response(stream, { headers: { "content-type": "text/html" } });
 * ```
 */
export async function renderToReadableStream(
  node: ReactNode,
  options: RenderToReadableStreamOptions = {},
): Promise<ReactReadableStream> {
  setRequestAbortSignal(options.signal ?? null);

  const inner = streamHydratableNode(node as SinwanNode, {
    identifierPrefix: options.identifierPrefix,
  });
  const reader = inner.getReader();

  // Set up abort handling before the first read so cancellations are honoured.
  let abortHandler: (() => void) | undefined;
  if (options.signal) {
    abortHandler = () => {
      try {
        reader.cancel(options.signal!.reason);
      } catch {
        /* ignore */
      }
    };
    options.signal.addEventListener("abort", abortHandler);
  }

  // Eagerly read the first chunk to verify shell health.
  // React's Promise resolves when the shell is ready and rejects on shell error.
  let firstResult;
  try {
    firstResult = await reader.read();
  } catch (err) {
    options.onError?.(err);
    if (abortHandler) {
      options.signal!.removeEventListener("abort", abortHandler);
    }
    setRequestAbortSignal(null);
    throw err;
  }

  // Shell is ready — construct the outer stream.
  let resolveAllReady!: () => void;
  const allReady = new Promise<void>((r) => (resolveAllReady = r));

  const encoder = new TextEncoder();
  const bootstrap = buildBootstrap(options, encoder);
  let firstChunk = firstResult.done ? null : firstResult.value;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (firstChunk) {
          controller.enqueue(firstChunk);
          firstChunk = null;
        }
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        if (bootstrap.length > 0) controller.enqueue(bootstrap);
        controller.close();
        resolveAllReady();
      } catch (err) {
        options.onError?.(err);
        controller.error(err);
      } finally {
        if (abortHandler) {
          options.signal!.removeEventListener("abort", abortHandler);
        }
        setRequestAbortSignal(null);
      }
    },
  }) as ReactReadableStream;

  stream.allReady = allReady;
  return stream;
}

function buildBootstrap(
  options: RenderToReadableStreamOptions,
  encoder: TextEncoder,
): Uint8Array {
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
  return parts.length === 0 ? new Uint8Array() : encoder.encode(parts.join(""));
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
