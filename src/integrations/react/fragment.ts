/**
 * React-compatible `Fragment` — `[SHARED]`.
 *
 * SSR: safe (pure symbol).
 * Reactivity: pass-through — Sinwan's existing Fragment symbol (from the
 * JSX runtime) is the source of truth. Re-exporting it ensures
 * `<>...</>` and `<Fragment>...</Fragment>` resolve to the same node.
 *
 * @example
 * ```tsx
 * import { Fragment } from "sinwan/react-client";
 *
 * const Group = () => (
 *   <Fragment>
 *     <span>a</span>
 *     <span>b</span>
 *   </Fragment>
 * );
 * ```
 */
export { Fragment } from "../../jsx/jsx-runtime.ts";
