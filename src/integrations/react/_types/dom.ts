/**
 * DOM attribute types — minimal React shaped surface authored from
 * scratch. Sinwan's existing JSX intrinsic elements are richer (see
 * `src/jsx/jsx-types.ts`); these declarations exist so React-typed
 * consumers (`HTMLAttributes<HTMLDivElement>`, `CSSProperties`, etc.)
 * resolve without a `react` import.
 */

import type { Ref } from "./core.ts";
import type {
  ClipboardEventHandler,
  ChangeEventHandler,
  DragEventHandler,
  FocusEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  PointerEventHandler,
  ReactEventHandler,
  TouchEventHandler,
  WheelEventHandler,
} from "./events.ts";

export type CSSProperties = {
  [key: string]: string | number | null | undefined;
};

export interface AriaAttributes {
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "aria-live"?: "off" | "assertive" | "polite";
  "aria-busy"?: boolean | "true" | "false";
  "aria-disabled"?: boolean | "true" | "false";
  "aria-expanded"?: boolean | "true" | "false";
  "aria-pressed"?: boolean | "true" | "false" | "mixed";
  "aria-selected"?: boolean | "true" | "false";
  "aria-controls"?: string;
  "aria-current"?:
    | boolean
    | "false"
    | "true"
    | "page"
    | "step"
    | "location"
    | "date"
    | "time";
  [aria: `aria-${string}`]: string | number | boolean | undefined;
}

export interface DOMAttributes<T> {
  children?: unknown;
  dangerouslySetInnerHTML?: { __html: string };

  // Clipboard
  onCopy?: ClipboardEventHandler<T>;
  onCut?: ClipboardEventHandler<T>;
  onPaste?: ClipboardEventHandler<T>;

  // Focus
  onFocus?: FocusEventHandler<T>;
  onBlur?: FocusEventHandler<T>;

  // Form
  onChange?: ChangeEventHandler<T>;
  onInput?: FormEventHandler<T>;
  onSubmit?: FormEventHandler<T>;
  onReset?: FormEventHandler<T>;
  onInvalid?: FormEventHandler<T>;

  // Keyboard
  onKeyDown?: KeyboardEventHandler<T>;
  onKeyPress?: KeyboardEventHandler<T>;
  onKeyUp?: KeyboardEventHandler<T>;

  // Mouse
  onClick?: MouseEventHandler<T>;
  onContextMenu?: MouseEventHandler<T>;
  onDoubleClick?: MouseEventHandler<T>;
  onMouseDown?: MouseEventHandler<T>;
  onMouseEnter?: MouseEventHandler<T>;
  onMouseLeave?: MouseEventHandler<T>;
  onMouseMove?: MouseEventHandler<T>;
  onMouseOut?: MouseEventHandler<T>;
  onMouseOver?: MouseEventHandler<T>;
  onMouseUp?: MouseEventHandler<T>;

  // Pointer
  onPointerDown?: PointerEventHandler<T>;
  onPointerMove?: PointerEventHandler<T>;
  onPointerUp?: PointerEventHandler<T>;
  onPointerCancel?: PointerEventHandler<T>;
  onPointerEnter?: PointerEventHandler<T>;
  onPointerLeave?: PointerEventHandler<T>;
  onPointerOver?: PointerEventHandler<T>;
  onPointerOut?: PointerEventHandler<T>;

  // Touch
  onTouchCancel?: TouchEventHandler<T>;
  onTouchEnd?: TouchEventHandler<T>;
  onTouchMove?: TouchEventHandler<T>;
  onTouchStart?: TouchEventHandler<T>;

  // Drag
  onDrag?: DragEventHandler<T>;
  onDragEnd?: DragEventHandler<T>;
  onDragEnter?: DragEventHandler<T>;
  onDragExit?: DragEventHandler<T>;
  onDragLeave?: DragEventHandler<T>;
  onDragOver?: DragEventHandler<T>;
  onDragStart?: DragEventHandler<T>;
  onDrop?: DragEventHandler<T>;

  // Scroll / wheel
  onScroll?: ReactEventHandler<T>;
  onWheel?: WheelEventHandler<T>;
}

export interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
  className?: string;
  class?: string;
  id?: string;
  style?: CSSProperties | string;
  title?: string;
  role?: string;
  tabIndex?: number;
  hidden?: boolean;
  draggable?: boolean | "true" | "false";
  contentEditable?: boolean | "true" | "false" | "inherit" | "plaintext-only";
  spellCheck?: boolean;
  translate?: "yes" | "no";
  ref?: Ref<T>;
  key?: string | number;

  // Custom data-* / arbitrary attributes
  [data: `data-${string}`]: string | number | boolean | undefined;
}
