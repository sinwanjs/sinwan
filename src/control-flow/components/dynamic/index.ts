/**
 * Dynamic control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { DYNAMIC_TYPE } from "../../const.ts";
export {
  Dynamic,
  createDynamicElement,
  isDynamicElement,
  renderDynamicBlock,
  type DynamicProps,
  type DynamicTag,
} from "./client.ts";
