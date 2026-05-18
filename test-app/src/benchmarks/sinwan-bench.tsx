/**
 * Sinwan adapter for the benchmark harness.
 *
 * Mirrors the component shape used by every js-framework-benchmark entry:
 *   <table>
 *     <tbody>
 *       <For each={rows} key={r => r.id}>
 *         {(row) => <tr><td>{row.id}</td><td>{row.label}</td></tr>}
 *       </For>
 *     </tbody>
 *   </table>
 *
 * Reactivity notes:
 *  - `rows` is a single signal holding the full array. Replacing `.value`
 *    drives keyed diffing inside <For>, which is the exact code path used
 *    in real apps — we deliberately do NOT bypass <For> via direct DOM.
 *  - For the UPDATE test we clone the row object (new reference for the
 *    changed row only) so the keyed diff has to update exactly one <td>.
 *  - `batch` is NOT required here: writes are single-assignments to the
 *    array signal, which already triggers one reactive flush.
 */

import { signal, type Signal } from "sinwan/reactivity";
import { mount } from "sinwan/renderer";
import { cc, For } from "sinwan/component";
import type { Row } from "./data.ts";
import type { FrameworkAdapter } from "./harness.ts";

export function createSinwanAdapter(): FrameworkAdapter {
  let rowsSignal: Signal<readonly Row[]> | null = null;
  let app: { unmount(): void } | null = null;

  const Table = cc(() => {
    const rows = signal<readonly Row[]>([]);
    rowsSignal = rows;
    return (
      <table class="bench-table">
        <tbody>
          {/* `key` collides with JSX IntrinsicAttributes.key (string|number),
              so pass via spread to preserve the ForProps signature. */}
          <For each={rows} {...({ key: (r: Row) => r.id } as object)}>
            {(row: Row) => (
              <tr>
                <td class="col-id">{row.id}</td>
                <td class="col-label">{row.label}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    );
  });

  return {
    name: "sinwan",

    mount(container) {
      app = mount(Table, container);
    },

    setRows(rows) {
      rowsSignal!.value = rows;
    },

    updateRow(index, newLabel) {
      const current = rowsSignal!.peek();
      const next = current.slice();
      // New object reference so keyed <For> patches this row's <td>.
      next[index] = { ...next[index]!, label: newLabel };
      rowsSignal!.value = next;
    },

    swapRows(a, b) {
      const current = rowsSignal!.peek();
      const next = current.slice();
      const tmp = next[a]!;
      next[a] = next[b]!;
      next[b] = tmp;
      rowsSignal!.value = next;
    },

    clear() {
      rowsSignal!.value = [];
    },

    unmount() {
      app?.unmount();
      app = null;
      rowsSignal = null;
    },
  };
}
