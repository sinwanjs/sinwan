/**
 * React-compatible element wrappers — `[CLIENT]`.
 *
 *   <Form>, <Input>, <Button>, <Select>, <Textarea>, <Option>,
 *   <Progress>, <Link>, <Meta>, <Script>, <Style>, <Title>
 *
 * Each wrapper is a thin component returning the equivalent intrinsic
 * Sinwan element. The `<Form>` wrapper additionally honours React
 * `action` prop: when invoked, it runs the action in a transition, marks
 * `useFormStatus` as pending, and resets the form on success.
 *
 * SSR: safe (Sinwan's renderer treats them as native HTML).
 * Reactivity: bridge — `<Form>` updates the form-status signal.
 */

import type { SinwanElement, SinwanNode } from "../../types.ts";
import { jsx } from "../../jsx/jsx-runtime.ts";
import { _setFormStatus } from "./use-form-status.ts";
import { isServer } from "./_internal/is-server.ts";
import { effect } from "../../reactivity/index.ts";
import { isReactive, resolve } from "../../reactivity/index.ts";

// ─── Plain pass-through factory ────────────────────────────

function passthrough(tag: string) {
  return (
    props: Record<string, unknown> & { children?: SinwanNode },
  ): SinwanElement => jsx(tag, props ?? {});
}

// ─── <Textarea> — handles controlled `value` and uncontrolled `defaultValue` ──

/**
 * Props for `<Textarea>` — supports controlled `value` (reactive getter or
 * string) and uncontrolled `defaultValue`. Children are not accepted.
 */
export interface TextareaProps extends Record<string, unknown> {
  value?: string | (() => string);
  defaultValue?: string;
  children?: SinwanNode;
}

/**
 * React-compatible `<textarea>` wrapper.
 *
 * - Controlled: pass a reactive getter or string to `value`.
 * - Uncontrolled: pass `defaultValue`.
 * - Throws if both `value` and `defaultValue` are provided.
 * - Throws if children are provided.
 */
