/**
 * sinwan - Production-Ready Web Framework for Bun
 */

// ============================================================================
// IMPORTS
// ============================================================================

// Core imports
import { Application, createApplication } from "./core";

// Router Module imports
import { Router, RouterOptions } from "./modules/router";

// Plugin imports
import { CookieOptions, cookiePlugin } from "./plugins/cookie";
import {
  FaviconMetrics,
  FaviconOptions,
  faviconPlugin,
  getFaviconMetrics,
  resetFaviconMetrics,
} from "./plugins/favicon";
import { JsonOptions, jsonPlugin } from "./plugins/json";
import { SessionOptions, sessionPlugin } from "./plugins/session";
import { ServeStaticOptions, staticPlugin } from "./plugins/static";
import { WebSocketOptions, websocketPlugin } from "./plugins/websocket";

// ============================================================================
// CORE INITIALIZATION
// ============================================================================

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new sinwan application instance
 */
function sinwan(): Application {
  return createApplication();
}

// ============================================================================
// STATIC METHOD ATTACHMENTS
// ============================================================================

sinwan.Application = Application;
sinwan.Router = (options?: RouterOptions) => new Router(options);
sinwan.json = jsonPlugin;
sinwan.cookie = cookiePlugin;
sinwan.static = staticPlugin;
sinwan.favicon = faviconPlugin;
sinwan.ws = websocketPlugin;
sinwan.session = sessionPlugin;

// Export favicon utilities
sinwan.getFaviconMetrics = getFaviconMetrics;
sinwan.resetFaviconMetrics = resetFaviconMetrics;

// ============================================================================
// MAIN EXPORTS
// ============================================================================

// Default and named exports
export default sinwan;

// Plugin options types
export type {
  CookieOptions,
  FaviconMetrics,
  FaviconOptions,
  JsonOptions,
  ServeStaticOptions,
  SessionOptions,
  WebSocketOptions,
};

// Core exports (Application, Request, Response, Errors, Debug, View)
export * from "./core";

// ============================================================================
// MODULE EXPORTS
// ============================================================================

// Router module
export * from "./modules/router";

// Security module
export * from "./modules/security";

// Session module
export * from "./modules/session";

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Global type exports
export * from "./types";
