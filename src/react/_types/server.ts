/**
 * Server (SSR) result shapes — React compatible.
 */

export interface RenderToReadableStreamOptions {
  identifierPrefix?: string;
  namespaceURI?: string;
  nonce?: string;
  bootstrapScriptContent?: string;
  bootstrapScripts?: ReadonlyArray<string | BootstrapScript>;
  bootstrapModules?: ReadonlyArray<string | BootstrapScript>;
  progressiveChunkSize?: number;
  signal?: AbortSignal;
  onError?: (error: unknown) => string | void | undefined;
  onPostpone?: (reason: string) => void;
  formState?: unknown;
}

export interface BootstrapScript {
  src: string;
  integrity?: string;
  crossOrigin?: string;
}

export interface RenderToPipeableStreamOptions extends Omit<
  RenderToReadableStreamOptions,
  "signal"
> {
  onShellReady?: () => void;
  onShellError?: (error: unknown) => void;
  onAllReady?: () => void;
}

export interface PipeableStream {
  pipe<W extends NodeJS_WritableStream>(destination: W): W;
  abort(reason?: unknown): void;
}

/**
 * Minimal `node:stream`-shaped writable surface declared locally so we don't
 * import `node:stream` types unconditionally (Bun ships a compatible shim).
 */
export interface NodeJS_WritableStream {
  write(chunk: string | Uint8Array): boolean;
  end(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface ResumeOptions extends RenderToReadableStreamOptions {}
export interface ResumeToPipeableStreamOptions extends RenderToPipeableStreamOptions {}
