import {
  renderToReadableStream,
  type ReactReadableStream,
} from "./render-to-readable-stream.ts";
import { renderToPipeableStream } from "./render-to-pipeable-stream.ts";
import type { ReactNode } from "./_types/core.ts";
import type {
  ResumeOptions,
  ResumeToPipeableStreamOptions,
  PipeableStream,
} from "./_types/server.ts";

/**
 * React-compatible `resume` & `resumeToPipeableStream` — `[SERVER]`.
 *
 * React resume APIs continue an SSR render that was previously
 * postponed (typically during prerender — see `sinwan/react-static`). Sinwan's
 * renderer is single-pass and does not currently produce a `postponed`
 * state, so these adapters re-render `node` from scratch and emit the
 * resulting stream. The `postponedState` argument is accepted for API
 * compatibility but ignored.
 *
 * SSR: server-only.
 * Reactivity: pass-through.
 *
 * @example
 * ```ts
 * import { resume } from "sinwan/react-server";
 *
 * const stream = await resume(<App />, postponed, { signal });
 * ```
 */
export function resume(
  node: ReactNode,
  _postponedState: unknown,
  options: ResumeOptions = {},
): Promise<ReactReadableStream> {
  return renderToReadableStream(node, options);
}

/**
 * React-compatible `resumeToPipeableStream` — `[SERVER]`.
 *
 * Same as `resume`, but returns a Node.js `PipeableStream` instead of a
 * Web `ReadableStream`. `postponedState` is accepted for API compatibility
 * and ignored.
 *
 * @example
 * ```ts
 * import { resumeToPipeableStream } from "sinwan/react-server";
 *
 * const { pipe } = resumeToPipeableStream(<App />, postponed, {
 *   onShellReady() { pipe(res); },
 * });
 * ```
 */
export function resumeToPipeableStream(
  node: ReactNode,
  _postponedState: unknown,
  options: ResumeToPipeableStreamOptions = {},
): PipeableStream {
  return renderToPipeableStream(node, options);
}
