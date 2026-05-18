import { getCurrentInstance } from "../../component/instance.ts";

/**
 * React-compatible `captureOwnerStack()` — `[SHARED]` (dev-only utility).
 *
 * Returns a string describing the current component-instance ownership
 * chain, or `null` if there is no active instance. Designed for use inside
 * error reporters / DevTools-style integrations.
 *
 * SSR: safe.
 * Reactivity: pass-through (reads `getCurrentInstance()` only).
 *
 * @example
 * ```ts
 * import { captureOwnerStack } from "sinwan/react-client";
 *
 * try { doWork(); } catch (e) {
 *   console.error(e, captureOwnerStack());
 * }
 * ```
 */
export function captureOwnerStack(): string | null {
  const instance = getCurrentInstance();
  if (!instance) return null;

  const frames: string[] = [];
  // The current component is part of the call stack, not the owner stack.
  // Walk the parent chain to collect the owners (components that created
  // the current one via JSX).
  let current: typeof instance | null = instance.parent;
  while (current) {
    const name =
      (current.component as { _displayName?: string; name?: string })
        ._displayName ??
      (current.component as { name?: string }).name ??
      "Anonymous";
    frames.push(`    at ${name}`);
    current = current.parent;
  }
  return frames.length > 0 ? frames.join("\n") : null;
}
