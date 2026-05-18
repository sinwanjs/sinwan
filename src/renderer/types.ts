/// <reference lib="dom" />

/**
 * SinwanJS Client Renderer — Types
 *
 * Type definitions for the client-side DOM renderer.
 */

import type { CleanupFn } from "../reactivity/index.ts";
import type { ComponentInstance } from "../component/instance.ts";

// ─── MountedNode ───────────────────────────────────────────

/** A static text node. */
export interface MountedText {
  type: "text";
  node: Text;
}

/** A reactive text node — updated by an effect when a signal changes. */
export interface MountedReactiveText {
  type: "reactive-text";
  node: Text;
  dispose: CleanupFn;
}

/** A mounted DOM element with its children. */
export interface MountedElement {
  type: "element";
  node: Element;
  children: MountedNode[];
  eventCleanups: CleanupFn[] | null;
  /** Reactive attribute effects to dispose on unmount. */
  attrDisposers: CleanupFn[] | null;
  /** Cleanup for callback/object refs. */
  refCleanup: CleanupFn | null;
}

/** A fragment (multiple sibling nodes). */
export interface MountedFragment {
  type: "fragment";
  children: MountedNode[];
  /** Anchor comment node for positioning. */
  anchor?: Comment | null;
  /** Cleanup functions for template-generated effects and events. */
  disposers?: CleanupFn[];
}

/** A reactive block that swaps DOM when a signal changes (conditional/list). */
export interface MountedReactiveBlock {
  type: "reactive-block";
  dispose: CleanupFn;
  /** Current mounted children (replaced on re-render). */
  children: MountedNode[];
  /** Start anchor. */
  startAnchor: Comment;
  /** End anchor. */
  endAnchor: Comment;
}

/** A mounted component instance. */
export interface MountedComponent {
  type: "component";
  children: MountedNode[];
  disposers: CleanupFn[];
  /** The ComponentInstance for lifecycle hooks (null for anonymous renders). */
  instance: ComponentInstance | null;
}

/** A mounted async node that renders a placeholder until a promise resolves. */
export interface MountedAsync {
  type: "async";
  startAnchor: Comment;
  endAnchor: Comment;
  placeholder: Text;
  /** Resolved content (empty until promise resolves). */
  children: MountedNode[];
  /** True if unmounted before resolution — prevents post-unmount insertion. */
  disposed: boolean;
}

/** A mounted portal whose children live under a target outside its source tree. */
export interface MountedPortal {
  type: "portal";
  anchor: Comment;
  children: MountedNode[];
  dispose: CleanupFn;
  target?: Node;
  targetAnchor?: Comment;
}

/** Union of all mounted node types. */
export type MountedNode =
  | MountedText
  | MountedReactiveText
  | MountedElement
  | MountedFragment
  | MountedReactiveBlock
  | MountedComponent
  | MountedAsync
  | MountedPortal;

// ─── AppInstance ───────────────────────────────────────────

/** Handle returned by mount(). Allows unmounting the app. */
export interface AppInstance {
  /** The root mounted node tree. */
  root: MountedNode;
  /** Unmount the entire app — cleans up effects, events, and DOM. */
  unmount(): void;
}
