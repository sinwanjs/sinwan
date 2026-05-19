/**
 * SinwanJS Event Bus — SSR Context
 *
 * Request-scoped event bus isolation for SSR safety.
 * Each server request gets its own event bus to prevent cross-request leaks.
 */

import { SinwanEventBus } from "./bus.ts";
import type { SinwanEventBus as SinwanEventBusType } from "./bus.ts";

/**
 * SSR context containing a request-scoped event bus.
 */
export interface SSRContext {
  /** Request-scoped event bus */
  eventBus: SinwanEventBusType;
  /** Additional request-scoped state */
  state: Map<string, unknown>;
}

/**
 * Create a fresh SSR context with a new event bus.
 * Call this for each server request to ensure isolation.
 */
export function createSSRContext(): SSRContext {
  return {
    eventBus: new SinwanEventBus(),
    state: new Map(),
  };
}

/**
 * Global SSR context slot (server-side only).
 * Anchored on globalThis to work across bundle boundaries.
 */
const SSR_CONTEXT_KEY = Symbol.for("sinwan.ssrContext");
type GlobalSlot = {
  [SSR_CONTEXT_KEY]?: SSRContext | null;
};

/**
 * Get the current SSR context (server-side only).
 */
export function getSSRContext(): SSRContext | null {
  if (typeof window !== "undefined") return null; // Client-side
  const globalSlot = globalThis as unknown as GlobalSlot;
  return globalSlot[SSR_CONTEXT_KEY] ?? null;
}

/**
 * Set the current SSR context (server-side only).
 */
export function setSSRContext(context: SSRContext | null): SSRContext | null {
  if (typeof window !== "undefined") return null; // Client-side
  const globalSlot = globalThis as unknown as GlobalSlot;
  const prev = globalSlot[SSR_CONTEXT_KEY] ?? null;
  globalSlot[SSR_CONTEXT_KEY] = context;
  return prev;
}

/**
 * Run a function with a specific SSR context.
 * Automatically restores the previous context when done.
 */
export function withSSRContext<T>(context: SSRContext, fn: () => T): T {
  const prev = setSSRContext(context);
  try {
    return fn();
  } finally {
    setSSRContext(prev);
  }
}

/**
 * Get the appropriate event bus for the current environment:
 * - Server: returns the request-scoped event bus from SSR context
 * - Client: returns the provided fallback (default: global bus)
 */
export function getCurrentEventBus(
  fallback: SinwanEventBusType,
): SinwanEventBusType {
  const ssrContext = getSSRContext();
  return ssrContext?.eventBus ?? fallback;
}
