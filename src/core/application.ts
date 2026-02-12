import path from "node:path";
import { MiddlewareStack } from "../modules/middleware/middleware-stack";
import { Router } from "../modules/router/router";
import { serve, ServeOptions } from "../server/sinwanServer";
import type {
  ErrorMiddleware,
  Middleware,
  NextFunction,
  Plugin,
  Request,
  Response,
} from "../types";
import { debug } from "./debug";
import { RequestImpl } from "./request";
import { ResponseImpl } from "./response";
import { View } from "./view";

/**
 * Application options
 */
export interface ApplicationOptions {
  strict?: boolean;
  requestTimeout?: number;
  trustProxy?: boolean;
  maxHooksPerEvent?: number;
  monitoring?: boolean;
  mergeParams?: boolean;
}

/**
 * Plugin metadata
 */
interface PluginMetadata {
  plugin: Plugin;
  installed: boolean;
  error?: Error;
  installedAt: number;
}

/**
 * Application with separated architecture
 */
export class Application {
  // Router principal (composition, pas héritage)
  private _router: Router;

  // Stack de middleware au niveau application
  private _middlewareStack: MiddlewareStack;

  // Configuration
  private _settings: Map<string, any> = new Map();
  private _plugins: Map<string, PluginMetadata> = new Map();
  private _engines: Map<string, Function> = new Map();
  private _hooks = new Map<string, Array<{ fn: Function; timeout?: number }>>();

  // Extensions
  private _extensions = {
    request: new Map<string, Function>(),
    response: new Map<string, Function>(),
    application: new Map<string, Function>(),
  };

  // État
  private _initialized: boolean = false;
  private _destroyed: boolean = false;
  private readonly _options: Required<ApplicationOptions>;

  // Public
  public locals: Record<string, any> = {};
  public server?: any;

  // Statistiques
  private _stats = {
    requests: 0,
    errors: 0,
    totalResponseTime: 0,
    startTime: Date.now(),
  };

  constructor(options: ApplicationOptions = {}) {
    this._options = {
      strict: options.strict ?? false,
      requestTimeout: options.requestTimeout ?? 30000,
      trustProxy: options.trustProxy ?? false,
      maxHooksPerEvent: options.maxHooksPerEvent ?? 100,
      monitoring: options.monitoring ?? true,
      mergeParams: options.mergeParams ?? false,
    };

    // Create router with the same options
    this._router = new Router({
      useRadixTree: true,
      mergeParams: this._options.mergeParams,
      monitoring: this._options.monitoring,
    });

    // Create app-level middleware stack
    this._middlewareStack = new MiddlewareStack({
      mergeParams: this._options.mergeParams,
      timeout: this._options.requestTimeout,
    });

    this._initializeDefaults();
    this._initialized = true;
  }

  // ============================================================================
  // SETTINGS
  // ============================================================================

  private _initializeDefaults(): void {
    this.set("env", process.env.NODE_ENV || "development");
    this.set("x-powered-by", true);
    this.set("views", path.resolve("views"));
    this.set("view", View);
    this.set("view engine", "html");
    this.set("trust proxy", this._options.trustProxy);
    this.set("json spaces", this.get("env") === "production" ? 0 : 2);
    this.set("etag", "weak");
    this.set("query parser", "simple");
    this.set("subdomain offset", 2);
  }

  set(setting: string, val: any): this {
    this._ensureNotDestroyed();
    this._settings.set(setting, val);
    return this;
  }

  get(pathOrSetting: string, ...handlers: Middleware[]): any {
    if (handlers.length === 0) {
      return this._settings.get(pathOrSetting);
    }
    return this._router.get(pathOrSetting, ...handlers);
  }

  enabled(setting: string): boolean {
    return Boolean(this.get(setting));
  }

  disabled(setting: string): boolean {
    return !this.enabled(setting);
  }

  enable(setting: string): this {
    return this.set(setting, true);
  }

  disable(setting: string): this {
    return this.set(setting, false);
  }

  // ============================================================================
  // MIDDLEWARE & ROUTING
  // ============================================================================

