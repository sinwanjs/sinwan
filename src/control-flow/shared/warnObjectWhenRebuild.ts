import type { ComponentInstance } from "../../component/instance.ts";
import { describeOwner, devWarn, shallowEqual } from "../../dev/warn.ts";

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * SW201: a `when` compared by identity changed from one object to another,
 * and the rebuild it caused was avoidable — the children do not receive the
 * value, or the new value equals the old one. Development bundle only.
 */
export function warnObjectWhenRebuild(
  tag: string,
  previous: unknown,
  next: unknown,
  childrenUseValue: boolean,
  owner: ComponentInstance | null,
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (!isObject(previous) || !isObject(next)) return;
  const equal = shallowEqual(previous, next);
  if (childrenUseValue && !equal) return;
  const reason = equal
    ? "an equal copy of the previous value"
    : "a new object that its children do not receive";
  devWarn(
    "SW201",
    `<${tag}> in ${describeOwner(owner)} rebuilt its content because \`when\` changed to ${reason}; focus and local state inside were lost. Pass a boolean (when={!!x}) and read the value in the children, or keep the object stable (computed, or update it in place).`,
  );
}
