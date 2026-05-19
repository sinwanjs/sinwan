/**
 * SinwanJS Event Bus — Component Hook
 *
 * React-style hook for subscribing to events with automatic cleanup.
 * Integrates with Sinwan's component lifecycle system.
 */

import type { Listener } from "./bus.ts";
import { getCurrentInstance } from "../component/instance.ts";
import { onUnmounted } from "../component/lifecycle.ts";
import type { SinwanEventBus } from "./bus.ts";
import { globalEventBus } from "./bus.ts";

/**
 * Subscribe to an event within a component.
 * Automatically unsubscribes when the component unmounts.
 *
 * @example
 * ```tsx
 * const UserProfile = cc(() => {
 *   useEvent("user:login", (user) => {
 *     console.log("User logged in:", user);
 *   });
 *
 *   return <div>User Profile</div>;
 * });
 * ```
 */
export function useEvent(
  event: string,
  handler: Listener,
  bus: SinwanEventBus = globalEventBus,
): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("useEvent() called outside of component setup.");
  }

  const unsubscribe = bus.on(event, handler);
  onUnmounted(unsubscribe);
}

/**
 * Subscribe to a namespace pattern within a component.
 * Automatically unsubscribes when the component unmounts.
 *
 * @example
 * ```tsx
 * const ChatListener = cc(() => {
 *   useEventNamespace("chat:*", (event, data) => {
 *     console.log("Chat event:", event, data);
 *   });
 *
 *   return <div>Chat</div>;
 * });
 * ```
 */
export function useEventNamespace(
  pattern: string,
  handler: Listener,
  bus: SinwanEventBus = globalEventBus,
): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("useEventNamespace() called outside of component setup.");
  }

  const unsubscribe = bus.onNamespace(pattern, handler);
  onUnmounted(unsubscribe);
}

/**
 * Subscribe to an event that fires only once within a component.
 * Automatically unsubscribes when the component unmounts.
 *
 * @example
 * ```tsx
 * const InitializeOnce = cc(() => {
 *   useEventOnce("app:init", () => {
 *     console.log("App initialized");
 *   });
 *
 *   return <div>App</div>;
 * });
 * ```
 */
export function useEventOnce(
  event: string,
  handler: Listener,
  bus: SinwanEventBus = globalEventBus,
): void {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error("useEventOnce() called outside of component setup.");
  }

  const unsubscribe = bus.once(event, handler);
  onUnmounted(unsubscribe);
}
