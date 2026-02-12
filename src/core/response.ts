import type { Application } from "../core/application";
import type { Request, Response, SseController, SseOptions } from "../types";
import * as cookie from "../utils/cookie";
import * as signature from "../utils/cookie-signature";
import { lookup } from "../utils/mime";

/** Reuse a single TextEncoder instance across all responses */
const TEXT_ENCODER = new TextEncoder();

/** Static content-type shorthand map */
const CONTENT_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  html: "text/html; charset=utf-8",
  text: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  bin: "application/octet-stream",
  form: "application/x-www-form-urlencoded",
});

/** Static status messages */
const STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  413: "Payload Too Large",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
});

/**
 * Cookie options for response
 */
interface ResponseCookieOptions {
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "strict" | "lax" | "none" | boolean;
  path?: string;
  domain?: string;
  signed?: boolean;
  encode?: (val: string) => string;
}

/**
 * Response implementation with lifecycle management
 */
export class ResponseImpl implements Response {
  private _status: number = 200;
  private _headers: Headers = new Headers();
  private _sent: boolean = false;
  private _headersSent: boolean = false;
  private _resolve: (res: globalThis.Response) => void;
  private _app: Application;
  private _deferredFunctions: (() => void | Promise<void>)[] = [];

  /** Event listeners (close, error, finish) */
  private _listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  /** Active SSE stream controller (if any) */
  private _sseStreamController: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  private _sseKeepAliveTimer: ReturnType<typeof setInterval> | null = null;

  public req!: Request;

  [key: string]: any;

  constructor(
    resolve: (res: globalThis.Response) => void,
    app: Application,
    req: Request,
  ) {
    this._resolve = resolve;
    this._app = app;
    this.req = req;

    // Set default headers
    this._setDefaultHeaders();
  }

  // ============================================================================
  // Status Methods
  // ============================================================================

  /**
   * Set status code
   */
  status(code: number): this {
    if (this._headersSent) {
      throw new Error("Cannot set status after headers sent");
    }

    if (!Number.isInteger(code) || code < 100 || code > 599) {
      throw new Error(`Invalid status code: ${code}`);
    }

    this._status = code;
    return this;
  }

  get statusCode(): number {
    return this._status;
  }

  // ============================================================================
  // Header Methods
  // ============================================================================

  /**
   * Set header
   */
  set(name: string, value: string): this {
    if (this._headersSent) {
      throw new Error("Cannot set headers after they are sent");
    }

    this._headers.set(name, value);
    return this;
  }

  /**
   * Alias for set
   */
  header(name: string, value: string): this {
    return this.set(name, value);
  }

  /**
   * Get header value
   */
  get(name: string): string | null {
    return this._headers.get(name);
  }

  /**
   * Append header value
   */
  append(name: string, value: string): this {
    if (this._headersSent) {
      throw new Error("Cannot append headers after they are sent");
    }

    this._headers.append(name, value);
    return this;
  }

  /**
   * Remove header
   */
  removeHeader(name: string): this {
    if (this._headersSent) {
      throw new Error("Cannot remove headers after they are sent");
    }

    this._headers.delete(name);
    return this;
  }

  /**
   * Set Content-Type header with shorthand support
   */
  type(contentType: string): this {
    const type = CONTENT_TYPE_MAP[contentType] || contentType;
    return this.set("Content-Type", type);
  }

  /**
   * Set Vary header
   */
  vary(field: string): this {
    const current = this._headers.get("Vary");

    if (current) {
      const fields = current.split(",").map((f) => f.trim().toLowerCase());
      if (!fields.includes(field.toLowerCase())) {
        this.set("Vary", `${current}, ${field}`);
      }
    } else {
      this.set("Vary", field);
    }

    return this;
  }

  /**
   * Set Location header
   */
  location(url: string): this {
    return this.set("Location", url);
  }

  /**
   * Set Link header
   */
  links(links: Record<string, string>): this {
    const linkHeader = Object.entries(links)
      .map(([rel, url]) => `<${url}>; rel="${rel}"`)
      .join(", ");

    const current = this._headers.get("Link");
    if (current) {
      this.set("Link", `${current}, ${linkHeader}`);
    } else {
      this.set("Link", linkHeader);
    }

    return this;
  }

  // ============================================================================
  // Cookie Methods
  // ============================================================================

  /**
   * Set cookie
   */
  cookie(name: string, value: any, options: ResponseCookieOptions = {}): this {
    if (this._headersSent) {
      throw new Error("Cannot set cookie after headers sent");
    }

    let val =
      typeof value === "object" ? "j:" + JSON.stringify(value) : String(value);

    // Sign cookie if requested
    if (options.signed) {
      const secret = this.req.secret || this._app?.get("cookie secret");
      if (!secret) {
        throw new Error("Cookie secret required for signed cookies");
      }

      const secretKey = Array.isArray(secret) ? secret[0] : secret;
      val = "s:" + signature.sign(val, secretKey);
    }

    // Prepare cookie options
    const cookieOpts: cookie.SerializeOptions = {
      ...options,
      maxAge: options.maxAge,
      expires: options.expires,
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? false,
      path: options.path ?? "/",
      domain: options.domain,
      encode: options.encode,
    };

    // Handle sameSite
    if (options.sameSite !== undefined) {
      if (typeof options.sameSite === "boolean") {
        cookieOpts.sameSite = options.sameSite ? "strict" : undefined;
      } else {
        cookieOpts.sameSite = options.sameSite;
      }
    }

    const cookieStr = cookie.serialize(name, val, cookieOpts);
    this._headers.append("Set-Cookie", cookieStr);

    return this;
  }

