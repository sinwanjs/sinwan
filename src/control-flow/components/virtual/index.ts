/**
 * Virtual control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { VIRTUAL_TYPE } from "../../const.ts";
export {
  Virtual,
  isVirtualElement,
  renderVirtualBlock,
  type VirtualProps,
} from "./client.ts";
