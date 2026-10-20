/**
 * Portal control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 */
export { PORTAL_TYPE } from "../../const.ts";
export {
  Portal,
  isPortalElement,
  renderPortal,
  resolvePortalTarget,
  type PortalProps,
} from "./client.ts";
