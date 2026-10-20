/**
 * Activity control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { ACTIVITY_TYPE } from "../../const.ts";
export {
  Activity,
  isActivityElement,
  renderActivityBlock,
  type ActivityMode,
  type ActivityProps,
} from "./client.ts";
