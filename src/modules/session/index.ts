/**
 * sinwan Session Module - Main Exports
 *
 * Production-ready session management system
 * Optimized for Bun runtime
 *
 * @example
 * ```typescript
 * import { session, FileStore } from "@sinwan/server/session";
 *
 * app.use(session({
 *   secret: Bun.env.SESSION_SECRET!,
 *   store: new FileStore({ path: "./.sessions" }),
 *   cookie: {
 *     httpOnly: true,
 *     secure: true,
 *     maxAge: 86400000
 *   }
 * }));
 * ```
 */

// ============================================================================
// Core Exports
// ============================================================================

// Types
export type {
  Session,
  SessionCookie,
  SessionCookieData,
  SessionCookieOptions,
  SessionData,
  SessionOptions,
  SessionStore,
} from "./types";

// Errors
export {
  SessionExpiredError,
  SessionNotFoundError,
  SessionStoreError,
} from "./types";

// Middleware
export { session } from "./middleware";

// Session Implementation
export { SessionImpl } from "./session";
export { SessionCookieImpl } from "./session-cookie";

// Session ID Utilities
export {
  extractSessionId,
  generateSessionId,
  generateSessionIds,
  isSignedSessionId,
  isValidSessionId,
  rotateSessionId,
  signSessionId,
  timingSafeEqual,
  unsignSessionId,
  unsignSessionIds,
} from "./session-id";

// ============================================================================
// Store Exports
// ============================================================================

export { FileStore, MemoryStore, RedisStore } from "./stores";
export type { RedisClient } from "./stores";

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Create session middleware with sensible defaults
 */
export function createSession(secret: string, store?: SessionStore) {
  return session({
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: "auto",
      sameSite: "lax",
      maxAge: 86400000, // 24 hours
    },
  });
}

/**
 * Create development session (Memory store with warnings)
 */
export function createDevSession(secret: string) {
  console.warn(
    "⚠️  Using MemoryStore for development. " +
      "Sessions will be lost on restart.",
  );

  return createSession(secret, new MemoryStore());
}

/**
 * Create production session (File store)
 */
export function createProdSession(secret: string, options?: { path?: string }) {
  const store = new FileStore({
    path: options?.path || "./.sessions",
    checkPeriod: 3600000, // 1 hour
  });

  return createSession(secret, store);
}

// ============================================================================
// Re-export for convenience
// ============================================================================

import { session } from "./middleware";
import { FileStore, MemoryStore } from "./stores";
import type { SessionStore } from "./types";
