/**
 * Key control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { KEY_TYPE } from "../../const.ts";
export {
  Key,
  isKeyElement,
  renderKeyBlock,
  resolveKeyChildren,
  type KeyProps,
} from "./client.ts";