  /**
   * Register middleware or router
   * Handles all cases: normal middleware, error middleware, routers
   */
  use(
    path: string | Middleware | ErrorMiddleware | Router | Application,
    ...handlers: Array<Middleware | ErrorMiddleware | Router | Application>
  ): this {
    this._ensureNotDestroyed();

    // Case 1: Mount a Router
    if (path instanceof Router) {
      this._router.mount("/", path);
      return this;
    }

    if (path instanceof Application) {
      this._router.mount("/", path._router);
      return this;
    }

    // Case 2: path is a string
    if (typeof path === "string") {
      for (const handler of handlers) {
        if (handler instanceof Router) {
          this._router.mount(path, handler);
        } else if (handler instanceof Application) {
          this._router.mount(path, handler._router);
        } else if (typeof handler === "function") {
          // Middleware normal or error middleware
          if (handler.length === 4) {
            // Error middleware - add to app stack
            this._middlewareStack.push(handler as ErrorMiddleware, path);
          } else {
            // Normal middleware - add to router
            this._router.use(path, handler as Middleware);
          }
        }
      }
      return this;
    }

    // Case 3: path is a middleware/router
    if (typeof path === "function") {
      // Determine if it's an error middleware
      if (path.length === 4) {
        this._middlewareStack.push(path as ErrorMiddleware, "/");
      } else {
        this._router.use(path as Middleware);
      }

      // Process remaining handlers
      for (const handler of handlers) {
        if (handler instanceof Router) {
          this._router.mount("/", handler);
        } else if (handler instanceof Application) {
          this._router.mount("/", handler._router);
        } else if (typeof handler === "function") {
          if (handler.length === 4) {
            this._middlewareStack.push(handler as ErrorMiddleware, "/");
          } else {
            this._router.use(handler as Middleware);
          }
        }
      }
    }

    return this;
  }

  /**
   * Explicitly register an error middleware
   */
  useError(handler: ErrorMiddleware): this {
    this._ensureNotDestroyed();

    if (typeof handler !== "function") {
      throw new TypeError("Error middleware must be a function");
    }

    if (handler.length !== 4) {
      throw new TypeError("Error middleware must accept 4 parameters");
    }

    this._middlewareStack.push(handler, "/", handler.name || "errorHandler");
    return this;
  }

  // ============================================================================
  // HTTP METHODS (délégués au router)
  // ============================================================================

  post(path: string, ...handlers: Middleware[]): this {
    this._router.post(path, ...handlers);
    return this;
  }

  put(path: string, ...handlers: Middleware[]): this {
    this._router.put(path, ...handlers);
    return this;
  }

  delete(path: string, ...handlers: Middleware[]): this {
    this._router.delete(path, ...handlers);
    return this;
  }

  patch(path: string, ...handlers: Middleware[]): this {
    this._router.patch(path, ...handlers);
    return this;
  }

  head(path: string, ...handlers: Middleware[]): this {
    this._router.head(path, ...handlers);
    return this;
  }

  options(path: string, ...handlers: Middleware[]): this {
    this._router.options(path, ...handlers);
    return this;
  }

  all(path: string, ...handlers: Middleware[]): this {
    this._router.all(path, ...handlers);
    return this;
  }

  // ============================================================================
  // PLUGINS
  // ============================================================================

  plugin(plugin: Plugin): this {
    this._ensureNotDestroyed();

    if (!plugin || typeof plugin !== "object") {
      throw new TypeError("Plugin must be an object");
    }

    if (!plugin.name || typeof plugin.name !== "string") {
      throw new TypeError("Plugin must have a name");
    }

    if (typeof plugin.install !== "function") {
      throw new TypeError("Plugin must have an install function");
    }

    if (this._plugins.has(plugin.name)) {
      const existing = this._plugins.get(plugin.name)!;
      if (existing.installed) {
        console.warn(`Plugin "${plugin.name}" is already installed`);
        return this;
      }
    }

    const metadata: PluginMetadata = {
      plugin,
      installed: false,
      installedAt: Date.now(),
    };

    try {
      plugin.install(this);
      metadata.installed = true;
      this._plugins.set(plugin.name, metadata);

      debug.success(`✓ Plugin installed: ${plugin.name}`);
    } catch (error) {
      metadata.error = error as Error;
      this._plugins.set(plugin.name, metadata);
      console.error(`✗ Plugin installation failed: ${plugin.name}`, error);

      if (this._options.strict) {
        throw error;
      }
    }

    return this;
  }

  // ============================================================================
  // EXTENSIONS
  // ============================================================================