  /**
   * Clear cookie
   */
  clearCookie(name: string, options: ResponseCookieOptions = {}): this {
    return this.cookie(name, "", {
      ...options,
      expires: new Date(1),
      maxAge: 0,
    });
  }

  // ============================================================================
  // Response Methods
  // ============================================================================

  /**
   * Send JSON response
   */
  async json(data: any): Promise<this> {
    this.type("json");

    const spaces = this._app?.get("json spaces") || 0;
    const json = JSON.stringify(data, null, spaces);

    return await this.send(json);
  }

  /**
   * Send HTML response
   */
  async html(data: string): Promise<this> {
    this.type("html");
    return await this.send(data);
  }

  /**
   * Send response body
   */
  async send(data: string | Buffer | Uint8Array): Promise<this> {
    if (this._sent) {
      return this;
    }

    try {
      // Execute deferred functions before response
      await this._executeDeferredFunctions();

      // Run beforeResponse hooks
      if (this._app) {
        await this._app.runBeforeResponseHooks(this.req, this);
      }

      // Set Content-Length if not set
      if (!this._headers.has("Content-Length")) {
        const length =
          typeof data === "string"
            ? TEXT_ENCODER.encode(data).length
            : data.length;
        this._headers.set("Content-Length", String(length));
      }

      // Mark as sent
      this._sent = true;
      this._headersSent = true;

      // Resolve with response
      this._resolve(
        new globalThis.Response(data, {
          status: this._status,
          headers: this._headers,
        }),
      );

      // Run afterResponse hooks
      if (this._app) {
        await this._app.runAfterResponseHooks(this.req, this);
      }

      // Emit finish event
      this.emit("finish");

      return this;
    } catch (error) {
      console.error("Error sending response:", error);
      throw error;
    }
  }

  /**
   * Send status with message
   */
  async sendStatus(code: number): Promise<this> {
    this._status = code;
    const message = STATUS_MESSAGES[code] || String(code);
    return await this.send(message);
  }

  /**
   * Redirect to URL
   */
  async redirect(url: string, status: number = 302): Promise<this> {
    this._status = status;
    this.set("Location", url);

    const body = `Redirecting to ${url}`;
    return await this.send(body);
  }

  /**
   * End response
   */
  async end(data?: string | Buffer | Uint8Array): Promise<this> {
    if (data) {
      return await this.send(data);
    }
    return await this.send("");
  }

  /**
   * Stream response
   */
  async stream(readable: ReadableStream): Promise<void> {
    if (this._sent) {
      throw new Error("Response already sent");
    }

    await this._executeDeferredFunctions();

    this._sent = true;
    this._headersSent = true;

    this._resolve(
      new globalThis.Response(readable, {
        status: this._status,
        headers: this._headers,
      }),
    );
  }

  /**
   * Respond with native Response
   */
  respond(response: globalThis.Response): void {
    if (this._sent) {
      throw new Error("Response already sent");
    }

    this._sent = true;
    this._headersSent = true;
    this._resolve(response);
  }

  // ============================================================================
  // File Methods
  // ============================================================================

  /**
   * Set Content-Disposition for attachment
   */
  attachment(filename?: string): this {
    if (filename) {
      const mimeType = lookup(filename) || "application/octet-stream";
      this.type(mimeType);
      this.set(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(filename)}"`,
      );
    } else {
      this.set("Content-Disposition", "attachment");
    }

