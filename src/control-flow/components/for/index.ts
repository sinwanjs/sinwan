/**
 * For control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { FOR_TYPE } from "../../const.ts";
export {
  For,
  isForElement,
  renderForBlock,
  __reconcileDomArraysForTests,
  type ForHydrationSeed,
  type ForProps,
  type ForRecord,
} from "./client.ts";
