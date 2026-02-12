import type {
  ErrorMiddleware,
  Middleware,
  NextFunction,
  Request,
  Response,
} from "../../types";

/**
 * Entry in the middleware stack
 */
interface MiddlewareEntry {
  handler: Middleware | ErrorMiddleware;
  path: string;
  isErrorHandler: boolean;
  name?: string;
}

/**
 * Options for middleware execution
 */
export interface ExecutionOptions {
  /** Merge params instead of replacing them */
  mergeParams?: boolean;
  /** Timeout for each middleware (ms) */
  timeout?: number;
  /** Callback called after each middleware */
  onMiddleware?: (entry: MiddlewareEntry, duration: number) => void;
}

/**
 * Middleware stack manager
 * Implements the Chain of Responsibility pattern
 */
export class MiddlewareStack {
  private _stack: MiddlewareEntry[] = [];
  private readonly _options: Required<ExecutionOptions>;
  private readonly _hasOnMiddleware: boolean;

  constructor(options: ExecutionOptions = {}) {
    this._options = {
      mergeParams: options.mergeParams ?? false,
      timeout: options.timeout ?? 30000,
      onMiddleware: options.onMiddleware ?? (() => {}),
    };
    // Cache whether onMiddleware is a real callback to skip no-op calls
    this._hasOnMiddleware =
      options.onMiddleware !== undefined && options.onMiddleware !== null;
  }

  // ============================================================================
  // STACK MANAGEMENT
  // ============================================================================

  /**
   * Add a middleware to the stack
   */
  push(
    handler: Middleware | ErrorMiddleware,
    path: string = "/",
    name?: string,
  ): void {
    if (typeof handler !== "function") {
      throw new TypeError("Middleware must be a function");
    }

    this._stack.push({
      handler,
      path,
      isErrorHandler: handler.length === 4,
      name: name || handler.name || "anonymous",
    });
  }

  /**
   * Add multiple middlewares
   */
  pushMany(
    handlers: Array<Middleware | ErrorMiddleware>,
    path: string = "/",
    names?: string[],
  ): void {
    for (let i = 0; i < handlers.length; i++) {
      this.push(handlers[i], path, names?.[i]);
    }
  }

  /**
   * Get the stack size
   */
  get length(): number {
    return this._stack.length;
  }

  /**
   * Get all entries (read-only view)
   */
  get entries(): ReadonlyArray<MiddlewareEntry> {
    return this._stack;
  }

  /**
   * Clear the stack
   */
  clear(): void {
    this._stack = [];
  }

  // ============================================================================
  // EXECUTION ENGINE
  // ============================================================================

  /**
   * Execute the middleware chain
   * Implements the Chain of Responsibility pattern
   */
  async execute(
    req: Request,
    res: Response,
    finalHandler: NextFunction,
    startIndex: number = 0,
    initialError?: any,
  ): Promise<void> {
    const stack = this._stack;
    const stackLength = stack.length;
    const timeout = this._options.timeout;
    const hasTimeout = timeout > 0;
    const hasOnMiddleware = this._hasOnMiddleware;
    let currentIndex = startIndex;
    let currentError: any = initialError;

    /**
     * next() function that advances through the chain
     */
    const next: NextFunction = async (err?: any): Promise<void> => {
      // Capture error if present
      if (err !== undefined) {
        currentError = err;
      }

      // End of chain
      if (currentIndex >= stackLength) {
        return finalHandler(currentError);
      }

      const entry = stack[currentIndex++];

      try {
        if (hasTimeout) {
          // Execute with timeout — clear timer on completion to prevent leaks
          let timeoutId: ReturnType<typeof setTimeout> | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(
              () => reject(new Error(`Middleware "${entry.name}" timeout`)),
              timeout,
            );
          });

          const startTime = hasOnMiddleware ? performance.now() : 0;

          try {
            await Promise.race([
              this._executeMiddleware(entry, req, res, next, currentError),
              timeoutPromise,
            ]);
          } finally {
            clearTimeout(timeoutId);
          }

          if (hasOnMiddleware) {
            this._options.onMiddleware(entry, performance.now() - startTime);
          }
        } else {
          // Execute without timeout (fast path)
          const startTime = hasOnMiddleware ? performance.now() : 0;

          await this._executeMiddleware(entry, req, res, next, currentError);

          if (hasOnMiddleware) {
            this._options.onMiddleware(entry, performance.now() - startTime);
          }
        }
      } catch (error) {
        // Pass error to next error handler
        await next(error);
      }
    };

    // Start the chain
    await next(currentError);
  }

  /**
   * Execute an individual middleware
   */
  private async _executeMiddleware(
    entry: MiddlewareEntry,
    req: Request,
    res: Response,
    next: NextFunction,
    error?: any,
  ): Promise<void> {
    const { handler, isErrorHandler } = entry;

    if (error !== undefined) {
      // Only error handlers can process errors
      if (isErrorHandler) {
        await (handler as ErrorMiddleware)(error, req, res, next);
      } else {
        // Skip to next with the error
        await next(error);
      }
    } else {
      // Error handlers are skipped when there is no error
      if (isErrorHandler) {
        await next();
      } else {
        await (handler as Middleware)(req, res, next);
      }
    }
  }

  // ============================================================================
  // FILTERING & UTILITIES
  // ============================================================================

  /**
   * Filter middleware by path
   */
  filterByPath(path: string): MiddlewareEntry[] {
    return this._stack.filter((entry) => {
      if (entry.path === "*" || entry.path === "/") {
        return true;
      }
      return path.startsWith(entry.path);
    });
  }

  /**
   * Get stack statistics
   */
  getStats() {
    let normal = 0;
    let error = 0;
    const paths = new Set<string>();

    for (const entry of this._stack) {
      if (entry.isErrorHandler) {
        error++;
      } else {
        normal++;
      }
      paths.add(entry.path);
    }

    return {
      total: this._stack.length,
      normal,
      error,
      paths: [...paths],
    };
  }

  /**
   * Get a string representation for debugging
   */
  toString(): string {
    return this._stack
      .map((entry, i) => {
        const type = entry.isErrorHandler ? "[ERROR]" : "[NORMAL]";
        return `${i}: ${type} ${entry.name} @ ${entry.path}`;
      })
      .join("\n");
  }

  // ============================================================================
  // CLONING & COMPOSITION
  // ============================================================================

  /**
   * Create a copy of this stack
   */
  clone(): MiddlewareStack {
    const newStack = new MiddlewareStack(this._options);
    newStack._stack = [...this._stack];
    return newStack;
  }

  /**
   * Merge with another stack
   */
  merge(other: MiddlewareStack, prefix: string = ""): void {
    for (const entry of other._stack) {
      const path = prefix ? this._joinPaths(prefix, entry.path) : entry.path;
      this.push(entry.handler, path, entry.name);
    }
  }

  /**
   * Join two paths
   */
  private _joinPaths(base: string, path: string): string {
    if (base === "/" || base === "") return path;
    if (path === "/") return base;

    const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith("/") ? path : "/" + path;

    return normalizedBase + normalizedPath;
  }
}

/**
 * Factory function to create a stack
 */
export function createMiddlewareStack(
  options?: ExecutionOptions,
): MiddlewareStack {
  return new MiddlewareStack(options);
}
