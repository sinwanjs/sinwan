/**
 * Switch control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { SWITCH_TYPE } from "../../const.ts";
export {
  Switch,
  isSwitchElement,
  renderSwitchBlock,
  resolveSwitchContent,
  findTruthyMatch,
  type SwitchProps,
} from "./client.ts";
