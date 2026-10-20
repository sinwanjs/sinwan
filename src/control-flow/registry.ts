import type { SinwanElement } from "../types.ts";
import type { ComponentInstance } from "../component/instance.ts";
import type {
  MountedNode,
  MountedReactiveBlock,
} from "../renderer/types.ts";
import type { CleanupFn } from "../reactivity/index.ts";

/**
 * Anchor-wrapped control-flow renderer (Show, For, Switch, …).
 */
export type ControlFlowBlockRenderer = (
  element: SinwanElement,
  block: MountedReactiveBlock,
  parent: Node,
  namespace: string | null,
  owner: ComponentInstance | null,
) => CleanupFn;

/**
 * Direct control-flow renderer (Portal — no reactive-block anchors).
 */
export type ControlFlowDirectRenderer = (
  element: SinwanElement,
  parent: Node,
  anchor: Node | null,
  namespace: string | null,
) => MountedNode;

type ControlFlowEntry =
  | { mode: "block"; render: ControlFlowBlockRenderer }
  | { mode: "direct"; render: ControlFlowDirectRenderer };

const byTag = new Map<PropertyKey, ControlFlowEntry>();
const factories = new Map<
  Function,
  (element: SinwanElement) => SinwanElement
>();

/**
 * Register a symbol-tagged control-flow that renders between comment anchors.
 * Pass `factory` so `el(For, props)` expands without creating a component instance.
 */
export function registerControlFlowBlock(
  tag: PropertyKey,
  render: ControlFlowBlockRenderer,
  factory?: Function,
): void {
  byTag.set(tag, { mode: "block", render });
  if (factory) {
    factories.set(factory, (element) => factory(element.props) as SinwanElement);
  }
}

/**
 * Register a symbol-tagged control-flow that mounts without block anchors.
 */
export function registerControlFlowDirect(
  tag: PropertyKey,
  render: ControlFlowDirectRenderer,
  factory?: Function,
): void {
  byTag.set(tag, { mode: "direct", render });
  if (factory) {
    factories.set(factory, (element) => factory(element.props) as SinwanElement);
  }
}

/**
 * Register a factory-only expander (e.g. Visible → intrinsic element).
 */
export function registerControlFlowFactory(
  factory: Function,
  expand: (element: SinwanElement) => SinwanElement,
): void {
  factories.set(factory, expand);
}

/** Expand `el(For, …)` / `el(Visible, …)` when the tag is a registered factory. */
export function expandRegisteredFactory(
  element: SinwanElement,
): SinwanElement | null {
  if (typeof element.tag !== "function") return null;
  const expand = factories.get(element.tag);
  return expand ? expand(element) : null;
}

export function getControlFlowEntry(
  tag: unknown,
): ControlFlowEntry | undefined {
  if (typeof tag !== "symbol" && typeof tag !== "string") return undefined;
  return byTag.get(tag);
}

export function isControlFlowElement(element: SinwanElement): boolean {
  return getControlFlowEntry(element.tag) != null;
}
