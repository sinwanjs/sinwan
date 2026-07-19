/**
 * Runtime guard — true when no DOM globals are available.
 * Used by client-only hooks/components to short-circuit on the server.
 */
export function isServer(): boolean {
  return typeof window === "undefined" || typeof document === "undefined";
}

/**
 * Throw if a CLIENT-only API is invoked during SSR. Used as a friendlier
 * version of `isServer()` for APIs whose semantics make no sense on the server
 * (e.g. `flushSync`, `createPortal` without a portal target).
 */
export function assertClient(api: string): void {
  if (isServer()) {
    throw new Error(
      `[sinwan/react] ${api} cannot run on the server. ` +
        `Wrap usage in a client-only component or guard with isServer().`,
    );
  }
}
