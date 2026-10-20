/**
 * Visible control-flow — public element API (client).
 * Import hydrate/ssr from their modules; do not pull them through this barrel.
 *
 * `<Visible>` expands to an intrinsic element (no symbol tag).
 */
export {
  Visible,
  expandVisibleElement,
  type VisibleProps,
} from "./client.ts";
