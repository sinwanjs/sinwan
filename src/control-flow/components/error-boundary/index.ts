/**
 * ErrorBoundary control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { ERROR_BOUNDARY_TYPE } from "../../const.ts";
export {
  ErrorBoundary,
  errorBoundaryStack,
  hasActiveErrorBoundary,
  isErrorBoundaryElement,
  renderErrorBoundaryBlock,
  type ErrorBoundaryProps,
} from "./client.ts";
