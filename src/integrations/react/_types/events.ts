/**
 * Synthetic event types — React shaped, authored from scratch.
 *
 * Sinwan events are native DOM events; these wrappers exist purely to satisfy
 * React-typed call sites. Currently the `nativeEvent` is the underlying
 * native DOM event and the synthetic-event extras (preventDefault forwarding,
 * etc.) delegate to it. No React internals are imported.
 */

export interface BaseSyntheticEvent<E = object, C = unknown, T = unknown> {
  nativeEvent: E;
  currentTarget: C;
  target: T;
  bubbles: boolean;
  cancelable: boolean;
  defaultPrevented: boolean;
  eventPhase: number;
  isTrusted: boolean;
  preventDefault(): void;
  isDefaultPrevented(): boolean;
  stopPropagation(): void;
  isPropagationStopped(): boolean;
  persist(): void;
  timeStamp: number;
  type: string;
}

export interface SyntheticEvent<
  T = Element,
  E = Event,
> extends BaseSyntheticEvent<E, EventTarget & T, EventTarget> {}

export interface UIEvent<
  T = Element,
  E extends UIEvent_DOM = UIEvent_DOM,
> extends SyntheticEvent<T, E> {
  detail: number;
  view: AbstractView;
}

export interface AbstractView {
  styleMedia: unknown;
  document: Document;
}

// Re-export native DOM names under aliases that match React's module shape.
type UIEvent_DOM = globalThis.UIEvent;

export interface MouseEvent<
  T = Element,
  E extends globalThis.MouseEvent = globalThis.MouseEvent,
> extends UIEvent<T, E> {
  altKey: boolean;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  getModifierState(key: string): boolean;
  metaKey: boolean;
  movementX: number;
  movementY: number;
  pageX: number;
  pageY: number;
  relatedTarget: EventTarget | null;
  screenX: number;
  screenY: number;
  shiftKey: boolean;
}

export interface PointerEvent<T = Element> extends MouseEvent<
  T,
  globalThis.PointerEvent
> {
  pointerId: number;
  pressure: number;
  tangentialPressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  width: number;
  height: number;
  pointerType: "mouse" | "pen" | "touch";
  isPrimary: boolean;
}

export interface KeyboardEvent<T = Element> extends UIEvent<
  T,
  globalThis.KeyboardEvent
> {
  altKey: boolean;
  charCode: number;
  ctrlKey: boolean;
  code: string;
  key: string;
  keyCode: number;
  locale: string;
  location: number;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  which: number;
  getModifierState(key: string): boolean;
}

export interface FocusEvent<T = Element, R = Element> extends SyntheticEvent<
  T,
  globalThis.FocusEvent
> {
  relatedTarget: (EventTarget & R) | null;
  target: EventTarget & T;
}

export interface FormEvent<T = Element> extends SyntheticEvent<
  T,
  globalThis.Event
> {}

export interface InvalidEvent<T = Element> extends SyntheticEvent<T> {
  target: EventTarget & T;
}

export interface ChangeEvent<T = Element> extends SyntheticEvent<T> {
  target: EventTarget & T;
}

export interface InputEvent<T = Element> extends SyntheticEvent<
  T,
  globalThis.InputEvent
> {
  data: string | null;
  dataTransfer: DataTransfer | null;
  inputType: string;
  isComposing: boolean;
}

export interface ClipboardEvent<T = Element> extends SyntheticEvent<
  T,
  globalThis.ClipboardEvent
> {
  clipboardData: DataTransfer;
}

export interface DragEvent<T = Element> extends MouseEvent<
  T,
  globalThis.DragEvent
> {
  dataTransfer: DataTransfer;
}

export interface TouchEvent<T = Element> extends UIEvent<
  T,
  globalThis.TouchEvent
> {
  altKey: boolean;
  changedTouches: TouchList;
  ctrlKey: boolean;
  getModifierState(key: string): boolean;
  metaKey: boolean;
  shiftKey: boolean;
  targetTouches: TouchList;
  touches: TouchList;
}

export interface WheelEvent<T = Element> extends MouseEvent<
  T,
  globalThis.WheelEvent
> {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
}

export interface AnimationEvent<T = Element> extends SyntheticEvent<
  T,
  globalThis.AnimationEvent
> {
  animationName: string;
  elapsedTime: number;
  pseudoElement: string;
}

export interface TransitionEvent<T = Element> extends SyntheticEvent<
  T,
  globalThis.TransitionEvent
> {
  elapsedTime: number;
  propertyName: string;
  pseudoElement: string;
}

// ─── Handler helpers ───────────────────────────────────────

export type EventHandler<E extends SyntheticEvent<any>> = (event: E) => void;

export type ReactEventHandler<T = Element> = EventHandler<SyntheticEvent<T>>;
export type ClipboardEventHandler<T = Element> = EventHandler<
  ClipboardEvent<T>
>;
export type DragEventHandler<T = Element> = EventHandler<DragEvent<T>>;
export type FocusEventHandler<T = Element> = EventHandler<FocusEvent<T>>;
export type FormEventHandler<T = Element> = EventHandler<FormEvent<T>>;
export type ChangeEventHandler<T = Element> = EventHandler<ChangeEvent<T>>;
export type KeyboardEventHandler<T = Element> = EventHandler<KeyboardEvent<T>>;
export type MouseEventHandler<T = Element> = EventHandler<MouseEvent<T>>;
export type TouchEventHandler<T = Element> = EventHandler<TouchEvent<T>>;
export type PointerEventHandler<T = Element> = EventHandler<PointerEvent<T>>;
export type UIEventHandler<T = Element> = EventHandler<UIEvent<T>>;
export type WheelEventHandler<T = Element> = EventHandler<WheelEvent<T>>;
export type AnimationEventHandler<T = Element> = EventHandler<
  AnimationEvent<T>
>;
export type TransitionEventHandler<T = Element> = EventHandler<
  TransitionEvent<T>
>;