export function Textarea(props: TextareaProps): SinwanElement {
  const { value, defaultValue, children, ...rest } = props;

  const hasValue = value != null;
  const hasDefaultValue = defaultValue != null;

  if (hasValue && hasDefaultValue) {
    throw new Error(
      "[sinwan/react] Textarea elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }

  if (children != null) {
    throw new Error(
      "[sinwan/react] <textarea> does not accept children. " +
        "Use the `defaultValue` prop to set the initial value.",
    );
  }

  const textareaProps: Record<string, unknown> = { ...rest };
  const refs: Array<(el: Element | null) => void> = [];

  if (hasValue) {
    let effectCleanup: (() => void) | undefined;
    refs.push((el) => {
      if (!el) {
        effectCleanup?.();
        return;
      }
      const textareaEl = el as HTMLTextAreaElement;
      const setValue = () => {
        textareaEl.value = String(resolve(value) ?? "");
      };
      setValue();
      if (isReactive(value)) {
        effectCleanup = effect(setValue);
      }
    });
    if (isServer()) {
      textareaProps.children = String(resolve(value) ?? "");
    }
  } else if (hasDefaultValue) {
    textareaProps.children = defaultValue;
  }

  if (refs.length > 0) {
    const userRef = textareaProps.ref as
      | ((el: Element | null) => void)
      | undefined;
    textareaProps.ref = (el: Element | null) => {
      if (userRef) userRef(el);
      for (const fn of refs) fn(el);
    };
  }

  return jsx("textarea", textareaProps);
}

// ─── <Link> — moves to document.head with special stylesheet handling ──

const INSERTED_STYLESHEET_HREFS = new Set<string>();
const PRECEDENCE_ORDER: string[] = [];

/** @internal — resets the link de-duplication and precedence registry (tests only). */
export function _resetLinkRegistry(): void {
  INSERTED_STYLESHEET_HREFS.clear();
  PRECEDENCE_ORDER.length = 0;
}

/**
 * Props for `<Link>` — stylesheet links support `precedence` ordering in
 * `document.head`. `itemProp`, `onLoad`, `onError`, or `disabled` disable
 * special head placement.
 */
export interface LinkProps extends Record<string, unknown> {
  rel?: string | (() => string);
  href?: string | (() => string);
  precedence?: string | (() => string);
  disabled?: boolean | (() => boolean);
  onError?: (event: Event) => void;
  onLoad?: (event: Event) => void;
  itemProp?: string;
  media?: string;
  title?: string;
  as?: string;
  imageSrcSet?: string;
  imageSizes?: string;
  sizes?: string;
  crossOrigin?: string;
  referrerPolicy?: string;
  fetchPriority?: string;
  hrefLang?: string;
  integrity?: string;
  type?: string;
  blocking?: string;
  children?: SinwanNode;
}

/**
 * React-compatible `<link>` wrapper.
 *
 * Stylesheets with `precedence` are de-duplicated and inserted into
 * `document.head` in precedence order. Other links are also moved to head
 * unless manually managed or marked with `itemProp`.
 */
export function Link(props: LinkProps): SinwanElement {
  const {
    rel,
    href,
    precedence,
    disabled,
    onError,
    onLoad,
    itemProp,
    ...rest
  } = props;

  const resolvedRel = rel !== undefined ? resolve(rel) : undefined;
  const resolvedHref = href !== undefined ? resolve(href) : undefined;
  const resolvedPrecedence =
    precedence !== undefined ? resolve(precedence) : undefined;

  const hasManualManagement =
    onError !== undefined || onLoad !== undefined || disabled !== undefined;
  const isStylesheet = resolvedRel === "stylesheet";

  // Exceptions that disable special head-placement behaviour:
  // 1. itemProp present
  // 2. onLoad, onError, or disabled present
  // 3. stylesheet without precedence
  // 4. stylesheet with empty / missing href
  const noSpecialBehavior =
    itemProp !== undefined ||
    hasManualManagement ||
    (isStylesheet && resolvedPrecedence === undefined) ||
    (isStylesheet && (resolvedHref == null || resolvedHref === ""));

  if (noSpecialBehavior) {
    return jsx("link", {
      ...rest,
      rel,
      href,
      precedence,
      disabled,
      onError,
      onLoad,
      itemProp,
    } as Record<string, unknown>);
  }

  const linkProps: Record<string, unknown> = { ...rest, rel, href };
  if (precedence !== undefined) linkProps.precedence = precedence;

  const userRef = linkProps.ref as ((el: Element | null) => void) | undefined;

  if (isStylesheet) {
    const hrefKey = String(resolvedHref);

    if (INSERTED_STYLESHEET_HREFS.has(hrefKey)) {
      return { tag: "", props: {}, children: [] };
    }

    INSERTED_STYLESHEET_HREFS.add(hrefKey);

    if (
      resolvedPrecedence !== undefined &&
      !PRECEDENCE_ORDER.includes(resolvedPrecedence)
    ) {
      PRECEDENCE_ORDER.push(resolvedPrecedence);
    }
    const precedenceIndex =
      resolvedPrecedence !== undefined
        ? PRECEDENCE_ORDER.indexOf(resolvedPrecedence)
        : -1;

    linkProps.ref = (() => {
      return (el: Element | null) => {
        if (userRef) userRef(el);
        if (isServer() || !el) return;

        (el as HTMLElement).setAttribute(
          "data-sinwan-precedence",
          resolvedPrecedence!,
        );

        const existingLinks = Array.from(
          document.head.querySelectorAll('link[rel="stylesheet"]'),
        );
        let insertBefore: Element | null = null;

        for (const existing of existingLinks) {
          if (existing === el) continue;
          const existingPrec = existing.getAttribute("data-sinwan-precedence");
          if (existingPrec !== null) {
            const existingIndex = PRECEDENCE_ORDER.indexOf(existingPrec);
            if (existingIndex === -1) continue;
            if (existingIndex > precedenceIndex) {
              insertBefore = existing;
              break;
            }
          }
        }

        if (insertBefore) {
          document.head.insertBefore(el, insertBefore);
        } else {
          document.head.appendChild(el);
        }
      };
    })();

    return jsx("link", linkProps);
  }

  // Normal link: move to head, remove on unmount
  linkProps.ref = (() => {
    let currentEl: Element | null = null;
    return (el: Element | null) => {
      if (userRef) userRef(el);
      if (isServer()) return;
      if (el) {
        currentEl = el;
        document.head.appendChild(el);
      } else {
        if (currentEl && currentEl.parentNode) {
          currentEl.parentNode.removeChild(currentEl);
        }
        currentEl = null;
      }
    };
  })();

  return jsx("link", linkProps);
}

// ─── <Meta> — moves to document.head unless itemProp is present ──

/**
 * Props for `<Meta>`. `itemProp` disables special head placement.
 */
export interface MetaProps extends Record<string, unknown> {
  name?: string;
  httpEquiv?: string;
  charset?: string;
  itemProp?: string;
  content?: string;
  children?: SinwanNode;
}

/**
 * React-compatible `<meta>` wrapper.
 *
 * Renders in `document.head` unless `itemProp` is present.
 */
export function Meta(props: MetaProps): SinwanElement {
  const { itemProp, ...rest } = props;

  // itemProp disables special head placement — render normally
  if (itemProp !== undefined) {
    return jsx("meta", { itemProp, ...rest } as Record<string, unknown>);
  }

  const metaProps: Record<string, unknown> = { ...rest };
  const userRef = metaProps.ref as ((el: Element | null) => void) | undefined;

  metaProps.ref = (() => {
    let currentEl: Element | null = null;
    return (el: Element | null) => {
      if (userRef) userRef(el);
      if (isServer()) return;
      if (el) {
        currentEl = el;
        document.head.appendChild(el);
      } else {
        if (currentEl && currentEl.parentNode) {
          currentEl.parentNode.removeChild(currentEl);
        }
        currentEl = null;
      }
    };
  })();

  return jsx("meta", metaProps);
}
// ─── <Script> — special head placement + de-duplication for async external scripts ──

const INSERTED_SRCS = new Set<string>();

/** @internal — resets the script de-duplication registry (tests only). */
export function _resetScriptRegistry(): void {
  INSERTED_SRCS.clear();
}

/**
 * Props for `<Script>` — external async scripts are de-duplicated by `src`
 * and moved to `document.head`. Inline scripts (`children`) render in place.
 */
export interface ScriptProps extends Record<string, unknown> {
  src?: string | (() => string);
  async?: boolean | (() => boolean);
  children?: SinwanNode;
  onError?: (event: Event) => void;
  onLoad?: (event: Event) => void;
  crossOrigin?: string;
  fetchPriority?: string;
  integrity?: string;
  noModule?: boolean;
  nonce?: string;
  referrer?: string;
  type?: string;
  defer?: boolean;
  blocking?: string;
}

/**
 * React-compatible `<script>` wrapper.
 *
 * Inline scripts render normally. External async scripts without `onLoad` or
 * `onError` are de-duplicated by `src` and appended to `document.head`.
 */
export function Script(props: ScriptProps): SinwanElement {
  const { src, async, children, onError, onLoad, ...rest } = props;

  // Inline scripts always render in place (no special treatment)
  if (children != null) {
    return jsx("script", { ...rest, src, async, children, onError, onLoad });
  }

  const resolvedSrc = src !== undefined ? resolve(src) : undefined;
  const resolvedAsync = async !== undefined ? resolve(async) : undefined;

  const qualifiesForSpecial =
    resolvedSrc != null &&
    resolvedSrc !== "" &&
    resolvedAsync === true &&
    onError === undefined &&
    onLoad === undefined;

  if (!qualifiesForSpecial) {
    return jsx("script", { ...rest, src, async, onError, onLoad });
  }

  const srcKey = String(resolvedSrc);

  // De-duplicate: only the first script with this src is inserted
  if (INSERTED_SRCS.has(srcKey)) {
    return { tag: "", props: {}, children: [] };
  }

  INSERTED_SRCS.add(srcKey);

  const scriptProps: Record<string, unknown> = {
    ...rest,
    src: resolvedSrc,
    async: true,
  };
  const userRef = scriptProps.ref as ((el: Element | null) => void) | undefined;

  scriptProps.ref = (() => {
    return (el: Element | null) => {
      if (userRef) userRef(el);
      if (isServer()) return;
      if (el) {
        document.head.appendChild(el);
      }
      // React leaves the script in the DOM even after unmount — do not remove
    };
  })();

  return jsx("script", scriptProps);
}

// ─── <Style> — special head placement + de-duplication with href/precedence ──

const INSERTED_STYLE_HREFS = new Set<string>();

/** @internal — resets the style de-duplication registry (tests only). */
export function _resetStyleRegistry(): void {
  INSERTED_STYLE_HREFS.clear();
}

/**
 * Props for `<Style>` — supports `href` + `precedence` for de-duplicated
 * head placement. Without both, renders as a normal inline `<style>`.
 */
export interface StyleProps extends Record<string, unknown> {
  children?: SinwanNode;
  precedence?: string | (() => string);
  href?: string | (() => string);
  media?: string;
  nonce?: string;
  title?: string;
}

/**
 * React-compatible `<style>` wrapper.
 *
 * When `href` and `precedence` are both provided, the style tag is
 * de-duplicated by `href` and inserted into `document.head` in precedence
 * order. Otherwise renders as a normal inline `<style>`.
 */
export function Style(props: StyleProps): SinwanElement {
  const { children, precedence, href, media, nonce, title, ...rest } = props;

  const resolvedHref = href !== undefined ? resolve(href) : undefined;
  const resolvedPrecedence =
    precedence !== undefined ? resolve(precedence) : undefined;

  const qualifiesForSpecial =
    resolvedHref != null &&
    resolvedHref !== "" &&
    resolvedPrecedence !== undefined &&
    resolvedPrecedence !== "";

  if (!qualifiesForSpecial) {
    return jsx("style", {
      ...rest,
      children,
      precedence,
      href,
      media,
      nonce,
      title,
    } as Record<string, unknown>);
  }

  const hrefKey = String(resolvedHref);

  // De-duplicate: only the first style with this href is inserted
  if (INSERTED_STYLE_HREFS.has(hrefKey)) {
    return { tag: "", props: {}, children: [] };
  }

  INSERTED_STYLE_HREFS.add(hrefKey);

  if (
    resolvedPrecedence !== undefined &&
    !PRECEDENCE_ORDER.includes(resolvedPrecedence)
  ) {
    PRECEDENCE_ORDER.push(resolvedPrecedence);
  }
  const precedenceIndex =
    resolvedPrecedence !== undefined
      ? PRECEDENCE_ORDER.indexOf(resolvedPrecedence)
      : -1;

  const styleProps: Record<string, unknown> = {
    children,
    "data-sinwan-href": resolvedHref,
  };
  if (media !== undefined) styleProps.media = media;
  if (nonce !== undefined) styleProps.nonce = nonce;
  if (title !== undefined) styleProps.title = title;

  const userRef = (rest as any).ref as
    | ((el: Element | null) => void)
    | undefined;

  styleProps.ref = (() => {
    return (el: Element | null) => {
      if (userRef) userRef(el);
      if (isServer() || !el) return;

      (el as HTMLElement).setAttribute(
        "data-sinwan-precedence",
        resolvedPrecedence!,
      );

      const existingStyles = Array.from(
        document.head.querySelectorAll("style[data-sinwan-precedence]"),
      );
      let insertBefore: Element | null = null;

      for (const existing of existingStyles) {
        if (existing === el) continue;
        const existingPrec = existing.getAttribute("data-sinwan-precedence");
        if (existingPrec !== null) {
          const existingIndex = PRECEDENCE_ORDER.indexOf(existingPrec);
          if (existingIndex === -1) continue;
          if (existingIndex > precedenceIndex) {
            insertBefore = existing;
            break;
          }
        }
      }

      if (insertBefore) {
        document.head.insertBefore(el, insertBefore);
      } else {
        document.head.appendChild(el);
      }
    };
  })();

  return jsx("style", styleProps);
}

// ─── <Title> — moves to document.head unless itemProp is present ──

/**
 * Props for `<Title>`. `itemProp` disables special head placement.
 */
export interface TitleProps extends Record<string, unknown> {
  children?: SinwanNode;
  itemProp?: string;
}

/**
 * React-compatible `<title>` wrapper.
 *
 * Renders in `document.head` and enforces a single text child.
 * `itemProp` disables special placement.
 */
export function Title(props: TitleProps): SinwanElement {
  const { itemProp, children, ...rest } = props;

  // itemProp disables special head placement — render normally
  if (itemProp !== undefined) {
    return jsx("title", { itemProp, children, ...rest } as Record<
      string,
      unknown
    >);
  }

  // React requires <title> children to be a single text node.
  const normalized =
    children == null || typeof children === "boolean"
      ? []
      : Array.isArray(children)
        ? (children as any[]).flat(Infinity)
        : [children];

  if (normalized.length > 1) {
    throw new Error(
      "[sinwan/react] <title> must only contain a single string of text. " +
        "Use string interpolation to pass variables: " +
        "<title>{`Results page ${pageNumber}`}</title>",
    );
  }

  const child = normalized[0];
  const textContent =
    child == null
      ? ""
      : typeof child === "string"
        ? child
        : typeof child === "number"
          ? String(child)
          : typeof child === "function" && (child as any).length === 0
            ? String(resolve(child))
            : String(child);

  const titleProps: Record<string, unknown> = {
    ...rest,
    children: textContent,
  };
  const userRef = titleProps.ref as ((el: Element | null) => void) | undefined;

  titleProps.ref = (() => {
    let currentEl: Element | null = null;
    return (el: Element | null) => {
      if (userRef) userRef(el);
      if (isServer()) return;
      if (el) {
        currentEl = el;
        document.head.appendChild(el);
      } else {
        if (currentEl && currentEl.parentNode) {
          currentEl.parentNode.removeChild(currentEl);
        }
        currentEl = null;
      }
    };
  })();

  return jsx("title", titleProps);
}

// ─── <Progress> — omits `value` when null for indeterminate state ──

/**
 * Props for `<Progress>` — `value` accepts `null` for the indeterminate state.
 * Reactive getters are supported for `value` and `max`.
 */
export interface ProgressProps extends Record<string, unknown> {
  value?: number | null | (() => number | null);
  max?: number | (() => number);
  children?: SinwanNode;
}

/**
 * React-compatible `<progress>` wrapper.
 *
 * Omits the `value` attribute when `null` to produce an indeterminate
 * progress bar. Reactive getters are tracked automatically.
 */
export function Progress(props: ProgressProps): SinwanElement {
  const { value, ...rest } = props;
  const progressProps: Record<string, unknown> = { ...rest };

  if (value !== undefined) {
    let effectCleanup: (() => void) | undefined;
    const userRef = progressProps.ref as
      | ((el: Element | null) => void)
      | undefined;

    progressProps.ref = (el: Element | null) => {
      if (userRef) userRef(el);
      if (!el) {
        effectCleanup?.();
        return;
      }
      const progressEl = el as HTMLProgressElement;
      const update = () => {
        const v = resolve(value);
        if (v === null || v === undefined) {
          progressEl.removeAttribute("value");
        } else {
          progressEl.setAttribute("value", String(v));
          progressEl.value = Number(v);
        }
      };
      update();
      if (isReactive(value)) {
        effectCleanup = effect(update);
      }
    };
  }

  return jsx("progress", progressProps);
}

// ─── <Option> — rejects `selected`, passes everything else through ──

/**
 * Props for `<Option>` — `selected` is intentionally unsupported.
 * Use `<Select value>` or `<Select defaultValue>` instead.
 */
export interface OptionProps extends Record<string, unknown> {
  disabled?: boolean;
  label?: string;
  value?: string | number;
  children?: SinwanNode;
}

/**
 * React-compatible `<option>` wrapper.
 *
 * Throws if `selected` is passed; selection should be handled by the parent
 * `<Select>` via `value` or `defaultValue`.
 */
export function Option(props: OptionProps): SinwanElement {
  const { selected, ...rest } = props;
  if (selected !== undefined) {
    throw new Error(
      "[sinwan/react] <option> does not support the `selected` prop. " +
        "Pass the option's `value` to the parent <select defaultValue> " +
        "for an uncontrolled select box, or <select value> for a controlled one.",
    );
  }
  return jsx("option", rest as Record<string, unknown>);
}

// ─── <Select> — handles `defaultValue` and controlled `value` (React-specific) ────

/**
 * Props for `<Select>` — supports controlled `value` (reactive getter or
 * string/string[]) and uncontrolled `defaultValue`.
 */
export interface SelectProps extends Record<string, unknown> {
  defaultValue?: string | string[];
  value?: string | string[] | (() => string | string[]);
  multiple?: boolean;
  children?: SinwanNode;
}

/**
 * React-compatible `<select>` wrapper.
 *
 * - Controlled: pass a reactive getter or value to `value`.
 * - Uncontrolled: pass `defaultValue`.
 * - Throws if both are provided.
 * - Supports `multiple` selection via arrays.
 */
export function Select(props: SelectProps): SinwanElement {
  const { defaultValue, value, ...rest } = props;

  if (value !== undefined && defaultValue !== undefined) {
    throw new Error(
      "[sinwan/react] Select elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }

  const selectProps: Record<string, unknown> = { ...rest };

  // Build a composed ref that handles defaultValue / controlled value
  // after children are already in the DOM.
  const refs: Array<(el: Element | null) => void> = [];

  if (defaultValue !== undefined) {
    refs.push((el) => {
      if (!el) return;
      const selectEl = el as HTMLSelectElement;
      if (Array.isArray(defaultValue)) {
        for (const opt of selectEl.options) {
          opt.selected = defaultValue.includes(opt.value);
        }
      } else {
        selectEl.value = String(defaultValue);
      }
    });
  }

  if (value !== undefined) {
    let effectCleanup: (() => void) | undefined;
    refs.push((el) => {
      if (!el) {
        effectCleanup?.();
        return;
      }
      const selectEl = el as HTMLSelectElement;
      const setValue = () => {
        const v = resolve(value);
        if (Array.isArray(v)) {
          for (const opt of selectEl.options) {
            opt.selected = v.includes(opt.value);
          }
        } else {
          selectEl.value = String(v);
        }
      };
      setValue();
      if (isReactive(value)) {
        effectCleanup = effect(setValue);
      }
    });
  }

  if (refs.length > 0) {
    const userRef = selectProps.ref as
      | ((el: Element | null) => void)
      | undefined;
    selectProps.ref = (el: Element | null) => {
      if (userRef) userRef(el);
      for (const fn of refs) fn(el);
    };
  }

  return jsx("select", selectProps);
}

// ─── formAction registry for <Button> and <Input> ──────────

const FORM_ACTION_REGISTRY = new WeakMap<
  Element,
  (formData: FormData) => void | Promise<void>
>();
const FORM_ACTION_MARKER = "data-sinwan-formaction";

/** @internal — used by `<Form>` to look up a submitter's function formAction. */
export function _resolveFormAction(
  submitter: Element | null,
): ((formData: FormData) => void | Promise<void>) | undefined {
  if (!submitter || !(FORM_ACTION_MARKER in submitter)) return undefined;
  return FORM_ACTION_REGISTRY.get(submitter);
}

function registerFormAction(
  element: Element,
  action: (formData: FormData) => void | Promise<void>,
): void {
  FORM_ACTION_REGISTRY.set(element, action);
  (element as any)[FORM_ACTION_MARKER] = true;
}

// ─── <Input> with formAction support ───────────────────────

/**
 * Props for `<Input>` — supports controlled `value` / `checked` (reactive
 * getters or plain values) and uncontrolled `defaultValue` / `defaultChecked`.
 * Also supports function `formAction` for form actions.
 */
export interface InputProps extends Record<string, unknown> {
  type?: string;
  value?: string | (() => string);
  defaultValue?: string;
  checked?: boolean | (() => boolean);
  defaultChecked?: boolean;
  readOnly?: boolean;
  onChange?: (event: Event) => void;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  children?: SinwanNode;
}

/**
 * React-compatible `<input>` wrapper.
 *
 * - Controlled: pass reactive getters or plain values to `value` / `checked`.
 * - Uncontrolled: pass `defaultValue` / `defaultChecked`.
 * - Throws if both controlled and uncontrolled props are provided.
 * - Function `formAction` registers the input as a form submitter action.
 */
export function Input(props: InputProps): SinwanElement {
  const {
    formAction,
    value,
    defaultValue,
    checked,
    defaultChecked,
    onChange,
    readOnly,
    ...rest
  } = props;

  const hasValue = value != null;
  const hasChecked = checked != null;
  const hasDefaultValue = defaultValue != null;
  const hasDefaultChecked = defaultChecked != null;

  if (hasValue && hasDefaultValue) {
    throw new Error(
      "[sinwan/react] Input elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }
  if (hasChecked && hasDefaultChecked) {
    throw new Error(
      "[sinwan/react] Input elements must be either controlled or uncontrolled. " +
        "Specify either the `checked` prop or the `defaultChecked` prop, but not both.",
    );
  }

  const inputProps: Record<string, unknown> = { ...rest };
  if (hasValue) inputProps.value = value;
  else if (hasDefaultValue) inputProps.value = defaultValue;
  if (hasChecked) inputProps.checked = checked;
  else if (hasDefaultChecked) inputProps.checked = defaultChecked;
  if (onChange != null) inputProps.onChange = onChange;
  if (readOnly != null) inputProps.readOnly = readOnly;

  if (typeof formAction === "function") {
    return jsx("input", {
      ...inputProps,
      [FORM_ACTION_MARKER]: "",
      ref: (el: Element | null) => {
        if (el) registerFormAction(el, formAction);
      },
    } as Record<string, unknown>);
  }

  return jsx("input", { ...inputProps, formAction } as Record<string, unknown>);
}

// ─── <Button> with formAction support ──────────────────────

/**
 * Props for `<Button>` — supports function `formAction` for form actions.
 */
export interface ButtonProps extends Record<string, unknown> {
  type?: string;
  formAction?: string | ((formData: FormData) => void | Promise<void>);
  children?: SinwanNode;
}

/**
 * React-compatible `<button>` wrapper.
 *
 * When `formAction` is a function, registers the button as a form submitter
 * action that overrides the parent `<Form>` action.
 */
export function Button(props: ButtonProps): SinwanElement {
  const { formAction, ...rest } = props;

  if (typeof formAction === "function") {
    return jsx("button", {
      ...rest,
      [FORM_ACTION_MARKER]: "",
      ref: (el: Element | null) => {
        if (el) registerFormAction(el, formAction);
      },
    } as Record<string, unknown>);
  }

  return jsx("button", { ...rest, formAction } as Record<string, unknown>);
}

// ─── <Form> with action support ────────────────────────────

/**
 * Props for `<Form>` — supports string URLs and function actions.
 * Function actions intercept submit, drive `useFormStatus`, and reset on success.
 */
export interface FormActionProps {
  action?: string | ((formData: FormData) => void | Promise<void>);
  method?: string;
  encType?: string;
  onSubmit?: (event: SubmitEvent) => void;
  children?: SinwanNode;
  [key: string]: unknown;
}

/**
 * React-compatible `<form>` wrapper.
 *
 * - String `action` → native browser form submission.
 * - Function `action` → intercepts submit, sets form-status as pending,
 *   runs the action, resets the form on success, then clears pending state.
 * - Submitter function `formAction` (on `<Button>` or `<Input>`) overrides
 *   the form-level action.
 */
export function Form(props: FormActionProps): SinwanElement {
  const { action, onSubmit, ...rest } = props;

  // String action → native form posting; defer to the browser.
  if (typeof action === "string" || action === undefined) {
    return jsx("form", { ...rest, action, onSubmit } as Record<
      string,
      unknown
    >);
  }

  // Function action → intercept submit, run the action, drive form-status.
  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (onSubmit) onSubmit(event);
    if (isServer()) return;

    const formEl = event.target as HTMLFormElement;
    const formData = new FormData(formEl);

    // Check if the submitter has a function formAction that overrides the form action.
    const submitter = (event as any).submitter as Element | null;
    const submitterAction = _resolveFormAction(submitter);
    const activeAction = submitterAction ?? action;

    _setFormStatus({
      pending: true,
      data: formData,
      method: "post",
      action: activeAction,
    });
    Promise.resolve(activeAction(formData))
      .then(() => formEl.reset())
      .finally(() => {
        _setFormStatus({
          pending: false,
          data: null,
          method: null,
          action: null,
        });
      });
  };

  return jsx("form", {
    ...rest,
    method: "post",
    onSubmit: handleSubmit,
  } as Record<string, unknown>);
}
