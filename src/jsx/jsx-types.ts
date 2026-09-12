/**
 * SinwanJS JSX Type Definitions
 *
 * Uses native DOM element types for props — no React compat (no className,
 * no camelCase event handlers). Enhanced element props (formAction as function,
 * defaultValue, precedence, etc.) are layered on top via intersection types.
 */

import type { Properties as CSSProperties } from "csstype";
import type { Reactive, SinwanNode, SinwanSlots } from "../types.ts";

// ─── Children Type ──────────────────────────────────────────

export type JSXChildren = SinwanNode | SinwanSlots;

// ─── Native Props Helper ────────────────────────────────────

/**
 * Widen native DOM property types to also accept plain strings and numbers.
 * HTML and SVG attributes are strings (or numbers) at the markup level, but
 * the DOM interfaces expose many of them as specialized objects (e.g.
 * SVGAnimatedString, SVGAnimatedLength, boolean). This keeps the native type
 * valid while also allowing string/number attribute values, and leaves
 * function-typed properties (event handlers, element methods) unchanged.
 */
type AllowString<T> = [T] extends [(...args: any[]) => any]
  ? T
  : [T] extends [string]
    ? T
    : T | string | number;

/**
 * Non-function DOM/JSX attributes accept a plain value, a Signal, a Computed,
 * or a zero-arity getter — matching `resolve` / `isReactive` at runtime.
 * Function-typed properties (methods, callbacks) are left unchanged so they
 * are not confused with reactive getters.
 */
type ReactiveDomProp<T> = [T] extends [(...args: any[]) => any]
  ? T
  : Reactive<AllowString<T>>;

/**
 * Wrap a curated attribute interface so every non-function field accepts
 * `Reactive<T>`. Tuple-wraps the function check so a union that includes a
 * callback (e.g. `string | ((formData) => void)`) is still made reactive
 * rather than treated as an event handler.
 */
type MakeReactive<T> = {
  [K in keyof T]: [NonNullable<T[K]>] extends [(...args: any[]) => any]
    ? T[K]
    : Reactive<T[K]>;
};

/**
 * Used to represent DOM API's where users can either pass
 * true or false as a boolean or as its equivalent strings.
 */
type Booleanish = boolean | "true" | "false";

// All the WAI-ARIA 1.1 role attribute values from https://www.w3.org/TR/wai-aria-1.1/#role_definitions
type AriaRole =
  | "alert"
  | "alertdialog"
  | "application"
  | "article"
  | "banner"
  | "button"
  | "cell"
  | "checkbox"
  | "columnheader"
  | "combobox"
  | "complementary"
  | "contentinfo"
  | "definition"
  | "dialog"
  | "directory"
  | "document"
  | "feed"
  | "figure"
  | "form"
  | "grid"
  | "gridcell"
  | "group"
  | "heading"
  | "img"
  | "link"
  | "list"
  | "listbox"
  | "listitem"
  | "log"
  | "main"
  | "marquee"
  | "math"
  | "menu"
  | "menubar"
  | "menuitem"
  | "menuitemcheckbox"
  | "menuitemradio"
  | "navigation"
  | "none"
  | "note"
  | "option"
  | "presentation"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "region"
  | "row"
  | "rowgroup"
  | "rowheader"
  | "scrollbar"
  | "search"
  | "searchbox"
  | "separator"
  | "slider"
  | "spinbutton"
  | "status"
  | "switch"
  | "tab"
  | "table"
  | "tablist"
  | "tabpanel"
  | "term"
  | "textbox"
  | "timer"
  | "toolbar"
  | "tooltip"
  | "tree"
  | "treegrid"
  | "treeitem"
  | (string & {});

type HTMLAttributeReferrerPolicy =
  | ""
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

type HTMLAttributeAnchorTarget =
  | "_self"
  | "_blank"
  | "_parent"
  | "_top"
  | (string & {});

type HTMLInputTypeAttribute =
  | "button"
  | "checkbox"
  | "color"
  | "date"
  | "datetime-local"
  | "email"
  | "file"
  | "hidden"
  | "image"
  | "month"
  | "number"
  | "password"
  | "radio"
  | "range"
  | "reset"
  | "search"
  | "submit"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week"
  | (string & {});

type AutoFillAddressKind = "billing" | "shipping";
type AutoFillBase = "" | "off" | "on";
type AutoFillContactField =
  | "email"
  | "tel"
  | "tel-area-code"
  | "tel-country-code"
  | "tel-extension"
  | "tel-local"
  | "tel-local-prefix"
  | "tel-local-suffix"
  | "tel-national";
type AutoFillContactKind = "home" | "mobile" | "work";
type AutoFillCredentialField = "webauthn";
type AutoFillNormalField =
  | "additional-name"
  | "address-level1"
  | "address-level2"
  | "address-level3"
  | "address-level4"
  | "address-line1"
  | "address-line2"
  | "address-line3"
  | "bday-day"
  | "bday-month"
  | "bday-year"
  | "cc-csc"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-family-name"
  | "cc-given-name"
  | "cc-name"
  | "cc-number"
  | "cc-type"
  | "country"
  | "country-name"
  | "current-password"
  | "family-name"
  | "given-name"
  | "honorific-prefix"
  | "honorific-suffix"
  | "name"
  | "new-password"
  | "one-time-code"
  | "organization"
  | "postal-code"
  | "street-address"
  | "transaction-amount"
  | "transaction-currency"
  | "username";
type OptionalPrefixToken<T extends string> = `${T} ` | "";
type OptionalPostfixToken<T extends string> = ` ${T}` | "";
type AutoFillField =
  | AutoFillNormalField
  | `${OptionalPrefixToken<AutoFillContactKind>}${AutoFillContactField}`;
type AutoFillSection = `section-${string}`;
type AutoFill =
  | AutoFillBase
  | `${OptionalPrefixToken<AutoFillSection>}${OptionalPrefixToken<AutoFillAddressKind>}${AutoFillField}${OptionalPostfixToken<AutoFillCredentialField>}`;
type HTMLInputAutoCompleteAttribute = AutoFill | (string & {});

