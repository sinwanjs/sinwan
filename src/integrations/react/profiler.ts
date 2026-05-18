import type { ReactNode } from "./_types/core.ts";
import type { SinwanElement } from "../../types.ts";
import { onMounted, onUpdated } from "../../component/lifecycle.ts";
import { isServer } from "./_internal/is-server.ts";
import { REACT_PROFILER_TYPE } from "./_internal/symbols.ts";

export type ProfilerOnRender = (
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
) => void;

export interface ProfilerProps {
  id: string;
  onRender: ProfilerOnRender;
  children?: ReactNode;
}

/**
 * React-compatible `<Profiler>` — `[CLIENT]`.
 *
 * Sinwan does not maintain a fiber tree, so the profiler is a measurement
 * shim: it records `performance.now()` deltas around setup + mount and
 * forwards them to the user-supplied `onRender` callback. Phases other
 * than `"mount"` are reported as `"update"` whenever the inner subtree's
 * `onUpdated` lifecycle fires.
 *
 * SSR: safe — no measurement on the server (callback never fires).
 * Reactivity: native.
 *
 * @example
 * ```tsx
 * import { Profiler } from "sinwan/react-client";
 *
 * <Profiler id="App" onRender={(id, phase, dur) => console.log(id, phase, dur)}>
 *   <App />
 * </Profiler>
 * ```
 */
export function Profiler(props: ProfilerProps): SinwanElement {
  if (!isServer()) {
    const setupStart = performance.now();
    onMounted(() => {
      const commit = performance.now();
      props.onRender(
        props.id,
        "mount",
        commit - setupStart,
        commit - setupStart,
        setupStart,
        commit,
      );
    });
    onUpdated(() => {
      const commit = performance.now();
      props.onRender(props.id, "update", 0, 0, commit, commit);
    });
  }
  return { tag: "", props: {}, children: [props.children as any] };
}
(Profiler as unknown as { $$typeof: symbol }).$$typeof = REACT_PROFILER_TYPE;
(Profiler as unknown as { _SinwanComponent?: true })._SinwanComponent = true;
