/**
 * Enhanced intrinsic element prop transformers.
 *
 * Every lowercase HTML tag listed here is intercepted by the JSX factory
 * (`buildElement`) so enhanced props are handled automatically without imports.
 *
 *   <form action={fn}>       → function action with useFormStatus
 *   <input value={signal}>   → controlled input
 *   <button formAction={fn}> → submitter action override
 *   <link href={css} precedence="default"> → head dedup + ordering
 *
 * Each enhancer receives the full props object (including `children`) and
 * returns either:
 *   • `Record<string, unknown>` — modified props for the same tag
 *   • `SinwanElement` — a complete replacement element (e.g. empty fragment)
 *
 * SSR-safe: all DOM-touching logic lives inside ref callbacks that are gated
 * with `isServer()`.
 */

import type { SinwanElement } from "../types.ts";
import { registerEnhancedElements } from "./jsx-runtime.ts";
import { effect } from "../reactivity/index.ts";
import { isReactive, resolve } from "../reactivity/index.ts";
import { isServer } from "../integrations/react/_internal/is-server.ts";
import { _setFormStatus } from "../integrations/react/use-form-status.ts";

// ─── Shared helpers ────────────────────────────────────────

function composeRef(
  userRef: ((el: Element | null) => void) | undefined,
  refs: Array<(el: Element | null) => void>,
): (el: Element | null) => void {
  return (el) => {
    if (userRef) userRef(el);
    for (const fn of refs) fn(el);
  };
}

// ─── formAction registry (used by <input> and <button>) ───

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

// ─── Textarea ──────────────────────────────────────────────

export interface TextareaProps extends Record<string, unknown> {
  value?: string | (() => string);
  defaultValue?: string;
  children?: any;
}