/**
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin MDN}
 */
type CrossOrigin = "anonymous" | "use-credentials" | "" | undefined;

// ─── Typed Event Handlers ───────────────────────────────────
//
// Sinwan binds events directly to the element (addEventListener, no
// delegation), so at runtime `event.currentTarget` is always the element the
// handler is attached to. The DOM lib already maps each `on*` property to its
// correct event class (onclick → PointerEvent, oninput → InputEvent,
// onkeydown → KeyboardEvent, onsubmit → SubmitEvent, …). We only need to
// (a) pull that event class out and (b) narrow `currentTarget`/`target` to the
// element type — so `event.currentTarget.value` works with no manual cast.

/**
 * Remove string/number index signatures from a type, keeping only its
 * explicitly-declared keys. Some DOM interfaces (notably `HTMLFormElement`,
 * which supports legacy `form["fieldName"]` access) carry a `[name: string]: …`
 * index signature. If left in place, that signature leaks into `NativeProps` as
 * a `[key: string]: any` member and silently widens every prop — including
 * event handlers — back to `any`, defeating the typed-event narrowing below.
 */
type StripIndex<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : K]: T[K];
};

/**
 * Extract the native DOM event class from an `on*` handler property.
 * Strips `null`/`undefined` first, then infers the event parameter. Falls back
 * to `Event` when the property isn't a function or carries a non-Event payload
 * (e.g. `onerror`, whose signature also accepts a `string`).
 */
type EventOf<H> =
  NonNullable<H> extends (this: any, ev: infer E) => any
    ? E extends Event
      ? E
      : Event
    : Event;

/**
 * A Sinwan JSX event handler: keeps the native DOM event class (MouseEvent,
 * KeyboardEvent, InputEvent, …) but narrows `currentTarget` to the element the
 * handler is bound to and `target` to the same element type — eliminating the
 * `event.target as HTMLInputElement` boilerplate.
 *
 * `currentTarget` is always the bound element (guaranteed by direct binding).
 * `target` is narrowed to the element too, matching the React/Solid convention
 * for ergonomics; for bubbled events it may actually be a descendant, so prefer
 * `currentTarget` when in doubt.
 */
type SinwanEventHandler<T extends Element, H> = (
  event: EventOf<H> & {
    currentTarget: T;
    target: T;
  },
) => void;

/**
 * Extract native DOM attributes from element type T, override children/style/class,
 * and add JSX-specific props (ref, key).
 * @template T - The DOM element type to extract props from
 * @property children - Child elements to render inside this element
 * @property style - Inline styles as a CSSStyleDeclaration object or CSS string
 * @property class - CSS class name(s) for the element
 * @property ref - Callback ref or ref object for accessing the DOM element
 * @property key - Unique identifier for list reconciliation
 * @property data-* - Custom data attributes
 */
type NativeProps<T extends Element> = {
  // Event handlers: narrow currentTarget/target to T (key-remapped subset).
  [K in keyof Omit<
    StripIndex<T>,
    "children" | "attributes" | "style" | "classList" | "dataset"
  > as K extends `on${string}` ? K : never]?: SinwanEventHandler<T, T[K]>;
} & {
  // Non-event native DOM properties (plain value, Signal, Computed, or getter).
  [K in keyof Omit<
    StripIndex<T>,
    "children" | "attributes" | "style" | "classList" | "dataset"
  > as K extends `on${string}` ? never : K]?: ReactiveDomProp<T[K]>;
} & {
  /** Child elements to render inside this element */
  children?: JSXChildren;
  /** Inline styles as a CSSProperties object or CSS string */
  style?: Reactive<CSSProperties | string>;
  /** CSS class name(s) for the element */
  class?: Reactive<string>;
  /** Callback ref or ref object for accessing the DOM element */
  ref?: ((el: T | null) => void) | { current: T | null } | null;
  /** Unique identifier for list reconciliation */
  key?: string | number;
  /** Custom data attributes */
  [key: `data-${string}`]: Reactive<string | number | boolean | undefined>;
};

/**
 * Merge a Sinwan props type with a native HTML/SVG attribute interface.
 *
 * Keys declared on `Attrs` override the DOM-derived types from `Props`, so
 * the curated literal unions (e.g. `target`, `crossOrigin`, `autocomplete`,
 * `type`, `role`, `aria-*`, `popover`) win over the looser DOM `string` /
 * `boolean` types that `NativeProps` pulls in via `keyof T`. Everything else
 * on `Props` — `children`, `style`, `class`, `ref`, `key`, `data-*`, and all
 * remaining native DOM properties — is preserved unchanged. Curated fields
 * are wrapped with `MakeReactive` so `role`, `aria-*`, `type`, etc. accept
 * Signals and getters the same way native DOM properties do.
 *
 * This is what gives Sinwan JSX a native, IDE-friendly feel: every element
 * keeps its real DOM typings while gaining the polished attribute unions
 * developers expect from a pro framework.
 */
type MergeAttrs<P extends object, Attrs extends object> = Omit<P, keyof Attrs> &
  MakeReactive<Attrs>;

// ─── Enhanced Element Props ─────────────────────────────────
//
// These extend NativeProps for tags intercepted by enhanced-elements.ts.
// Each enhanced tag gets the extra props its transformer accepts.

/**
 * Enhanced form element props.
 * @property action - Form action URL or async function handler for form submission
 */
type FormProps = Omit<NativeProps<HTMLFormElement>, "action"> & {
  /** Form action URL or async function handler for form submission */
  action?: Reactive<string> | ((formData: FormData) => void | Promise<void>);
};

/**
 * Enhanced input element props.
 * @property defaultValue - Initial value for uncontrolled inputs
 * @property defaultChecked - Initial checked state for uncontrolled checkboxes/radios
 * @property formAction - Override form action for this submitter
 */
type InputProps = Omit<NativeProps<HTMLInputElement>, "formAction"> & {
  /** Initial value for uncontrolled inputs */
  defaultValue?: string;
  /** Initial checked state for uncontrolled checkboxes/radios */
  defaultChecked?: boolean;
  /** Override form action for this submitter */
  formAction?: Reactive<string> | ((formData: FormData) => void | Promise<void>);
};

