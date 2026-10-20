/**
 * SinwanJS Client Renderer — Public API
 *
 * Core mount/render vs hoist web helpers are separate modules so app bundlers
 * can tree-shake. Prefer `sinwan/renderer/web` for `_$createTemplate` / `_$bind*`.
 */

export * from "./core.ts";
export * from "./web.ts";
