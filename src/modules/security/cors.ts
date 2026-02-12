/**
 * sinwan CORS Middleware
 *
 */

import type { Middleware, NextFunction, Request, Response } from "../../types";

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /**
   * Allowed origins. Can be:
   * - `true`: reflect the request origin (allow any origin dynamically)
   * - `false`: disable CORS
   * - A string: exact match or "*" for all
   * - An array of strings/RegExps: list of allowed origins
   * - A RegExp: pattern to match
   * - A function: async validator `(origin, req) => boolean | string`
   */
  origin?:
    | boolean
    | string
    | (string | RegExp)[]
    | RegExp
    | ((
        origin: string,
        req: Request,
      ) => boolean | string | Promise<boolean | string>);

  /** Allowed HTTP methods */
  methods?: string | string[];

  /** Allowed request headers (alias: `headers`) */
  allowedHeaders?: string | string[];

  /** Alias for `allowedHeaders` */
  headers?: string | string[];

  /** Headers exposed to the client */
  exposedHeaders?: string | string[];

  /** Allow credentials (cookies, authorization headers) */
  credentials?: boolean;

  /** Preflight cache duration in seconds */
  maxAge?: number;

  /** Pass preflight response to next handler */
  preflightContinue?: boolean;

  /** Success status for OPTIONS requests */
  optionsSuccessStatus?: number;
}

/**
 * Default CORS options
 */
const DEFAULT_OPTIONS: CorsOptions = {
  origin: "*",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [],
  exposedHeaders: [],
  credentials: false,
  maxAge: undefined,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Check if origin is allowed
 */
async function isOriginAllowed(
  origin: string,
  allowedOrigin: CorsOptions["origin"],
  req: Request,
): Promise<string | false> {
  // false or undefined — CORS disabled
  if (allowedOrigin === false || allowedOrigin === undefined) {
    return false;
  }

  // true — reflect the request origin
  if (allowedOrigin === true) {
    return origin;
  }

  // Allow all origins
  if (allowedOrigin === "*") {
    return "*";
  }

  // Exact string match
  if (typeof allowedOrigin === "string") {
    return origin === allowedOrigin ? origin : false;
  }

  // Array of strings / RegExps
  if (Array.isArray(allowedOrigin)) {
    for (const entry of allowedOrigin) {
      if (typeof entry === "string" && entry === origin) {
        return origin;
      }
      if (entry instanceof RegExp && entry.test(origin)) {
        return origin;
      }
    }
    return false;
  }

  // RegExp match
  if (allowedOrigin instanceof RegExp) {
    return allowedOrigin.test(origin) ? origin : false;
  }

  // Function validator
  if (typeof allowedOrigin === "function") {
    const result = await allowedOrigin(origin, req);
    if (typeof result === "string") {
      return result;
    }
    return result ? origin : false;
  }

  return false;
}

/**
 * Normalize a string-or-array option into a comma-separated string.
 */
function toHeaderString(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * Set CORS headers on response
 */
async function setCorsHeaders(
  req: Request,
  res: Response,
  options: CorsOptions,
): Promise<void> {
  const origin = req.headers.get("origin");

  if (origin) {
    const allowed = await isOriginAllowed(origin, options.origin, req);

    if (allowed) {
      res.set("Access-Control-Allow-Origin", allowed);

      // Vary by Origin when not using "*"
      if (allowed !== "*") {
        res.vary("Origin");
      }
    }
  }

  // Credentials
  if (options.credentials) {
    res.set("Access-Control-Allow-Credentials", "true");
  }

  // Exposed headers
  const exposedHeaders = toHeaderString(options.exposedHeaders);
  if (exposedHeaders) {
    res.set("Access-Control-Expose-Headers", exposedHeaders);
  }
}

/**
 * Set preflight CORS headers
 */
async function setPreflightHeaders(
  req: Request,
  res: Response,
  options: CorsOptions,
): Promise<void> {
  // Set basic CORS headers
  await setCorsHeaders(req, res, options);

  // Access-Control-Allow-Methods
  const methods = toHeaderString(options.methods);
  if (methods) {
    res.set("Access-Control-Allow-Methods", methods);
  }

  // Access-Control-Allow-Headers (support `headers` alias)
  const allowedHeaders = options.allowedHeaders || options.headers;
  const allowedHeadersStr = toHeaderString(allowedHeaders);
  const requestedHeaders = req.headers.get("access-control-request-headers");

  if (allowedHeadersStr) {
    res.set("Access-Control-Allow-Headers", allowedHeadersStr);
  } else if (requestedHeaders) {
    // Reflect requested headers when none are explicitly configured
    res.set("Access-Control-Allow-Headers", requestedHeaders);
    res.vary("Access-Control-Request-Headers");
  }

  // Access-Control-Max-Age
  if (options.maxAge !== undefined) {
    res.set("Access-Control-Max-Age", String(options.maxAge));
  }
}

/**
 * Create CORS middleware
 *
 * Accepts a static options object **or** a per-request callback that receives
 * the request and returns options (sync or async), matching the Express `cors`
 * package API.
 *
 * ```ts
 * app.use(cors());                          // defaults
 * app.use(cors({ origin: 'https://a.com' }));
 * app.use(cors(async (req) => ({            // dynamic
 *   origin: req.headers.get('origin') === 'https://a.com',
 * })));
 * ```
 */
export function cors(
  optionsOrCallback:
    | CorsOptions
    | ((req: Request) => CorsOptions | Promise<CorsOptions>) = {},
): Middleware {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Resolve per-request options when a callback is supplied
    const userOptions =
      typeof optionsOrCallback === "function"
        ? await optionsOrCallback(req)
        : optionsOrCallback;

    const config: CorsOptions = { ...DEFAULT_OPTIONS, ...userOptions };

    const method =
      req.method && req.method.toUpperCase ? req.method.toUpperCase() : "";

    if (method === "OPTIONS") {
      // Preflight request
      await setPreflightHeaders(req, res, config);

      if (config.preflightContinue) {
        await next();
      } else {
        // Safari (and potentially other browsers) need content-length 0
        // for 204 or they just hang waiting for a body
        res.status(config.optionsSuccessStatus || 204);
        res.set("Content-Length", "0");
        await res.end();
      }
    } else {
      // Actual response
      await setCorsHeaders(req, res, config);
      await next();
    }
  };
}

/**
 * Create a CORS middleware that allows all origins (unsafe for production)
 */
export function corsAll(): Middleware {
  return cors({
    origin: "*",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    credentials: false,
  });
}

/**
 * Create a CORS middleware for development.
 * Reflects the request origin and allows credentials.
 */
export function corsDev(): Middleware {
  return cors({
    origin: true,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  });
}