/**
 * Enhanced button element props.
 * @property formAction - Override form action for this submitter
 */
type ButtonProps = Omit<NativeProps<HTMLButtonElement>, "formAction" | "type"> & {
  /** Override form action for this submitter */
  formAction?: Reactive<string> | ((formData: FormData) => void | Promise<void>);
  type?: Reactive<"submit" | "reset" | "button"> | undefined;
};

/**
 * Enhanced select element props.
 * @property defaultValue - Initial selected value(s) for uncontrolled selects
 */
type SelectProps = Omit<NativeProps<HTMLSelectElement>, "defaultValue"> & {
  /** Initial selected value(s) for uncontrolled selects */
  defaultValue?: string | string[];
};

/**
 * Enhanced textarea element props.
 * @property defaultValue - Initial value for uncontrolled textareas
 */
type TextareaProps = NativeProps<HTMLTextAreaElement> & {
  /** Initial value for uncontrolled textareas */
  defaultValue?: string;
};

/**
 * Enhanced option element props.
 * @property selected - Disabled; use parent select's value/defaultValue instead
 */
type OptionProps = Omit<NativeProps<HTMLOptionElement>, "selected"> & {
  /** Disabled; use parent select's value/defaultValue instead */
  selected?: never;
};

/**
 * Enhanced progress element props.
 * @property value - Current progress value (null for indeterminate)
 */
type ProgressProps = Omit<NativeProps<HTMLProgressElement>, "value"> & {
  /** Current progress value (null for indeterminate) */
  value?: Reactive<number | null>;
};

/**
 * Enhanced link element props for stylesheet loading.
 * @property precedence - Stylesheet loading priority for head ordering
 * @property disabled - Whether the stylesheet is disabled
 */
type LinkProps = Omit<NativeProps<HTMLLinkElement>, "disabled"> & {
  /** Stylesheet loading priority for head ordering */
  precedence?: Reactive<string>;
  /** Whether the stylesheet is disabled */
  disabled?: Reactive<boolean>;
};

/**
 * Enhanced style element props for inline stylesheets.
 * @property precedence - Stylesheet loading priority for head ordering
 * @property href - Unique identifier for deduplication
 */
type StyleProps = Omit<NativeProps<HTMLStyleElement>, "href"> & {
  /** Stylesheet loading priority for head ordering */
  precedence?: Reactive<string>;
  /** Unique identifier for deduplication */
  href?: Reactive<string>;
};

/**
 * Enhanced title element props.
 * @property children - Document title text (must be a string)
 */
type TitleProps = NativeProps<HTMLTitleElement> & {
  /** Document title text (must be a string) */
  children?: string;
};

// ─── HTML Intrinsic Elements ────────────────────────────────