    return this;
  }

  /**
   * Send file as download
   */
  async download(filePath: string, filename?: string): Promise<void> {
    const name = filename || filePath.split("/").pop() || "download";
    this.attachment(name);
    await this.sendFile(filePath);
  }

  /**
   * Send file
   */
  async sendFile(filePath: string): Promise<void> {
    try {
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        throw new Error("File not found");
      }

      // Set headers
      if (!this._headers.has("Content-Type")) {
        this.set("Content-Type", file.type || "application/octet-stream");
      }

      this.set("Content-Length", String(file.size));

      // Send file
      const content = await file.arrayBuffer();
      await this.send(new Uint8Array(content) as any);
    } catch (error) {
      throw new Error(`Failed to send file: ${error}`);
    }
  }

  /**
   * Render view template
   */
  async render(view: string, options: any = {}): Promise<void> {
    try {
      const html = await this._app.render(view, options);
      this.type("html");
      await this.send(html);
    } catch (error) {
      throw new Error(`Failed to render view: ${error}`);
    }
  }

  // ============================================================================
  // Server-Sent Events (SSE)
  // ============================================================================

  /**
   * Initialise the response as an SSE stream.
   *
   * ```ts
   * app.get('/events', (req, res) => {
   *   const sse = res.sse();
   *   sse.send({ message: 'hello' }, 'greeting');
   *   req.on?.('close', () => sse.close());
   * });
   * ```
   */
  sse(options: SseOptions = {}): SseController {
    if (this._sent) {
      throw new Error("Cannot start SSE after response has been sent");
    }

    const keepAliveInterval = options.keepAlive ?? 30_000;
    let closed = false;

    // Set SSE headers
    this.set("Content-Type", "text/event-stream");
    this.set("Cache-Control", "no-cache");
    this.set("Connection", "keep-alive");

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        this.set(k, v);
      }
    }

    // Build a ReadableStream that we control
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this._sseStreamController = controller;

        // Send retry field if configured
        if (options.retry !== undefined) {
          const chunk = TEXT_ENCODER.encode(`retry: ${options.retry}\n\n`);
          controller.enqueue(chunk);
        }

        // Keep-alive timer
        if (keepAliveInterval > 0) {
          this._sseKeepAliveTimer = setInterval(() => {
            if (!closed) {
              try {
                controller.enqueue(TEXT_ENCODER.encode(": keep-alive\n\n"));
              } catch {
                // stream already closed
              }
            }
          }, keepAliveInterval);
        }
      },
      cancel: () => {
        closed = true;
        this._cleanupSse();
        this.emit("close");
      },
    });

    // Send the streaming response
    this._sent = true;
    this._headersSent = true;
    this._resolve(
      new globalThis.Response(stream, {
        status: this._status,
        headers: this._headers,
      }),
    );

    // Return the controller object
    const controller: SseController = {
      send: (data: any, event?: string, id?: string) => {
        if (closed) return;
        let frame = "";
        if (id) frame += `id: ${id}\n`;
        if (event) frame += `event: ${event}\n`;
        const payload =
          typeof data === "object" ? JSON.stringify(data) : String(data);
        // Handle multi-line data
        for (const line of payload.split("\n")) {
          frame += `data: ${line}\n`;
        }
        frame += "\n";
        try {
          this._sseStreamController?.enqueue(TEXT_ENCODER.encode(frame));
        } catch {
          closed = true;
          this._cleanupSse();
        }
      },
      comment: (text: string) => {
        if (closed) return;
        try {
          this._sseStreamController?.enqueue(
            TEXT_ENCODER.encode(`: ${text}\n\n`),
          );
        } catch {
          closed = true;
          this._cleanupSse();
        }
      },
      close: () => {
        if (closed) return;
        closed = true;
        try {
          this._sseStreamController?.close();
        } catch {
          // already closed
        }
        this._cleanupSse();
        this.emit("close");
      },
      get closed() {
        return closed;
      },
    };

    return controller;
  }

  /**
   * Low-level write into an already-opened SSE / streaming response.
   */
  write(chunk: string | Uint8Array): void {
    if (!this._sseStreamController) {
      throw new Error(
        "Cannot write: no active stream. Call res.sse() or res.stream() first.",
      );
    }
    const data = typeof chunk === "string" ? TEXT_ENCODER.encode(chunk) : chunk;
    try {
      this._sseStreamController.enqueue(data);
    } catch {
      this._cleanupSse();
    }
  }

  /**
   * Clean up SSE resources
   */
  private _cleanupSse(): void {
    if (this._sseKeepAliveTimer) {
      clearInterval(this._sseKeepAliveTimer);
      this._sseKeepAliveTimer = null;
    }
    this._sseStreamController = null;
  }

  // ============================================================================
  // Event Emitter
  // ============================================================================

  /**
   * Register a listener for a response-level event.
   */
  on(event: string, listener: (...args: any[]) => void): this {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return this;
  }

  /**
   * Remove a previously registered listener.
   */
  off(event: string, listener: (...args: any[]) => void): this {
    this._listeners.get(event)?.delete(listener);
    return this;
  }

  /**
   * Emit an event to all registered listeners.
   */
  emit(event: string, ...args: any[]): boolean {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const fn of set) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`Error in "${event}" listener:`, err);
      }
    }
    return true;
  }

  // ============================================================================
  // Deferred Functions
  // ============================================================================

  /**
   * Defer function execution until response
   */
  defer(fn: () => void | Promise<void>): this {
    this._deferredFunctions.push(fn);
    return this;
  }

  /**
   * Execute all deferred functions
   */
  private async _executeDeferredFunctions(): Promise<void> {
    for (const fn of this._deferredFunctions) {
      try {
        await fn();
      } catch (error) {
        console.error("Error in deferred function:", error);
      }
    }

    this._deferredFunctions = [];
  }

  // ============================================================================
  // State Properties
  // ============================================================================

  get sent(): boolean {
    return this._sent;
  }

  get headersSent(): boolean {
    return this._headersSent;
  }

  get finished(): boolean {
    return this._sent;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Set default headers
   */
  private _setDefaultHeaders(): void {
    if (this._app?.get("x-powered-by")) {
      this._headers.set("X-Powered-By", "sinwan");
    }
  }
}
