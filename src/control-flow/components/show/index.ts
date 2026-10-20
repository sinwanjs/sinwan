/**
 * Show control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { SHOW_TYPE } from "../../const.ts";
export {
  Show,
  isShowElement,
  renderShowBlock,
  resolveShowChildren,
  type ShowProps,
} from "./client.ts";