// All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
interface AriaAttributes {
  /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
  "aria-activedescendant"?: string | undefined;
  /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
  "aria-atomic"?: Booleanish | undefined;
  /**
   * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
   * presented if they are made.
   */
  "aria-autocomplete"?: "none" | "inline" | "list" | "both" | undefined;
  /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
  /**
   * Defines a string value that labels the current element, which is intended to be converted into Braille.
   * @see aria-label.
   */
  "aria-braillelabel"?: string | undefined;
  /**
   * Defines a human-readable, author-localized abbreviated description for the role of an element, which is intended to be converted into Braille.
   * @see aria-roledescription.
   */
  "aria-brailleroledescription"?: string | undefined;
  "aria-busy"?: Booleanish | undefined;
  /**
   * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
   * @see aria-pressed @see aria-selected.
   */
  "aria-checked"?: boolean | "false" | "mixed" | "true" | undefined;
  /**
   * Defines the total number of columns in a table, grid, or treegrid.
   * @see aria-colindex.
   */
  "aria-colcount"?: number | undefined;
  /**
   * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
   * @see aria-colcount @see aria-colspan.
   */
  "aria-colindex"?: number | undefined;
  /**
   * Defines a human readable text alternative of aria-colindex.
   * @see aria-rowindextext.
   */
  "aria-colindextext"?: string | undefined;
  /**
   * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-colindex @see aria-rowspan.
   */
  "aria-colspan"?: number | undefined;
  /**
   * Identifies the element (or elements) whose contents or presence are controlled by the current element.
   * @see aria-owns.
   */
  "aria-controls"?: string | undefined;
  /** Indicates the element that represents the current item within a container or set of related elements. */
  "aria-current"?:
    | boolean
    | "false"
    | "true"
    | "page"
    | "step"
    | "location"
    | "date"
    | "time"
    | undefined;
  /**
   * Identifies the element (or elements) that describes the object.
   * @see aria-labelledby
   */
  "aria-describedby"?: string | undefined;
  /**
   * Defines a string value that describes or annotates the current element.
   * @see related aria-describedby.
   */
  "aria-description"?: string | undefined;
  /**
   * Identifies the element that provides a detailed, extended description for the object.
   * @see aria-describedby.
   */
  "aria-details"?: string | undefined;
  /**
   * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
   * @see aria-hidden @see aria-readonly.
   */
  "aria-disabled"?: Booleanish | undefined;
  /**
   * Indicates what functions can be performed when a dragged object is released on the drop target.
   * @deprecated in ARIA 1.1
   */
  "aria-dropeffect"?:
    | "none"
    | "copy"
    | "execute"
    | "link"
    | "move"
    | "popup"
    | undefined;
  /**
   * Identifies the element that provides an error message for the object.
   * @see aria-invalid @see aria-describedby.
   */
  "aria-errormessage"?: string | undefined;
  /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
  "aria-expanded"?: Booleanish | undefined;
  /**
   * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
   * allows assistive technology to override the general default of reading in document source order.
   */
  "aria-flowto"?: string | undefined;
  /**
   * Indicates an element's "grabbed" state in a drag-and-drop operation.
   * @deprecated in ARIA 1.1
   */
  "aria-grabbed"?: Booleanish | undefined;
  /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
  "aria-haspopup"?:
    | boolean
    | "false"
    | "true"
    | "menu"
    | "listbox"
    | "tree"
    | "grid"
    | "dialog"
    | undefined;
  /**
   * Indicates whether the element is exposed to an accessibility API.
   * @see aria-disabled.
   */
  "aria-hidden"?: Booleanish | undefined;
  /**
   * Indicates the entered value does not conform to the format expected by the application.
   * @see aria-errormessage.
   */
  "aria-invalid"?:
    | boolean
    | "false"
    | "true"
    | "grammar"
    | "spelling"
    | undefined;
  /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
  "aria-keyshortcuts"?: string | undefined;
  /**
   * Defines a string value that labels the current element.
   * @see aria-labelledby.
   */
  "aria-label"?: string | undefined;
  /**
   * Identifies the element (or elements) that labels the current element.
   * @see aria-describedby.
   */
  "aria-labelledby"?: string | undefined;
  /** Defines the hierarchical level of an element within a structure. */
  "aria-level"?: number | undefined;
  /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
  "aria-live"?: "off" | "assertive" | "polite" | undefined;
  /** Indicates whether an element is modal when displayed. */
  "aria-modal"?: Booleanish | undefined;
  /** Indicates whether a text box accepts multiple lines of input or only a single line. */
  "aria-multiline"?: Booleanish | undefined;
  /** Indicates that the user may select more than one item from the current selectable descendants. */
  "aria-multiselectable"?: Booleanish | undefined;
  /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
  "aria-orientation"?: "horizontal" | "vertical" | undefined;
  /**
   * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
   * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
   * @see aria-controls.
   */
  "aria-owns"?: string | undefined;
  /**
   * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
   * A hint could be a sample value or a brief description of the expected format.
   */
  "aria-placeholder"?: string | undefined;
  /**
   * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-setsize.
   */
  "aria-posinset"?: number | undefined;
  /**
   * Indicates the current "pressed" state of toggle buttons.
   * @see aria-checked @see aria-selected.
   */
  "aria-pressed"?: boolean | "false" | "mixed" | "true" | undefined;
  /**
   * Indicates that the element is not editable, but is otherwise operable.
   * @see aria-disabled.
   */
  "aria-readonly"?: Booleanish | undefined;
  /**
   * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
   * @see aria-atomic.
   */
  "aria-relevant"?:
    | "additions"
    | "additions removals"
    | "additions text"
    | "all"
    | "removals"
    | "removals additions"
    | "removals text"
    | "text"
    | "text additions"
    | "text removals"
    | undefined;
  /** Indicates that user input is required on the element before a form may be submitted. */
  "aria-required"?: Booleanish | undefined;
  /** Defines a human-readable, author-localized description for the role of an element. */
  "aria-roledescription"?: string | undefined;
  /**
   * Defines the total number of rows in a table, grid, or treegrid.
   * @see aria-rowindex.
   */
  "aria-rowcount"?: number | undefined;
  /**
   * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
   * @see aria-rowcount @see aria-rowspan.
   */
  "aria-rowindex"?: number | undefined;
  /**
   * Defines a human readable text alternative of aria-rowindex.
   * @see aria-colindextext.
   */
  "aria-rowindextext"?: string | undefined;
  /**
   * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
   * @see aria-rowindex @see aria-colspan.
   */
  "aria-rowspan"?: number | undefined;
  /**
   * Indicates the current "selected" state of various widgets.
   * @see aria-checked @see aria-pressed.
   */
  "aria-selected"?: Booleanish | undefined;
  /**
   * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
   * @see aria-posinset.
   */
  "aria-setsize"?: number | undefined;
  /** Indicates if items in a table or grid are sorted in ascending or descending order. */
  "aria-sort"?: "none" | "ascending" | "descending" | "other" | undefined;
  /** Defines the maximum allowed value for a range widget. */
  "aria-valuemax"?: number | undefined;
  /** Defines the minimum allowed value for a range widget. */
  "aria-valuemin"?: number | undefined;
  /**
   * Defines the current value for a range widget.
   * @see aria-valuetext.
   */
  "aria-valuenow"?: number | undefined;
  /** Defines the human readable text alternative of aria-valuenow for a range widget. */
  "aria-valuetext"?: string | undefined;
}

interface HTMLAttributes extends AriaAttributes {
  autocapitalize?:
    | "off"
    | "none"
    | "on"
    | "sentences"
    | "words"
    | "characters"
    | undefined
    | (string & {});
  contentEditable?: Booleanish | "inherit" | "plaintext-only" | undefined;
  enterKeyHint?:
    | "enter"
    | "done"
    | "go"
    | "next"
    | "previous"
    | "search"
    | "send"
    | undefined;
  translate?: "yes" | "no" | undefined;
  // WAI-ARIA
  role?: AriaRole | undefined;
  // Non-standard Attributes
  unselectable?: "on" | "off" | undefined;
  // Popover API
  popover?: "" | "auto" | "manual" | "hint" | undefined;
  popoverTargetAction?: "toggle" | "show" | "hide" | undefined;
  /**
   * Hints at the type of data that might be entered by the user while editing the element or its contents
   * @see {@link https://html.spec.whatwg.org/multipage/interaction.html#input-modalities:-the-inputmode-attribute}
   */
  inputMode?:
    | "none"
    | "text"
    | "tel"
    | "url"
    | "email"
    | "numeric"
    | "decimal"
    | "search"
    | undefined;
}