  extend(
    type: "request" | "response" | "application",
    name: string,
    fn: Function,
  ): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Extension must be a function");
    }

    this._extensions[type].set(name, fn);

    if (type === "application" && this._initialized) {
      (this as any)[name] = fn.bind(this);
    }

    return this;
  }

  private _applyExtensions(req: Request, res: Response): void {
    this._extensions.request.forEach((fn, name) => {
      (req as any)[name] = fn.bind(req);
    });

    this._extensions.response.forEach((fn, name) => {
      (res as any)[name] = fn.bind(res);
    });
  }

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  on(hook: string, fn: Function, timeout?: number): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Hook handler must be a function");
    }

    if (!this._hooks.has(hook)) {
      this._hooks.set(hook, []);
    }

    const hooks = this._hooks.get(hook)!;

    if (hooks.length >= this._options.maxHooksPerEvent) {
      throw new Error(
        `Maximum hooks limit (${this._options.maxHooksPerEvent}) reached for "${hook}"`,
      );
    }

    hooks.push({ fn, timeout });
    return this;
  }

  private async _runHooks(
    hook: string,
    defaultTimeout: number = 5000,
    ...args: any[]
  ): Promise<void> {
    const hooks = this._hooks.get(hook);
    if (!hooks || hooks.length === 0) return;

    for (const { fn, timeout } of hooks) {
      const activeTimeout = timeout || defaultTimeout;
      try {
        await Promise.race([
          Promise.resolve(fn(...args)),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Hook "${hook}" timeout after ${activeTimeout}ms`),
                ),
              activeTimeout,
            ),
          ),
        ]);
      } catch (error: any) {
        if (error.message && error.message.includes("timeout")) {
          debug.error(`⏱️  ${error.message}`);
        } else {
          debug.error(`✗ Error in hook "${hook}":`, error.message);
        }

        if (this._options.strict) {
          throw error;
        }
      }
    }
  }

  onStart(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("onStart", fn, timeout);
  }

  beforeStart(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("beforeStart", fn, timeout);
  }

  afterStart(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("afterStart", fn, timeout);
  }

  onStop(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("onStop", fn, timeout);
  }

  beforeStop(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("beforeStop", fn, timeout);
  }

  afterStop(fn: () => void | Promise<void>, timeout?: number): this {
    return this.on("afterStop", fn, timeout);
  }

  beforeRequest(
    fn: (req: Request) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("beforeRequest", fn, timeout);
  }

  afterRequest(
    fn: (req: Request, res: Response) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("afterRequest", fn, timeout);
  }

  beforeResponse(
    fn: (req: Request, res: Response) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("beforeResponse", fn, timeout);
  }

  afterResponse(
    fn: (req: Request, res: Response) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("afterResponse", fn, timeout);
  }

  onError(
    fn: (err: any, req: Request, res: Response) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("onError", fn, timeout);
  }

  onSuccess(
    fn: (req: Request, res: Response) => void | Promise<void>,
    timeout?: number,
  ): this {
    return this.on("onSuccess", fn, timeout);
  }

  async runStartHooks(): Promise<void> {
    try {
      await this._runHooks("beforeStart", 10000);
      await this._runHooks("onStart", 10000);
      await this._runHooks("afterStart", 10000);
    } catch (error: any) {
      debug.error("Critical error during application startup");
      throw error;
    }
  }

  async runStopHooks(): Promise<void> {
    try {
      await this._runHooks("beforeStop", 10000);
      await this._runHooks("onStop", 10000);
      await this._runHooks("afterStop", 10000);
    } catch (error) {
      console.error("Error during application shutdown:", error);
      // We don't rethrow here to allow other cleanup to attempt to finish
    }
  }

  async runBeforeRequestHooks(req: Request): Promise<void> {
    await this._runHooks("beforeRequest", 5000, req);
  }

  async runAfterRequestHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterRequest", 5000, req, res);
  }

  async runBeforeResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("beforeResponse", 5000, req, res);
  }

  async runAfterResponseHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("afterResponse", 5000, req, res);
  }

  async runOnErrorHooks(err: any, req: Request, res: Response): Promise<void> {
    await this._runHooks("onError", 5000, err, req, res);
  }

  async runOnSuccessHooks(req: Request, res: Response): Promise<void> {
    await this._runHooks("onSuccess", 5000, req, res);
  }

  // ============================================================================
  // REQUEST HANDLING
  // ============================================================================

  /**
   * Main request handler
   * Architecture: App Middleware -> Router (with its middleware) -> Error Middleware
   */
  async fetch(nativeRequest: globalThis.Request): Promise<globalThis.Response> {
    this._ensureNotDestroyed();

    const startTime = performance.now();
    let req: Request | undefined;
    let res: Response | undefined;

    try {
      // Create request/response
      req = new RequestImpl(nativeRequest, this);

      let responseResolver: (r: globalThis.Response) => void;
      const responsePromise = new Promise<globalThis.Response>((resolve) => {
        responseResolver = resolve;
      });

      res = new ResponseImpl(responseResolver!, this, req);
      (res as any).req = req;

      // Timeout using a single timer instead of creating a Promise per request
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Request timeout")),
          this._options.requestTimeout,
        );
      });

      // Lifecycle
      const lifecyclePromise = (async () => {
        try {
          await this.runBeforeRequestHooks(req!);

          // Final handler for errors and 404
          const finalHandler: NextFunction = async (err?: any) => {
            if (err) {
              await this._handleError(err, req!, res!);
            } else if (!res!.sent) {
              await res!.status(404).send("Not Found");
            }
          };

          // Router handler executed after app-level middleware
          const routerHandler: NextFunction = async (err?: any) => {
            if (err) {
              return finalHandler(err);
            }
            await this._router.handle(req!, res!, finalHandler);
          };

          // Execute: app middleware -> router -> error middleware
          await this._middlewareStack.execute(req!, res!, routerHandler);
        } catch (err) {
          await this._handleError(err, req!, res!);
        } finally {
          if (res!.sent) {
            await this.runOnSuccessHooks(req!, res!);
          }
          await this.runAfterRequestHooks(req!, res!);

          if (this._options.monitoring) {
            this._stats.requests++;
            this._stats.totalResponseTime += performance.now() - startTime;
          }
        }
      })();

      try {
        await Promise.race([lifecyclePromise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
      return await responsePromise;
    } catch (error) {
      if (req && res) {
        await this._handleError(error, req, res);
        if (res.sent) {
          return (res as any)._responsePromise;
        }
      }

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          message:
            this.get("env") === "development"
              ? (error as Error).message
              : undefined,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  /**
   * Handle errors
   */
  private async _handleError(
    err: any,
    req: Request,
    res: Response,
  ): Promise<void> {
    if (this._options.monitoring) {
      this._stats.errors++;
    }

    await this.runOnErrorHooks(err, req, res);

    // Find first error-middleware index in the stack
    const entries: any[] = (this._middlewareStack as any).entries || [];
    const firstErrorIndex = entries.findIndex((e) => e.isErrorHandler);

    if (firstErrorIndex >= 0) {
      // finalHandler called by MiddlewareStack when chain ends
      const finalHandler: NextFunction = async (e?: any) => {
        if (!res.sent) {
          const displayErr = e ?? err;
          const isDev = this.get("env") === "development";
          await res.status(displayErr.status || 500).json({
            error: displayErr.message || "Internal Server Error",
            ...(isDev && { stack: displayErr.stack }),
          });
        }
      };

      // Execute the stack starting at first error handler, with the initial error
      try {
        await this._middlewareStack.execute(
          req,
          res,
          finalHandler,
          firstErrorIndex,
          err,
        );
      } catch (executeErr) {
        // If error occurs while executing error middleware, fallback to default response
        const e: any = executeErr;
        if (!res.sent) {
          const isDev = this.get("env") === "development";
          await res.status(e.status || 500).json({
            error: e.message || "Internal Server Error",
            ...(isDev && { stack: e.stack }),
          });
        }
      }
    } else if (!res.sent) {
      // If no error middleware, send default JSON response
      const isDev = this.get("env") === "development";
      await res.status(err.status || 500).json({
        error: err.message || "Internal Server Error",
        ...(isDev && { stack: err.stack }),
      });
    }
  }

  // ============================================================================
  // RENDERING
  // ============================================================================

  engine(
    ext: string,
    fn: (path: string, options: any) => Promise<string> | string,
  ): this {
    this._ensureNotDestroyed();

    if (typeof fn !== "function") {
      throw new TypeError("Template engine must be a function");
    }

    const extension = ext[0] !== "." ? "." + ext : ext;
    this._engines.set(extension, fn);
    return this;
  }

  async render(
    name: string,
    options: any = {},
    callback?: (err: Error | null, html?: string) => void,
  ): Promise<string> {
    try {
      const opts = { ...this.locals, ...options };
      const ViewConfig = this.get("view");
      const view = new ViewConfig(name, {
        defaultEngine: this.get("view engine"),
        root: this.get("views"),
        engines: Object.fromEntries(this._engines),
      });

      if (!view.path) {
        await view.resolvePath(this.get("views"));
      }

      const html = await view.render(opts);

      if (callback) {
        callback(null, html);
      }

      return html;
    } catch (err: any) {
      if (callback) {
        callback(err);
      }
      throw err;
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async listen(
    optionsOrPort: number | ServeOptions,
    callback?: () => void,
  ): Promise<any> {
    this._ensureNotDestroyed();

    let options: ServeOptions = {};

    if (typeof optionsOrPort === "number") {
      options.port = optionsOrPort;
    } else {
      options = optionsOrPort;
    }

    // Explicitly start server using the adapter
    const server = await serve(this, options);

    if (callback) {
      callback();
    }

    return server;
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;

    await this.runStopHooks();
    this._settings.clear();
    this._engines.clear();
    this._hooks.clear();
    this._extensions.request.clear();
    this._extensions.response.clear();
    this._extensions.application.clear();
    this._plugins.clear();
    this.locals = {};
    this._destroyed = true;

    debug.info("Application destroyed");
  }

  getStats() {
    return {
      ...this._stats,
      uptime: Date.now() - this._stats.startTime,
      avgResponseTime:
        this._stats.requests > 0
          ? this._stats.totalResponseTime / this._stats.requests
          : 0,
      router: this._router.getStats(),
      middleware: this._middlewareStack.getStats(),
    };
  }

  private _ensureNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error("Cannot use destroyed application");
    }
  }
}

export const sinwan = (options?: ApplicationOptions) =>
  new Application(options);
