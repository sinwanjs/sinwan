/**
 * Sinwan-owned symbols mirroring React's well-known type tags.
 *
 * IMPORTANT: keys are namespaced under `sinwan.react.*` (NOT `react.*`)
 * so element identity never collides with a real React install in a host
 * application. This is intentional — the React-compatible API surface is
 * authored from scratch and shares no runtime with React.
 */

export const REACT_ELEMENT_TYPE = Symbol.for("sinwan.react.element");
export const REACT_FRAGMENT_TYPE = Symbol.for("sinwan.react.fragment");
export const REACT_PORTAL_TYPE = Symbol.for("sinwan.react.portal");
export const REACT_PROFILER_TYPE = Symbol.for("sinwan.react.profiler");
export const REACT_STRICT_MODE_TYPE = Symbol.for("sinwan.react.strict_mode");
export const REACT_SUSPENSE_TYPE = Symbol.for("sinwan.react.suspense");
export const REACT_SUSPENSE_LIST_TYPE = Symbol.for("sinwan.react.suspense_list");
export const REACT_CONTEXT_TYPE = Symbol.for("sinwan.react.context");
export const REACT_PROVIDER_TYPE = Symbol.for("sinwan.react.provider");
export const REACT_CONSUMER_TYPE = Symbol.for("sinwan.react.consumer");
export const REACT_FORWARD_REF_TYPE = Symbol.for("sinwan.react.forward_ref");
export const REACT_MEMO_TYPE = Symbol.for("sinwan.react.memo");
export const REACT_LAZY_TYPE = Symbol.for("sinwan.react.lazy");
export const REACT_ACTIVITY_TYPE = Symbol.for("sinwan.react.activity");
export const REACT_VIEW_TRANSITION_TYPE = Symbol.for(
  "sinwan.react.view_transition",
);
export const REACT_USE_REF_TYPE = Symbol.for("sinwan.react.use_ref");
