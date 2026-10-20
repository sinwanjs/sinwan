/**
 * Suspense control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 * React `$$typeof` stamping stays in `react/suspense.ts`.
 */
export { SUSPENSE_TYPE } from "../../const.ts";
export {
  Suspense,
  isSuspenseElement,
  renderSuspenseBlock,
  type SuspenseProps,
} from "./client.ts";
