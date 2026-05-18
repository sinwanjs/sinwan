import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement } from "../../types.ts";
import { ACTIVITY_TYPE } from "../../component/control-flow.ts";
import { REACT_ACTIVITY_TYPE } from "./_internal/symbols.ts";

export type ActivityMode = "visible" | "hidden";

export interface ActivityProps {
  mode?: ActivityMode;
  children?: ReactNode;
}

/**
 * React-compatible `<Activity>` — `[CLIENT]`.
 *
 *   <Activity mode="visible" | "hidden">{children}</Activity>
 *
 * `mode="visible"` renders children normally. `mode="hidden"` keeps the
 * children mounted but visually hides them with `display: none`,
 * preserving both DOM state and component state. When hidden, all
 * Effects inside the boundary are cleaned up; when shown again they are
 * re-created.
 *
 * SSR: safe — hidden subtrees are still emitted (matches React).
 * Reactivity: the `mode` prop is tracked reactively so dynamic toggles
 * work without remounting the parent.
 *
 * @example
 * ```tsx
 * import { Activity } from "sinwan/react-client";
 *
 * <Activity mode={tab === "settings" ? "visible" : "hidden"}>
 *   <SettingsPanel />
 * </Activity>
 * ```
 */
export function Activity(props: ActivityProps): SinwanElement {
  return {
    tag: ACTIVITY_TYPE,
    props: {
      mode: props.mode ?? "visible",
      children: props.children,
    },
    children: [],
  };
}

(Activity as unknown as { $$typeof: symbol }).$$typeof = REACT_ACTIVITY_TYPE;
(Activity as unknown as { _SinwanComponent?: true })._SinwanComponent = true;
