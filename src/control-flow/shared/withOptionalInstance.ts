import {
  withInstance,
  type ComponentInstance,
} from "../../component/instance.ts";

/** Run `fn` under `owner` when present; otherwise run unbound. */
export function withOptionalInstance<T>(
  owner: ComponentInstance | null,
  fn: () => T,
): T {
  return owner ? withInstance(owner, fn) : fn();
}
