/**
 * Static (build-time prerender) result shapes — React compatible.
 */

export type PostponedState = unknown;

export interface PrerenderResult {
  prelude: ReadableStream<Uint8Array>;
  postponed: PostponedState | null;
}

export interface PrerenderToNodeStreamResult {
  prelude: import("./server.ts").NodeJS_WritableStream extends never
    ? never
    : NodeJS.ReadableStream;
  postponed: PostponedState | null;
}

export interface PrerenderOptions {
  identifierPrefix?: string;
  namespaceURI?: string;
  bootstrapScriptContent?: string;
  bootstrapScripts?: ReadonlyArray<string | BootstrapScriptDescriptor>;
  bootstrapModules?: ReadonlyArray<string | BootstrapScriptDescriptor>;
  progressiveChunkSize?: number;
  signal?: AbortSignal;
  onError?: (error: unknown) => string | void | undefined;
  onPostpone?: (reason: string) => void;
}

export interface BootstrapScriptDescriptor {
  src: string;
  integrity?: string;
  crossOrigin?: string;
}
