/**
 * Development warnings for runtime pitfalls (`SW2xx`, listed in
 * DIAGNOSTICS.md). Each warning prints once per code and message. The body
 * only runs in the development bundle: production defines `__DEV__` as
 * false, so a call costs one empty function call there.
 */

import type { ComponentInstance } from "../component/instance.ts";

/** Runtime diagnostic codes are `SW2xx`; compiler codes (`SW1xx`) live in sinwan-compiler. */
export type DevWarningCode = `SW2${number}`;

const warned = new Set<string>();

/** True in the development bundle (and wherever `__DEV__` is set to true). */
export function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

/** Print `[Sinwan] SW2xx: message` once. No-op outside development. */
export function devWarn(code: DevWarningCode, message: string): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const key = `${code}:${message}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[Sinwan] ${code}: ${message}`);
}

/** `<Name>` of the component that owns a block, for warning messages. */
export function describeOwner(owner: ComponentInstance | null): string {
  if (!owner) return "the root";
  const display: unknown = Reflect.get(owner.component, "_displayName");
  const name =
    typeof display === "string" && display !== ""
      ? display
      : owner.component.name || "Anonymous";
  return `<${name}>`;
}

/** Same keys with `Object.is` values (arrays: same length and items). */
export function shallowEqual(a: object, b: object): boolean {
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(Reflect.get(a, key), Reflect.get(b, key))
    ) {
      return false;
    }
  }
  return true;
}

/** Tests only: forget which warnings were printed. Not exported from `sinwan/dev`. */
export function resetDevWarnings(): void {
  warned.clear();
}
