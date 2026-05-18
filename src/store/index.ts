/**
 * SinwanJS Store — Public API
 *
 * Fine-grained reactive stores inspired by SolidJS stores.
 * Fully compatible with Sinwan's signal-based reactivity and
 * therefore works seamlessly with React-integration hooks.
 */

export { createMutable, modifyMutable } from "./mutable.ts";
export {
  createStore,
  type Store,
  type SetStoreFunction,
  type DeepReadonly,
} from "./store.ts";
export { produce, reconcile } from "./modifiers.ts";
export { unwrap } from "./unwrap.ts";
