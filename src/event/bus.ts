/**
 * SinwanJS Event Bus — Core Implementation
 *
 * A type-safe EventEmitter with namespace support and lifecycle integration.
 * Designed for component communication with automatic cleanup.
 */

export type Listener = (...args: unknown[]) => void;

/**
 * Core event bus implementation with namespace support.
 */
export class SinwanEventBus {
  private events = new Map<string, Set<Listener>>();
  private wildcardListeners = new Map<string, Set<Listener>>();

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  on(event: string, listener: Listener): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to events matching a namespace pattern.
   * Example: on("user:*", handler) matches "user:login", "user:logout", etc.
   */
  onNamespace(pattern: string, listener: Listener): () => void {
    if (!this.wildcardListeners.has(pattern)) {
      this.wildcardListeners.set(pattern, new Set());
    }
    this.wildcardListeners.get(pattern)!.add(listener);
    return () => this.offNamespace(pattern, listener);
  }

  /**
   * Unsubscribe from an event.
   */
  off(event: string, listener: Listener): void {
    this.events.get(event)?.delete(listener);
  }

  /**
   * Unsubscribe from a namespace pattern.
   */
  offNamespace(pattern: string, listener: Listener): void {
    this.wildcardListeners.get(pattern)?.delete(listener);
  }

  /**
   * Emit an event with optional data.
   */
  emit(event: string, ...args: unknown[]): void {
    // Direct listeners
    this.events.get(event)?.forEach((fn) => fn(...args));

    // Namespace pattern listeners
    for (const [pattern, listeners] of this.wildcardListeners) {
      if (this.matchPattern(pattern, event)) {
        listeners.forEach((fn) => fn(event, ...args));
      }
    }
  }

  /**
   * Subscribe to an event that fires only once.
   */
  once(event: string, listener: Listener): () => void {
    const wrapper = (...args: unknown[]) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove all listeners for an event or all events.
   */
  clear(event?: string): void {
    if (event) {
      this.events.delete(event);
      // Also clear matching namespace patterns
      for (const [pattern] of this.wildcardListeners) {
        if (this.matchPattern(pattern, event)) {
          this.wildcardListeners.delete(pattern);
        }
      }
    } else {
      this.events.clear();
      this.wildcardListeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  listenerCount(event: string): number {
    return this.events.get(event)?.size ?? 0;
  }

  /**
   * Check if an event has any listeners.
   */
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Match a namespace pattern against an event name.
   * Supports * wildcard: "user:*" matches "user:login", "user:logout"
   */
  private matchPattern(pattern: string, event: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return event.startsWith(prefix);
    }
    return pattern === event;
  }
}

/**
 * Global event bus instance for app-wide events.
 */
export const globalEventBus = new SinwanEventBus();
