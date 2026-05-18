import { signal } from "../../reactivity/signal.ts";
import { computed } from "../../reactivity/computed.ts";
import { useSlot, createStateGetter } from "./_internal/bridge.ts";
import { isServer } from "./_internal/is-server.ts";
import type { FormStatus } from "./_types/hooks.ts";

const NOT_PENDING: FormStatus = {
  pending: false,
  data: null,
  method: null,
  action: null,
};

const formStatus = signal<FormStatus>(NOT_PENDING);

/** Internal — used by the `<Form>` wrapper to mark a submission. */
export function _setFormStatus(next: FormStatus): void {
  formStatus.value = next;
}

/**
 * React-compatible `useFormStatus()` — `[CLIENT]`.
 *
 * Reads the status of the nearest enclosing `<Form>` action context. Sinwan
 * tracks form-action state in a request-scoped global signal that the
 * `<Form>` element wrapper updates while a submission is in flight.
 *
 * SSR: safe — always returns the not-pending sentinel.
 * Reactivity: bridge — each property on the returned object is a reactive
 * getter backed by the module-scope signal. Use directly in JSX props
 * (e.g. `disabled={pending}`) so the renderer can track changes.
 *
 * @example
 * ```tsx
 * import { useFormStatus } from "sinwan/react-client";
 *
 * const SubmitButton = () => {
 *   const { pending } = useFormStatus();
 *   return <button type="submit" disabled={pending}>Send</button>;
 * };
 * ```
 */
export function useFormStatus(): FormStatus {
  const slot = useSlot<FormStatus>(() => {
    if (isServer()) return { ...NOT_PENDING };

    return {
      pending: createStateGetter(
        computed(() => formStatus.value.pending),
      ) as any,
      data: createStateGetter(computed(() => formStatus.value.data)) as any,
      method: createStateGetter(computed(() => formStatus.value.method)) as any,
      action: createStateGetter(computed(() => formStatus.value.action)) as any,
    } as FormStatus;
  });

  if (isServer()) return NOT_PENDING;
  return slot;
}
