import type {
  ErrorMiddleware,
  HttpMethod,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";
import {
  MiddlewareStack,
  type ExecutionOptions,
} from "../middleware/middleware-stack";
import { Layer } from "./layer";
import { RadixTree, type ParamConstraint } from "./radix-tree";

/**
 * Route constraints
 */
export interface RouteConstraints {
  [param: string]: RegExp | ((value: string) => boolean);
}

/**
 * Router options
 */
export interface RouterOptions extends ExecutionOptions {
  useRadixTree?: boolean;
  prefix?: string;
  caseSensitive?: boolean;
  strict?: boolean;
  monitoring?: boolean;
}

/**
 * Route metadata
 */
export interface RouteMetadata {
  name?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  [key: string]: any;
}

/**
 * Route group callback
 */
export type RouteGroupCallback = (router: Router) => void;

/**
 * Router with clear separation of concerns
 */
export class Router {
  // Independent middleware stack
  private _middlewareStack: MiddlewareStack;

  // Mounted child routers (sorted by path length, longest first)
  private _mounts: Array<{ path: string; router: Router }> = [];

  // Route layers for matching
  private _routeLayers: Layer[] = [];

  // Radix tree for performance
  private _radixTree?: RadixTree;

  // Configuration
  private _prefix: string;
  private readonly _options: Required<RouterOptions>;

  // Metadata
  private _routeMetadata = new Map<string, RouteMetadata>();

  // Monitoring
  private _stats = {
    requests: 0,
    errors: 0,
    totalTime: 0,
  };

  constructor(options: RouterOptions = {}) {
    this._options = {
      useRadixTree: options.useRadixTree ?? true,
      prefix: options.prefix || "",
      caseSensitive: options.caseSensitive ?? false,
      strict: options.strict ?? false,
      mergeParams: options.mergeParams ?? false,
      timeout: options.timeout ?? 30000,
      monitoring: options.monitoring ?? true,
      onMiddleware: options.onMiddleware ?? (() => {}),
    };

    this._prefix = this._options.prefix;

    // Create the middleware stack
    this._middlewareStack = new MiddlewareStack({
      mergeParams: this._options.mergeParams,
      timeout: this._options.timeout,
      onMiddleware: this._options.onMiddleware,
    });

    // Create the radix tree if enabled
    if (this._options.useRadixTree) {
      this._radixTree = new RadixTree();
    }
  }

  // ============================================================================
  // MIDDLEWARE MANAGEMENT
  // ============================================================================

  /**
   * Register a middleware or error middleware
   * Automatically handles both types
   */
  use(
    path: string | Middleware | ErrorMiddleware,
    ...handlers: Array<Middleware | ErrorMiddleware>
  ): this {
    let targetPath = "/";
    let middlewares: Array<Middleware | ErrorMiddleware> = [];

    // Determine path and handlers
    if (typeof path === "string") {
      targetPath = this._resolvePath(path);
      middlewares = handlers;
    } else {
      targetPath = "/";
      middlewares = [path, ...handlers];
    }

    // Validate handlers
    for (const handler of middlewares) {
      if (typeof handler !== "function") {
        throw new TypeError("Middleware must be a function");
      }
    }

    // Add to the stack
    const names = middlewares.map((h) => h.name || "anonymous");
    this._middlewareStack.pushMany(middlewares, targetPath, names);

    return this;
  }

  /**
   * Register an error middleware explicitly
   */
  useError(handler: ErrorMiddleware): this {
    if (typeof handler !== "function") {
      throw new TypeError("Error middleware must be a function");
    }

    if (handler.length !== 4) {
      throw new TypeError(
        "Error middleware must accept 4 parameters (err, req, res, next)",
      );
    }

    this._middlewareStack.push(handler, "/", handler.name || "errorHandler");
    return this;
  }

  // ============================================================================
  // ROUTE REGISTRATION
  // ============================================================================

  /**
   * Register a route with HTTP method
   */
  route(
    method: HttpMethod,
    path: string,
    ...args: (Middleware | RouteConstraints | Middleware[] | RouteMetadata)[]
  ): this {
    const resolvedPath = this._resolvePath(path);
    const handlers: Middleware[] = [];
    let constraints: RouteConstraints | undefined;
    let metadata: RouteMetadata | undefined;

    // Parse arguments
    for (const arg of args) {
      if (typeof arg === "function") {
        handlers.push(arg as Middleware);
      } else if (Array.isArray(arg)) {
        handlers.push(
          ...(arg.filter((h) => typeof h === "function") as Middleware[]),
        );
      } else if (typeof arg === "object") {
        const keys = Object.keys(arg);
        const isConstraints = keys.some(
          (key) => arg[key] instanceof RegExp || typeof arg[key] === "function",
        );

        if (isConstraints) {
          constraints = arg as RouteConstraints;
        } else {
          metadata = arg as RouteMetadata;
        }
      }
    }

    // Validation
    if (handlers.length === 0) {
      throw new Error(`Route ${method} ${path} must have at least one handler`);
    }

    // Add to radix tree
    if (this._radixTree) {
      const parsedConstraints = constraints
        ? this._parseConstraints(constraints)
        : undefined;
      this._radixTree.add(
        method,
        resolvedPath,
        handlers,
        parsedConstraints,
        metadata,
      );
    }

    // Create layers
    handlers.forEach((handler) => {
      const layer = new Layer({
        path: resolvedPath,
        method,
        handler,
        constraints,
        metadata,
      });
      this._routeLayers.push(layer);
    });

    // Save metadata
    if (metadata) {
      const routeKey = `${method}:${resolvedPath}`;
      this._routeMetadata.set(routeKey, metadata);
    }

    return this;
  }

  // ============================================================================
  // HTTP METHOD SHORTCUTS
  // ============================================================================

  get(path: string, ...args: any[]): this {
    return this.route("GET", path, ...args);
  }

  post(path: string, ...args: any[]): this {
    return this.route("POST", path, ...args);
  }

  put(path: string, ...args: any[]): this {
    return this.route("PUT", path, ...args);
  }

  delete(path: string, ...args: any[]): this {
    return this.route("DELETE", path, ...args);
  }

  patch(path: string, ...args: any[]): this {
    return this.route("PATCH", path, ...args);
  }

  head(path: string, ...args: any[]): this {
    return this.route("HEAD", path, ...args);
  }

  options(path: string, ...args: any[]): this {
    return this.route("OPTIONS", path, ...args);
  }

  all(path: string, ...handlers: Middleware[]): this {
    const methods: HttpMethod[] = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    methods.forEach((method) => this.route(method, path, ...handlers));
    return this;
  }

  // ============================================================================
  // ROUTE GROUPS
  // ============================================================================

  /**
   * Create a route group with prefix
   */
  group(prefix: string, callback: RouteGroupCallback): this;
  group(
    options: { prefix: string; middleware?: Middleware[] },
    callback: RouteGroupCallback,
  ): this;
  group(
    prefixOrOptions: string | { prefix: string; middleware?: Middleware[] },
    callback: RouteGroupCallback,
  ): this {
    const prefix =
      typeof prefixOrOptions === "string"
        ? prefixOrOptions
        : prefixOrOptions.prefix;

    const middleware =
      typeof prefixOrOptions === "object"
        ? prefixOrOptions.middleware
        : undefined;

    // Create a sub-router
    const subRouter = new Router({
      ...this._options,
      prefix: this._resolvePath(prefix),
      useRadixTree: false, // Will use the parent's radix tree
    });

    // Execute the callback
    callback(subRouter);

    // Add group middleware if provided
    if (middleware && middleware.length > 0) {
      const groupPath = this._resolvePath(prefix);
      this._middlewareStack.pushMany(middleware, groupPath);
    }

    // Merge the sub-router
    this._mergeRouter(subRouter);

    return this;
  }

  /**
   * Mount a router at a path
   */
  mount(path: string, router: Router): this {
    if (!(router instanceof Router)) {
      throw new TypeError("Can only mount Router instances");
    }

    const mountPath = this._resolvePath(path);

    // Store mount and keep sorted by path length (longest first) for O(1) best-match
    this._mounts.push({ path: mountPath, router });
    this._mounts.sort((a, b) => b.path.length - a.path.length);

    return this;
  }

  // ============================================================================
  // REQUEST HANDLING
  // ============================================================================

  /**
   * Handle an incoming request
   * Clear separation: middleware -> routing -> handlers
   */
  async handle(
    req: Request,
    res: Response,
    finalHandler: NextFunction,
  ): Promise<void> {
    const startTime = this._options.monitoring ? performance.now() : 0;

    try {
      if (this._options.monitoring) {
        this._stats.requests++;
      }

      // Create the routing handler that will do the actual routing
      const routingHandler: NextFunction = async (err?: any) => {
        if (err) {
          return finalHandler(err);
        }

        // First, try to find route in parent's own radix tree
        if (this._radixTree) {
          const match = this._radixTree.find(
            req.method as HttpMethod,
            req.path,
          );

          if (match) {
            // Merge or replace params
            if (this._options.mergeParams) {
              req.params = { ...req.params, ...match.params };
            } else {
              req.params = match.params;
            }

            // Execute route handlers
            await this._executeRouteHandlers(
              match.route.handlers,
              req,
              res,
              finalHandler,
            );

            if (this._options.monitoring) {
              this._stats.totalTime += performance.now() - startTime;
            }

            return;
          }
        }

        // Check mounted child routers (already sorted by path length, longest first)
        if (this._mounts.length > 0) {
          for (const m of this._mounts) {
            const matches =
              m.path === "/" ||
              req.path === m.path ||
              req.path.startsWith(m.path + "/");
            if (!matches) continue;

            // Delegate to child router with path adjusted (strip mount prefix)
            const originalPath = req.path;
            const originalBase = req.baseUrl || "";

            // Compute new path: strip mount path prefix
            let newPath: string;
            if (m.path === "/") {
              newPath = originalPath;
            } else {
              newPath = originalPath.slice(m.path.length);
              if (!newPath) newPath = "/";
            }

            // Adjust request
            req.path = newPath;
            req.baseUrl =
              m.path === "/"
                ? originalBase
                : (originalBase === "/" ? "" : originalBase) + m.path;

            try {
              await m.router.handle(req, res, finalHandler);
            } finally {
              // Restore original path/baseUrl
              req.path = originalPath;
              req.baseUrl = originalBase;
            }

            return;
          }
        }

        // Fallback: search in layers
        await this._executeLayerMatching(req, res, finalHandler);

        if (this._options.monitoring) {
          this._stats.totalTime += performance.now() - startTime;
        }
      };

      // First execute the middleware chain, then do routing
      await this._middlewareStack.execute(req, res, routingHandler);
    } catch (error) {
      if (this._options.monitoring) {
        this._stats.errors++;
      }
      finalHandler(error);
    }
  }

  /**
   * Execute route handlers
   */
  private async _executeRouteHandlers(
    handlers: Middleware[],
    req: Request,
    res: Response,
    finalHandler: NextFunction,
  ): Promise<void> {
    let index = 0;

    const next: NextFunction = async (err?: any) => {
      if (err) {
        // Try to handle error with router-local error middleware first
        const handled = await this._runLocalErrorMiddleware(
          err,
          req,
          res,
          finalHandler,
        );
        if (handled) return;
        return finalHandler(err);
      }

      if (index >= handlers.length) return finalHandler();

      const handler = handlers[index++];

      try {
        await handler(req, res, next);
      } catch (error) {
        // On thrown error, use same local error handling path
        const handled = await this._runLocalErrorMiddleware(
          error,
          req,
          res,
          finalHandler,
        );
        if (handled) return;
        finalHandler(error);
      }
    };

    await next();
  }

  /**
   * Try to run router-local error middleware matching the request path.
   * Returns true if the router executed local error middleware (even if that middleware called next),
   * otherwise false.
   */
  private async _runLocalErrorMiddleware(
    err: any,
    req: Request,
    res: Response,
    finalHandler: NextFunction,
  ): Promise<boolean> {
    try {
      const entries: any[] = (this._middlewareStack as any).entries || [];
      const firstErrorIndex = entries.findIndex(
        (e) =>
          e.isErrorHandler &&
          (e.path === "*" || e.path === "/" || req.path.startsWith(e.path)),
      );

      if (firstErrorIndex >= 0) {
        const routerFinal: NextFunction = async (e?: any) => {
          if (e) return finalHandler(e);
          return finalHandler();
        };

        await (this._middlewareStack as any).execute(
          req,
          res,
          routerFinal,
          firstErrorIndex,
          err,
        );
        return true;
      }
    } catch (ex) {
      finalHandler(ex);
      return true;
    }

    return false;
  }

  /**
   * Layer-based matching (fallback)
   */
  private async _executeLayerMatching(
    req: Request,
    res: Response,
    finalHandler: NextFunction,
  ): Promise<void> {
    let index = 0;

    const next: NextFunction = async (err?: any) => {
      if (err) return finalHandler(err);
      if (index >= this._routeLayers.length) return finalHandler();

      const layer = this._routeLayers[index++];

      // Check path match
      if (!layer.match(req.path)) {
        return next();
      }

      // Check method match
      if (layer.method !== req.method) {
        return next();
      }

      // Validate constraints
      if (layer.constraints) {
        const extraction = layer.extractParams(req.path);
        if (!extraction.valid || !layer.validateParams(extraction.params)) {
          return next();
        }
      }

      // Extract params
      const params = layer.params(req.path);
      if (this._options.mergeParams) {
        req.params = { ...req.params, ...params };
      } else {
        req.params = params;
      }

      // Execute handler
      try {
        await (layer.handler as Middleware)(req, res, next);
      } catch (error) {
        next(error);
      }
    };

    await next();
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get all registered routes
   */
  getRoutes(): Array<{
    method: HttpMethod;
    path: string;
    metadata?: RouteMetadata;
  }> {
    const routes: Array<{
      method: HttpMethod;
      path: string;
      metadata?: RouteMetadata;
    }> = [];
    const seen = new Set<string>();

    for (const layer of this._routeLayers) {
      const key = `${layer.method}:${layer.path}`;
      if (seen.has(key)) continue;

      seen.add(key);
      routes.push({
        method: layer.method,
        path: layer.path,
        metadata: this._routeMetadata.get(key),
      });
    }

    return routes;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this._stats,
      avgTime:
        this._stats.requests > 0
          ? this._stats.totalTime / this._stats.requests
          : 0,
      routes: this._routeLayers.length,
      middleware: this._middlewareStack.getStats(),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private _resolvePath(path: string): string {
    if (!this._prefix) return path;
    return this._joinPaths(this._prefix, path);
  }

  private _joinPaths(base: string, path: string): string {
    if (base === "/" || base === "") return path;
    if (path === "/") return base;

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : "/" + path;

    return normalizedBase + normalizedPath;
  }

  private _parseConstraints(
    constraints: RouteConstraints,
  ): Record<string, ParamConstraint> {
    const result: Record<string, ParamConstraint> = {};

    for (const [param, constraint] of Object.entries(constraints)) {
      if (constraint instanceof RegExp) {
        result[param] = { pattern: constraint, name: param };
      } else if (typeof constraint === "function") {
        result[param] = { validator: constraint, name: param };
      }
    }

    return result;
  }

  private _mergeRouter(router: Router): void {
    // Merge middleware
    this._middlewareStack.merge(router._middlewareStack, "");

    // Merge layers
    for (const layer of router._routeLayers) {
      this._routeLayers.push(layer);

      if (this._radixTree && layer.method !== "USE") {
        const constraints = layer.constraints
          ? this._parseConstraints(layer.constraints)
          : undefined;
        this._radixTree.add(
          layer.method,
          layer.path,
          [layer.handler as Middleware],
          constraints,
          layer.metadata,
        );
      }
    }

    // Merge metadata
    router._routeMetadata.forEach((value, key) => {
      this._routeMetadata.set(key, value);
    });
  }
}
