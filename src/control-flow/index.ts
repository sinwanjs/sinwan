/**
 * SinwanJS Control Flow — Public API (`sinwan/control-flow`)
 *
 * Each primitive registers its client renderer when its module loads. The
 * published build rewrites this file as thin per-primitive re-exports so app
 * bundlers drop the primitives an app does not import.
 */

export {
  Show,
  type ShowProps,
} from "./components/show/client.ts";
export {
  For,
  type ForProps,
} from "./components/for/client.ts";
export {
  Switch,
  type SwitchProps,
} from "./components/switch/client.ts";
export {
  Match,
  type MatchProps,
} from "./components/match/client.ts";
export {
  Index,
  type IndexProps,
} from "./components/index/client.ts";
export {
  Key,
  type KeyProps,
} from "./components/key/client.ts";
export {
  Dynamic,
  type DynamicProps,
  type DynamicTag,
} from "./components/dynamic/client.ts";
export {
  Visible,
  type VisibleProps,
} from "./components/visible/client.ts";
export {
  Portal,
  type PortalProps,
} from "./components/portal/client.ts";
export {
  ErrorBoundary,
  type ErrorBoundaryProps,
} from "./components/error-boundary/client.ts";
export {
  Virtual,
  type VirtualProps,
} from "./components/virtual/client.ts";
