/**
 * Match control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { MATCH_TYPE } from "../../const.ts";
export {
  Match,
  isMatchElement,
  resolveMatchChildren,
  type MatchProps,
} from "./client.ts";