interface AnchorHTMLAttributes extends HTMLAttributes {
  target?: HTMLAttributeAnchorTarget | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface AudioHTMLAttributes extends MediaHTMLAttributes {}

interface AreaHTMLAttributes extends HTMLAttributes {
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface DialogHTMLAttributes extends HTMLAttributes {
  closedby?: "any" | "closerequest" | "none" | undefined;
}

interface IframeHTMLAttributes extends HTMLAttributes {
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface ImgHTMLAttributes extends HTMLAttributes {
  crossOrigin?: CrossOrigin;
  decoding?: "async" | "auto" | "sync" | undefined;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  loading?: "eager" | "lazy" | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface InputHTMLAttributes extends HTMLAttributes {
  autocomplete?: HTMLInputAutoCompleteAttribute | undefined;
  capture?: boolean | "user" | "environment" | undefined; // https://www.w3.org/TR/html-media-capture/#the-capture-attribute
  type?: HTMLInputTypeAttribute | undefined;
}

interface LinkHTMLAttributes extends HTMLAttributes {
  blocking?: "render" | (string & {}) | undefined;
  crossOrigin?: CrossOrigin;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface MediaHTMLAttributes extends HTMLAttributes {
  crossOrigin?: CrossOrigin;
}

interface OlHTMLAttributes extends HTMLAttributes {
  type?: "1" | "a" | "A" | "i" | "I" | undefined;
}

interface ScriptHTMLAttributes extends HTMLAttributes {
  blocking?: "render" | (string & {}) | undefined;
  crossOrigin?: CrossOrigin;
  fetchPriority?: "high" | "low" | "auto" | undefined;
  referrerPolicy?: HTMLAttributeReferrerPolicy | undefined;
}

interface StyleHTMLAttributes extends HTMLAttributes {
  blocking?: "render" | (string & {}) | undefined;
}

interface TableHTMLAttributes extends HTMLAttributes {
  align?: "left" | "center" | "right" | undefined;
  rules?: "none" | "groups" | "rows" | "columns" | "all" | undefined;
}

interface TdHTMLAttributes extends HTMLAttributes {
  align?: "left" | "center" | "right" | "justify" | "char" | undefined;
  valign?: "top" | "middle" | "bottom" | "baseline" | undefined;
}

interface ThHTMLAttributes extends HTMLAttributes {
  align?: "left" | "center" | "right" | "justify" | "char" | undefined;
}

interface SVGAttributes extends AriaAttributes {
  role?: AriaRole | undefined;
  crossOrigin?: CrossOrigin;
  // SVG Specific attributes
  accumulate?: "none" | "sum" | undefined;
  additive?: "replace" | "sum" | undefined;
  alignmentBaseline?:
    | "auto"
    | "baseline"
    | "before-edge"
    | "text-before-edge"
    | "middle"
    | "central"
    | "after-edge"
    | "text-after-edge"
    | "ideographic"
    | "alphabetic"
    | "hanging"
    | "mathematical"
    | "inherit"
    | undefined;
  allowReorder?: "no" | "yes" | undefined;
  arabicForm?: "initial" | "medial" | "terminal" | "isolated" | undefined;
  autoReverse?: Booleanish | undefined;
  colorInterpolationFilters?:
    | "auto"
    | "sRGB"
    | "linearRGB"
    | "inherit"
    | undefined;
  dominantBaseline?:
    | "auto"
    | "use-script"
    | "no-change"
    | "reset-size"
    | "ideographic"
    | "alphabetic"
    | "hanging"
    | "mathematical"
    | "central"
    | "middle"
    | "text-after-edge"
    | "text-before-edge"
    | "inherit"
    | undefined;
  externalResourcesRequired?: Booleanish | undefined;
  fillRule?: "nonzero" | "evenodd" | "inherit" | undefined;
  focusable?: Booleanish | "auto" | undefined;
  preserveAlpha?: Booleanish | undefined;
  strokeLinecap?: "butt" | "round" | "square" | "inherit" | undefined;
  strokeLinejoin?: "miter" | "round" | "bevel" | "inherit" | undefined;
  textAnchor?: "start" | "middle" | "end" | "inherit" | undefined;
}

export interface SinwanIntrinsicElements {
  // Document structure
  /** HTML document root element */
  html: MergeAttrs<NativeProps<HTMLHtmlElement>, HTMLAttributes>;
  /** Document metadata container */
  head: MergeAttrs<NativeProps<HTMLHeadElement>, HTMLAttributes>;
  /** Document body content container */
  body: MergeAttrs<NativeProps<HTMLBodyElement>, HTMLAttributes>;
  /** Base URL for relative URLs in the document */
  base: MergeAttrs<NativeProps<HTMLBaseElement>, HTMLAttributes>;
  /** External resource link (stylesheets, icons, etc.) */
  link: MergeAttrs<LinkProps, LinkHTMLAttributes>;
  /** Document metadata (charset, viewport, description, etc.) */
  meta: MergeAttrs<NativeProps<HTMLMetaElement>, HTMLAttributes>;
  /** Inline CSS stylesheet */
  style: MergeAttrs<StyleProps, StyleHTMLAttributes>;
  /** Document title shown in browser tab */
  title: MergeAttrs<TitleProps, HTMLAttributes>;

  // Sectioning
  /** Contact information for the author/owner */
  address: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Self-contained composition (blog post, news article, etc.) */
  article: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Content tangentially related to surrounding content */
  aside: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Footer for a section or page */
  footer: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Header for a section or page */
  header: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Level 1 heading (most important) */
  h1: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Level 2 heading */
  h2: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Level 3 heading */
  h3: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Level 4 heading */
  h4: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Level 5 heading */
  h5: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Level 6 heading (least important) */
  h6: MergeAttrs<NativeProps<HTMLHeadingElement>, HTMLAttributes>;
  /** Main content of the document */
  main: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Navigation links section */
  nav: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Generic standalone section of a document */
  section: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Search functionality container */
  search: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Heading group with subheadings */
  hgroup: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;

  // Text content
  /** Extended quotation from another source */
  blockquote: MergeAttrs<NativeProps<HTMLQuoteElement>, HTMLAttributes>;
  /** Description/value in a description list */
  dd: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Generic container for flow content */
  div: MergeAttrs<NativeProps<HTMLDivElement>, HTMLAttributes>;
  /** Description list */
  dl: MergeAttrs<NativeProps<HTMLDListElement>, HTMLAttributes>;
  /** Term/name in a description list */
  dt: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Caption for a figure element */
  figcaption: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Self-contained content with optional caption */
  figure: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Horizontal rule (thematic break) */
  hr: MergeAttrs<NativeProps<HTMLHRElement>, HTMLAttributes>;
  /** List item */
  li: MergeAttrs<NativeProps<HTMLLIElement>, HTMLAttributes>;
  /** Ordered list */
  ol: MergeAttrs<NativeProps<HTMLOListElement>, OlHTMLAttributes>;
  /** Paragraph */
  p: MergeAttrs<NativeProps<HTMLParagraphElement>, HTMLAttributes>;
  /** Preformatted text (preserves whitespace) */
  pre: MergeAttrs<NativeProps<HTMLPreElement>, HTMLAttributes>;
  /** Unordered list */
  ul: MergeAttrs<NativeProps<HTMLUListElement>, HTMLAttributes>;

  // Inline text
  /** Hyperlink to another page or resource */
  a: MergeAttrs<NativeProps<HTMLAnchorElement>, AnchorHTMLAttributes>;
  /** Abbreviation or acronym */
  abbr: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Bring attention to (bold) */
  b: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Bidirectional isolate */
  bdi: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Bidirectional override */
  bdo: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Line break */
  br: MergeAttrs<NativeProps<HTMLBRElement>, HTMLAttributes>;
  /** Citation or reference to a work */
  cite: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Inline code fragment */
  code: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Machine-readable equivalent of content */
  data: MergeAttrs<NativeProps<HTMLDataElement>, HTMLAttributes>;
  /** Definition of a term */
  dfn: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Emphasized text */
  em: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Idiomatic text (italic) */
  i: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Keyboard input */
  kbd: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Highlighted/marked text */
  mark: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Inline quotation */
  q: MergeAttrs<NativeProps<HTMLQuoteElement>, HTMLAttributes>;
  /** Ruby fallback parenthesis */
  rp: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Ruby text component */
  rt: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Ruby annotation (for East Asian typography) */
  ruby: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Strikethrough text (no longer accurate) */
  s: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Sample output from a program */
  samp: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Side comment (small print) */
  small: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Generic inline container */
  span: MergeAttrs<NativeProps<HTMLSpanElement>, HTMLAttributes>;
  /** Strong importance (bold) */
  strong: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Subscript text */
  sub: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Superscript text */
  sup: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Machine-readable date/time */
  time: MergeAttrs<NativeProps<HTMLTimeElement>, HTMLAttributes>;
  /** Unarticulated annotation (underline) */
  u: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Variable in a mathematical expression or code */
  var: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Word break opportunity */
  wbr: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;

  // Edits
  /** Deleted text (strikethrough) */
  del: MergeAttrs<NativeProps<HTMLModElement>, HTMLAttributes>;
  /** Inserted text (underline) */
  ins: MergeAttrs<NativeProps<HTMLModElement>, HTMLAttributes>;

  // Forms (enhanced)
  /** Form for user input submission */
  form: MergeAttrs<FormProps, HTMLAttributes>;
  /** Input control (text, checkbox, radio, etc.) */
  input: MergeAttrs<InputProps, InputHTMLAttributes>;
  /** Clickable button */
  button: MergeAttrs<ButtonProps, HTMLAttributes>;
  /** Dropdown selection control */
  select: MergeAttrs<SelectProps, HTMLAttributes>;
  /** Multi-line text input */
  textarea: MergeAttrs<TextareaProps, HTMLAttributes>;
  /** Option in a select or datalist */
  option: MergeAttrs<OptionProps, HTMLAttributes>;
  /** Group of options in a select */
  optgroup: MergeAttrs<NativeProps<HTMLOptGroupElement>, HTMLAttributes>;
  /** Label for a form control */
  label: MergeAttrs<NativeProps<HTMLLabelElement>, HTMLAttributes>;
  /** Group of related form controls */
  fieldset: MergeAttrs<NativeProps<HTMLFieldSetElement>, HTMLAttributes>;
  /** Caption for a fieldset */
  legend: MergeAttrs<NativeProps<HTMLLegendElement>, HTMLAttributes>;
  /** Predefined options for input controls */
  datalist: MergeAttrs<NativeProps<HTMLDataListElement>, HTMLAttributes>;
  /** Result of a calculation */
  output: MergeAttrs<NativeProps<HTMLOutputElement>, HTMLAttributes>;
  /** Progress indicator */
  progress: MergeAttrs<ProgressProps, HTMLAttributes>;
  /** Scalar measurement within a known range */
  meter: MergeAttrs<NativeProps<HTMLMeterElement>, HTMLAttributes>;

  // Interactive
  /** Disclosure widget (expandable/collapsible) */
  details: MergeAttrs<NativeProps<HTMLDetailsElement>, HTMLAttributes>;
  /** Modal or non-modal dialog box */
  dialog: MergeAttrs<NativeProps<HTMLDialogElement>, DialogHTMLAttributes>;
  /** Menu of commands */
  menu: MergeAttrs<NativeProps<HTMLMenuElement>, HTMLAttributes>;
  /** Summary/caption for a details element */
  summary: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;

  // Scripting
  /** 2D drawing surface for graphics */
  canvas: MergeAttrs<NativeProps<HTMLCanvasElement>, HTMLAttributes>;
  /** Nested browsing context (embedded page) */
  iframe: MergeAttrs<NativeProps<HTMLIFrameElement>, IframeHTMLAttributes>;
  /** Fallback for browsers without frame support (deprecated) */
  noframes: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Fallback content when JavaScript is disabled */
  noscript: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Executable script or data block */
  script: MergeAttrs<NativeProps<HTMLScriptElement>, ScriptHTMLAttributes>;
  /** HTML template for cloning */
  template: MergeAttrs<NativeProps<HTMLTemplateElement>, HTMLAttributes>;

  // Tables
  /** Table caption */
  caption: MergeAttrs<NativeProps<HTMLTableCaptionElement>, HTMLAttributes>;
  /** Table column properties */
  col: MergeAttrs<NativeProps<HTMLTableColElement>, HTMLAttributes>;
  /** Group of table columns */
  colgroup: MergeAttrs<NativeProps<HTMLTableColElement>, HTMLAttributes>;
  /** Data table */
  table: MergeAttrs<NativeProps<HTMLTableElement>, TableHTMLAttributes>;
  /** Table body section */
  tbody: MergeAttrs<NativeProps<HTMLTableSectionElement>, HTMLAttributes>;
  /** Table data cell */
  td: MergeAttrs<NativeProps<HTMLTableCellElement>, TdHTMLAttributes>;
  /** Table footer section */
  tfoot: MergeAttrs<NativeProps<HTMLTableSectionElement>, HTMLAttributes>;
  /** Table header cell */
  th: MergeAttrs<NativeProps<HTMLTableCellElement>, ThHTMLAttributes>;
  /** Table header section */
  thead: MergeAttrs<NativeProps<HTMLTableSectionElement>, HTMLAttributes>;
  /** Table row */
  tr: MergeAttrs<NativeProps<HTMLTableRowElement>, HTMLAttributes>;

  // Media
  /** Clickable area within an image map */
  area: MergeAttrs<NativeProps<HTMLAreaElement>, AreaHTMLAttributes>;
  /** Audio content with playback controls */
  audio: MergeAttrs<NativeProps<HTMLAudioElement>, AudioHTMLAttributes>;
  /** Image element */
  img: MergeAttrs<NativeProps<HTMLImageElement>, ImgHTMLAttributes>;
  /** Image map with clickable areas */
  map: MergeAttrs<NativeProps<HTMLMapElement>, HTMLAttributes>;
  /** Text track for media elements (subtitles, captions) */
  track: MergeAttrs<NativeProps<HTMLTrackElement>, HTMLAttributes>;
  /** Video content with playback controls */
  video: MergeAttrs<NativeProps<HTMLVideoElement>, MediaHTMLAttributes>;
  /** Container for responsive image sources */
  picture: MergeAttrs<NativeProps<HTMLElement>, HTMLAttributes>;
  /** Media source for picture, audio, or video */
  source: MergeAttrs<NativeProps<HTMLSourceElement>, HTMLAttributes>;

  // Embedded
  /** External content plugin (deprecated) */
  embed: MergeAttrs<NativeProps<HTMLEmbedElement>, HTMLAttributes>;
  /** External resource container (deprecated) */
  object: MergeAttrs<NativeProps<HTMLObjectElement>, HTMLAttributes>;
  /** Parameter for object element (deprecated) */
  param: MergeAttrs<NativeProps<HTMLParamElement>, HTMLAttributes>;

  // Misc
  /** Placeholder for distributed content in shadow DOM */
  slot: MergeAttrs<NativeProps<HTMLSlotElement>, HTMLAttributes>;
}

// ─── SVG Intrinsic Elements ─────────────────────────────────

/**
 * SVG intrinsic elements for JSX.
 * Maps SVG element names to their native DOM types with JSX-specific props.
 */
export interface SinwanSVGElements {
  /** Root SVG container element */
  svg: MergeAttrs<NativeProps<SVGSVGElement>, SVGAttributes>;
  /** Animate element values over time */
  animate: MergeAttrs<NativeProps<SVGAnimateElement>, SVGAttributes>;
  /** Animate element along a motion path */
  animateMotion: MergeAttrs<
    NativeProps<SVGAnimateMotionElement>,
    SVGAttributes
  >;
  /** Animate transformation attributes */
  animateTransform: MergeAttrs<
    NativeProps<SVGAnimateTransformElement>,
    SVGAttributes
  >;
  /** Circle shape */
  circle: MergeAttrs<NativeProps<SVGCircleElement>, SVGAttributes>;
  /** Clipping path for masking content */
  clipPath: MergeAttrs<NativeProps<SVGClipPathElement>, SVGAttributes>;
  /** Container for reusable elements */
  defs: MergeAttrs<NativeProps<SVGDefsElement>, SVGAttributes>;
  /** Accessible description for SVG content */
  desc: MergeAttrs<NativeProps<SVGDescElement>, SVGAttributes>;
  /** Ellipse shape */
  ellipse: MergeAttrs<NativeProps<SVGEllipseElement>, SVGAttributes>;
  /** Filter primitive for blending images */
  feBlend: MergeAttrs<NativeProps<SVGFEBlendElement>, SVGAttributes>;
  /** Filter primitive for color matrix transformations */
  feColorMatrix: MergeAttrs<
    NativeProps<SVGFEColorMatrixElement>,
    SVGAttributes
  >;
  /** Filter primitive for component-wise remapping */
  feComponentTransfer: MergeAttrs<
    NativeProps<SVGFEComponentTransferElement>,
    SVGAttributes
  >;
  /** Filter primitive for combining images */
  feComposite: MergeAttrs<NativeProps<SVGFECompositeElement>, SVGAttributes>;
  /** Filter primitive for matrix convolution */
  feConvolveMatrix: MergeAttrs<
    NativeProps<SVGFEConvolveMatrixElement>,
    SVGAttributes
  >;
  /** Filter primitive for diffuse lighting effect */
  feDiffuseLighting: MergeAttrs<
    NativeProps<SVGFEDiffuseLightingElement>,
    SVGAttributes
  >;
  /** Filter primitive for displacement mapping */
  feDisplacementMap: MergeAttrs<
    NativeProps<SVGFEDisplacementMapElement>,
    SVGAttributes
  >;
  /** Filter light source from distant direction */
  feDistantLight: MergeAttrs<
    NativeProps<SVGFEDistantLightElement>,
    SVGAttributes
  >;
  /** Filter primitive for drop shadow effect */
  feDropShadow: MergeAttrs<NativeProps<SVGFEDropShadowElement>, SVGAttributes>;
  /** Filter primitive for flood fill */
  feFlood: MergeAttrs<NativeProps<SVGFEFloodElement>, SVGAttributes>;
  /** Transfer function for alpha channel */
  feFuncA: MergeAttrs<NativeProps<SVGFEFuncAElement>, SVGAttributes>;
  /** Transfer function for blue channel */
  feFuncB: MergeAttrs<NativeProps<SVGFEFuncBElement>, SVGAttributes>;
  /** Transfer function for green channel */
  feFuncG: MergeAttrs<NativeProps<SVGFEFuncGElement>, SVGAttributes>;
  /** Transfer function for red channel */
  feFuncR: MergeAttrs<NativeProps<SVGFEFuncRElement>, SVGAttributes>;
  /** Filter primitive for Gaussian blur */
  feGaussianBlur: MergeAttrs<
    NativeProps<SVGFEGaussianBlurElement>,
    SVGAttributes
  >;
  /** Filter primitive for fetching external image */
  feImage: MergeAttrs<NativeProps<SVGFEImageElement>, SVGAttributes>;
  /** Filter primitive for compositing layers */
  feMerge: MergeAttrs<NativeProps<SVGFEMergeElement>, SVGAttributes>;
  /** Layer within feMerge composition */
  feMergeNode: MergeAttrs<NativeProps<SVGFEMergeNodeElement>, SVGAttributes>;
  /** Filter primitive for morphological operations */
  feMorphology: MergeAttrs<NativeProps<SVGFEMorphologyElement>, SVGAttributes>;
  /** Filter primitive for offset positioning */
  feOffset: MergeAttrs<NativeProps<SVGFEOffsetElement>, SVGAttributes>;
  /** Filter light source from a point */
  fePointLight: MergeAttrs<NativeProps<SVGFEPointLightElement>, SVGAttributes>;
  /** Filter primitive for specular lighting effect */
  feSpecularLighting: MergeAttrs<
    NativeProps<SVGFESpecularLightingElement>,
    SVGAttributes
  >;
  /** Filter light source as a spotlight */
  feSpotLight: MergeAttrs<NativeProps<SVGFESpotLightElement>, SVGAttributes>;
  /** Filter primitive for tiling patterns */
  feTile: MergeAttrs<NativeProps<SVGFETileElement>, SVGAttributes>;
  /** Filter primitive for turbulence/noise generation */
  feTurbulence: MergeAttrs<NativeProps<SVGFETurbulenceElement>, SVGAttributes>;
  /** Container for filter primitives */
  filter: MergeAttrs<NativeProps<SVGFilterElement>, SVGAttributes>;
  /** Container for non-SVG content (HTML) */
  foreignObject: MergeAttrs<
    NativeProps<SVGForeignObjectElement>,
    SVGAttributes
  >;
  /** Group container for other SVG elements */
  g: MergeAttrs<NativeProps<SVGGElement>, SVGAttributes>;
  /** Embedded raster image */
  image: MergeAttrs<NativeProps<SVGImageElement>, SVGAttributes>;
  /** Line shape between two points */
  line: MergeAttrs<NativeProps<SVGLineElement>, SVGAttributes>;
  /** Linear gradient fill definition */
  linearGradient: MergeAttrs<
    NativeProps<SVGLinearGradientElement>,
    SVGAttributes
  >;
  /** Marker symbol for line endpoints or vertices */
  marker: MergeAttrs<NativeProps<SVGMarkerElement>, SVGAttributes>;
  /** Alpha mask for compositing */
  mask: MergeAttrs<NativeProps<SVGMaskElement>, SVGAttributes>;
  /** Metadata container for SVG content */
  metadata: MergeAttrs<NativeProps<SVGMetadataElement>, SVGAttributes>;
  /** Motion path reference for animateMotion */
  mpath: MergeAttrs<NativeProps<SVGMPathElement>, SVGAttributes>;
  /** Arbitrary path shape */
  path: MergeAttrs<NativeProps<SVGPathElement>, SVGAttributes>;
  /** Repeating pattern fill definition */
  pattern: MergeAttrs<NativeProps<SVGPatternElement>, SVGAttributes>;
  /** Closed polygon shape */
  polygon: MergeAttrs<NativeProps<SVGPolygonElement>, SVGAttributes>;
  /** Open polyline shape */
  polyline: MergeAttrs<NativeProps<SVGPolylineElement>, SVGAttributes>;
  /** Radial gradient fill definition */
  radialGradient: MergeAttrs<
    NativeProps<SVGRadialGradientElement>,
    SVGAttributes
  >;
  /** Rectangle shape */
  rect: MergeAttrs<NativeProps<SVGRectElement>, SVGAttributes>;
  /** Script element within SVG namespace */
  svgScript: MergeAttrs<NativeProps<SVGScriptElement>, SVGAttributes>;
  /** Set attribute value at specific time */
  set: MergeAttrs<NativeProps<SVGSetElement>, SVGAttributes>;
  /** Gradient color stop */
  stop: MergeAttrs<NativeProps<SVGStopElement>, SVGAttributes>;
  /** Style element within SVG namespace */
  svgStyle: MergeAttrs<NativeProps<SVGStyleElement>, SVGAttributes>;
  /** Conditional processing container */
  switch: MergeAttrs<NativeProps<SVGSwitchElement>, SVGAttributes>;
  /** Reusable graphic symbol definition */
  symbol: MergeAttrs<NativeProps<SVGSymbolElement>, SVGAttributes>;
  /** Text content element */
  text: MergeAttrs<NativeProps<SVGTextElement>, SVGAttributes>;
  /** Text along a path */
  textPath: MergeAttrs<NativeProps<SVGTextPathElement>, SVGAttributes>;
  /** Text span for styling substrings */
  tspan: MergeAttrs<NativeProps<SVGTSpanElement>, SVGAttributes>;
  /** Accessible title for SVG content */
  svgTitle: MergeAttrs<NativeProps<SVGTitleElement>, SVGAttributes>;
  /** Reference to a reusable element */
  use: MergeAttrs<NativeProps<SVGUseElement>, SVGAttributes>;
  /** Named view of the SVG document */
  view: MergeAttrs<NativeProps<SVGViewElement>, SVGAttributes>;
}

// ─── JSX Namespace ──────────────────────────────────────────

declare global {
  namespace JSX {
    type Element = SinwanNode;
    interface IntrinsicAttributes {
      key?: string | number;
      ref?: unknown;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements
      extends SinwanIntrinsicElements, SinwanSVGElements {}
  }
}
