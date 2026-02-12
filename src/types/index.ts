import { Application } from "../core/application";
import { CookieOptions } from "../plugins/cookie";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "USE";

export type NextFunction = (err?: any) => void | Promise<void>;

export interface AcceptsResult {
  type: string;
  subtype: string;
  params: Record<string, string>;
  quality: number;
}

export interface Request {
  method: string;
  url: string;
  path: string;
  baseUrl: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  headers: Headers;
  body: any;
  app: Application;
  cookies: Record<string, any>;
  signedCookies: Record<string, any>;
  secret?: string | string[];
  session?: import("../modules/session").Session;
  sessionID?: string;
  ip: string;
  protocol: "http" | "https";
  secure: boolean;
  xhr: boolean;
  hostname: string;
  subdomains: string[];
  fresh: boolean;
  stale: boolean;
  get(name: string): string | undefined;
  accepts(...types: string[]): string | false;
  acceptsEncodings(...encodings: string[]): string | false;
  acceptsLanguages(...languages: string[]): string | false;
  is(...types: string[]): string | false;
  json(): Promise<any>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  formData(): Promise<FormData>;
  [key: string]: any;
}

export interface SendFileOptions {
  root?: string;
  maxAge?: number | string;
  cacheControl?: boolean;
  lastModified?: boolean;
  headers?: Record<string, string>;
  dotfiles?: "allow" | "deny" | "ignore";
}

export interface Response {
  req: Request;
  status(code: number): this;
  json(data: any): Promise<this>;
  send(data: string | Buffer | Uint8Array): Promise<this>;
  set(name: string, value: string): this;
  get(name: string): string | null;
  header(name: string, value: string): this;
  append(name: string, value: string): this;
  removeHeader(name: string): this;
  type(contentType: string): this;
  html(data: string): Promise<this>;
  cookie(name: string, value: any, options?: CookieOptions): this;
  clearCookie(name: string, options?: CookieOptions): this;
  redirect(url: string, status?: number): Promise<this>;
  attachment(filename?: string): this;
  download(
    filePath: string,
    filename?: string,
    options?: SendFileOptions,
  ): Promise<void>;
  sendFile(filePath: string, options?: SendFileOptions): Promise<void>;
  vary(field: string): this;
  location(url: string): this;
  links(links: Record<string, string>): this;
  sendStatus(code: number): Promise<this>;
  end(data?: string | Buffer | Uint8Array): Promise<this>;
  render(
    view: string,
    options?: any,
    callback?: (err: Error | null, html?: string) => void,
  ): Promise<void>;
  respond(response: globalThis.Response): void;
  stream(readable: ReadableStream): Promise<void>;
  defer(fn: () => void | Promise<void>): this;

  // ── Server-Sent Events (SSE) ──────────────────────────────────────────
  /**
   * Initialise the response as an SSE stream.
   * Sets `Content-Type: text/event-stream`, disables caching and opens a
   * long-lived writable stream.
   *
   * @param options - Optional SSE configuration
   * @returns A controller to write events & close the stream.
   */
  sse(options?: SseOptions): SseController;

  /**
   * Low-level write into an already-opened streaming response.
   * Useful for chunked transfer / SSE when you manage the stream yourself.
   */
  write(chunk: string | Uint8Array): void;

  // ── Event Emitter ─────────────────────────────────────────────────────
  /**
   * Register a listener for a response-level event.
   *
   * Supported events:
   * - `"close"` – client disconnected / stream closed
   * - `"error"` – an error occurred on the stream
   * - `"finish"` – response fully sent
   */
  on(event: string, listener: (...args: any[]) => void): this;

  /** Remove a previously registered listener. */
  off(event: string, listener: (...args: any[]) => void): this;

  /** Emit an event to all registered listeners. */
  emit(event: string, ...args: any[]): boolean;

  statusCode: number;
  sent: boolean;
  headersSent: boolean;
  finished: boolean;
  [key: string]: any;
}

/**
 * Options for `res.sse()`
 */
export interface SseOptions {
  /** Custom headers merged into the SSE response. */
  headers?: Record<string, string>;
  /** Interval (ms) between keep-alive comments. 0 = disabled. Default 30 000. */
  keepAlive?: number;
  /** Retry delay (ms) sent to the client in the `retry:` field. */
  retry?: number;
}

/**
 * Controller returned by `res.sse()`.
 * Use it to push events and close the stream.
 */
export interface SseController {
  /**
   * Send an SSE event.
   * @param data  - Payload (objects are JSON-stringified automatically).
   * @param event - Optional event name (`event:` field).
   * @param id    - Optional event id (`id:` field).
   */
  send(data: any, event?: string, id?: string): void;

  /** Send a comment line (`:` prefix). Useful as keep-alive. */
  comment(text: string): void;

  /** Close the SSE stream gracefully. */
  close(): void;

  /** `true` after `close()` has been called or the client disconnected. */
  readonly closed: boolean;
}

export interface Context {
  req: Request;
  res: Response;
  next: NextFunction;
}

export type Middleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;
export type ErrorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => void | Promise<void>;

export interface Plugin {
  name: string;
  version: string;
  install: (app: Application) => void;
}

export type LifecycleHook =
  | "onStart"
  | "beforeStart"
  | "afterStart"
  | "onStop"
  | "beforeStop"
  | "afterStop"
  | "beforeRequest"
  | "afterRequest"
  | "beforeResponse"
  | "afterResponse"
  | "onError"
  | "onSuccess";
