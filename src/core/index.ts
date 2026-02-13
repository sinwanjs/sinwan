/**
 * Core module barrel exports
 *
 * Centralizes all core exports: Application, Request, Response, Errors, Debug, View.
 *
 * @module core
 */

// Application
export { Application, sinwan as createApplication } from "./application";
export type { ApplicationOptions } from "./application";

// Request & Response
export { RequestImpl } from "./request";
export { ResponseImpl } from "./response";

// Errors
export * from "./errors";

// View
export * from "./view";
