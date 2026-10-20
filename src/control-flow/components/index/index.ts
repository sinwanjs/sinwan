/**
 * Index control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { INDEX_TYPE } from "../../const.ts";
export {
  Index,
  isIndexElement,
  renderIndexBlock,
  type IndexHydrationSeed,
  type IndexProps,
} from "./client.ts";