function enhanceTextarea(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { value, defaultValue, children, ...rest } = props;

  if (value != null && defaultValue != null) {
    throw new Error(
      "[sinwan] Textarea elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }
  const hasChildren =
    children != null && (!Array.isArray(children) || children.length > 0);
  if (hasChildren) {
    throw new Error(
      "[sinwan] <textarea> does not accept children. " +
        "Use the `defaultValue` prop to set the initial value.",
    );
  }

  const textareaProps: Record<string, unknown> = { ...rest };
  const refs: Array<(el: Element | null) => void> = [];

  if (value != null) {
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
  } else if (defaultValue != null) {
    textareaProps.children = defaultValue;
  }

  if (refs.length > 0) {
    const userRef = textareaProps.ref as
      | ((el: Element | null) => void)
      | undefined;
    textareaProps.ref = composeRef(userRef, refs);
  }

  return textareaProps;
}

// ─── Link ──────────────────────────────────────────────────

const INSERTED_STYLESHEET_HREFS = new Set<string>();
const PRECEDENCE_ORDER: string[] = [];

/** @internal — resets the link de-duplication and precedence registry (tests only). */
export function _resetLinkRegistry(): void {
  INSERTED_STYLESHEET_HREFS.clear();
  PRECEDENCE_ORDER.length = 0;
}

function enhanceLink(
  props: Record<string, unknown>,
): Record<string, unknown> | SinwanElement {
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

  const noSpecialBehavior =
    itemProp !== undefined ||
    hasManualManagement ||
    (isStylesheet && resolvedPrecedence === undefined) ||
    (isStylesheet && (resolvedHref == null || resolvedHref === ""));

  if (noSpecialBehavior) {
    return {
      rel,
      href,
      precedence,
      disabled,
      onError,
      onLoad,
      itemProp,
      ...rest,
    };
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

    const precStr = resolvedPrecedence as string | undefined;
    if (precStr !== undefined && !PRECEDENCE_ORDER.includes(precStr)) {
      PRECEDENCE_ORDER.push(precStr);
    }
    const precedenceIndex =
      precStr !== undefined ? PRECEDENCE_ORDER.indexOf(precStr) : -1;

    linkProps.ref = ((userRefValue: typeof userRef) => {
      return (el: Element | null) => {
        if (userRefValue) userRefValue(el);
        if (isServer() || !el) return;
        (el as HTMLElement).setAttribute("data-sinwan-precedence", precStr!);
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
    })(userRef);

    return linkProps;
  }

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

  return linkProps;
}

// ─── Meta ──────────────────────────────────────────────────

function enhanceMeta(props: Record<string, unknown>): Record<string, unknown> {
  const { itemProp, ...rest } = props;

  if (itemProp !== undefined) {
    return { itemProp, ...rest };
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

  return metaProps;
}

// ─── Script ────────────────────────────────────────────────

const INSERTED_SRCS = new Set<string>();

/** @internal — resets the script de-duplication registry (tests only). */
export function _resetScriptRegistry(): void {
  INSERTED_SRCS.clear();
}

function enhanceScript(
  props: Record<string, unknown>,
): Record<string, unknown> | SinwanElement {
  const { src, async, children, onError, onLoad, ...rest } = props;

  const hasChildren =
    children != null && (!Array.isArray(children) || children.length > 0);
  if (hasChildren) {
    return { ...rest, src, async, children, onError, onLoad };
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
    return { ...rest, src, async, onError, onLoad };
  }

  const srcKey = String(resolvedSrc);
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
    };
  })();

  return scriptProps;
}

// ─── Style ─────────────────────────────────────────────────

const INSERTED_STYLE_HREFS = new Set<string>();

/** @internal — resets the style de-duplication registry (tests only). */
export function _resetStyleRegistry(): void {
  INSERTED_STYLE_HREFS.clear();
}

function enhanceStyle(
  props: Record<string, unknown>,
): Record<string, unknown> | SinwanElement {
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
    return { ...rest, children, precedence, href, media, nonce, title };
  }

  const hrefKey = String(resolvedHref);
  if (INSERTED_STYLE_HREFS.has(hrefKey)) {
    return { tag: "", props: {}, children: [] };
  }
  INSERTED_STYLE_HREFS.add(hrefKey);

  const precStr = resolvedPrecedence as string | undefined;
  if (precStr !== undefined && !PRECEDENCE_ORDER.includes(precStr)) {
    PRECEDENCE_ORDER.push(precStr);
  }
  const precedenceIndex =
    precStr !== undefined ? PRECEDENCE_ORDER.indexOf(precStr) : -1;

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

  styleProps.ref = ((userRefValue: typeof userRef) => {
    return (el: Element | null) => {
      if (userRefValue) userRefValue(el);
      if (isServer() || !el) return;
      (el as HTMLElement).setAttribute("data-sinwan-precedence", precStr!);
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
  })(userRef);

  return styleProps;
}

// ─── Title ─────────────────────────────────────────────────

function enhanceTitle(props: Record<string, unknown>): Record<string, unknown> {
  const { itemProp, children, ...rest } = props;

  if (itemProp !== undefined) {
    return { itemProp, children, ...rest };
  }

  const normalized =
    children == null || typeof children === "boolean"
      ? []
      : Array.isArray(children)
        ? (children as any[]).flat(Infinity)
        : [children];

  if (normalized.length > 1) {
    throw new Error(
      "[sinwan] <title> must only contain a single string of text. " +
        "Use string interpolation to pass variables.",
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

  return titleProps;
}

// ─── Progress ──────────────────────────────────────────────

function enhanceProgress(
  props: Record<string, unknown>,
): Record<string, unknown> {
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

  return progressProps;
}

// ─── Option ────────────────────────────────────────────────

function enhanceOption(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { selected, ...rest } = props;
  if (selected !== undefined) {
    throw new Error(
      "[sinwan] <option> does not support the `selected` prop. " +
        "Pass the option's `value` to the parent <select defaultValue> " +
        "for an uncontrolled select box, or <select value> for a controlled one.",
    );
  }
  return rest;
}

// ─── Select ────────────────────────────────────────────────

function enhanceSelect(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { defaultValue, value, ...rest } = props;

  if (value !== undefined && defaultValue !== undefined) {
    throw new Error(
      "[sinwan] Select elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }

  const selectProps: Record<string, unknown> = { ...rest };
  const refs: Array<(el: Element | null) => void> = [];

  if (defaultValue !== undefined) {
    refs.push((el) => {
      if (!el) return;
      const selectEl = el as HTMLSelectElement;
      if (Array.isArray(defaultValue)) {
        for (const opt of selectEl.options) {
          opt.selected = (defaultValue as string[]).includes(opt.value);
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
    selectProps.ref = composeRef(userRef, refs);
  }

  return selectProps;
}

// ─── Input ─────────────────────────────────────────────────

function enhanceInput(props: Record<string, unknown>): Record<string, unknown> {
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
      "[sinwan] Input elements must be either controlled or uncontrolled. " +
        "Specify either the `value` prop or the `defaultValue` prop, but not both.",
    );
  }
  if (hasChecked && hasDefaultChecked) {
    throw new Error(
      "[sinwan] Input elements must be either controlled or uncontrolled. " +
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
    return {
      ...inputProps,
      [FORM_ACTION_MARKER]: "",
      ref: (el: Element | null) => {
        if (el) registerFormAction(el, formAction as any);
      },
    };
  }

  return { ...inputProps, formAction };
}

// ─── Button ────────────────────────────────────────────────

function enhanceButton(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const { formAction, ...rest } = props;

  if (typeof formAction === "function") {
    return {
      ...rest,
      [FORM_ACTION_MARKER]: "",
      ref: (el: Element | null) => {
        if (el) registerFormAction(el, formAction as any);
      },
    };
  }

  return { ...rest, formAction };
}

// ─── Form ──────────────────────────────────────────────────

function enhanceForm(props: Record<string, unknown>): Record<string, unknown> {
  const { action, onSubmit, ...rest } = props;

  if (typeof action === "string" || action === undefined) {
    return { ...rest, action, onSubmit };
  }

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (onSubmit) (onSubmit as any)(event);
    if (isServer()) return;

    const formEl = event.target as HTMLFormElement;
    const formData = new FormData(formEl);

    const submitter = (event as any).submitter as Element | null;
    const submitterAction = _resolveFormAction(submitter);
    const activeAction = submitterAction ?? (action as any);

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

  return { ...rest, method: "post", onSubmit: handleSubmit };
}

// ─── Registration ──────────────────────────────────────────

registerEnhancedElements({
  form: enhanceForm,
  input: enhanceInput,
  button: enhanceButton,
  select: enhanceSelect,
  textarea: enhanceTextarea,
  option: enhanceOption,
  progress: enhanceProgress,
  link: enhanceLink,
  meta: enhanceMeta,
  script: enhanceScript,
  style: enhanceStyle,
  title: enhanceTitle,
});
