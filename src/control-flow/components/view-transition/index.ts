/**
 * ViewTransition control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 * React `$$typeof` stamping stays in `react/view-transition.ts`.
 */
export { VIEW_TRANSITION_TYPE } from "../../const.ts";
export {
  ViewTransition,
  isViewTransitionElement,
  renderViewTransitionBlock,
  type ViewTransitionProps,
} from "./client.ts";
