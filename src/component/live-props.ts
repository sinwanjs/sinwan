/**
 * Live `cc` props: setup runs once; each read unwraps a zero-arity getter.
 * Signal objects are not unwrapped. `'key' in props` checks the raw bag.
 */

import { unwrap } from "../reactivity/normalization.ts";

const rawOf = new WeakMap<object, object>();
const proxyOf = new WeakMap<object, object>();
const omitOf = new WeakMap<object, ReadonlySet<PropertyKey>>();
const liveSet = new WeakSet<object>();

function isObject(value: unknown): value is object {
  return value != null && typeof value === "object";
}

/**
 * Callback props must not be invoked as live getters. `open` is a value prop;
 * `onclick` / `onValueChange` are not.
 */
const DOM_EVENT_PROP =
  /^on(?:abort|animation(?:end|iteration|start)|auxclick|before(?:input|toggle)|blur|cancel|canplay(?:through)?|change|click|close|composition(?:end|start|update)|contextmenu|copy|cuechange|cut|dblclick|drag(?:end|enter|leave|over|start)?|drop|durationchange|emptied|ended|error|focus(?:in|out)?|formdata|gotpointercapture|input|invalid|key(?:down|press|up)|load(?:ed(?:data|metadata)?|start)?|lostpointercapture|mouse(?:down|enter|leave|move|out|over|up)|paste|pause|play(?:ing)?|pointer(?:cancel|down|enter|leave|move|out|over|up)|progress|ratechange|reset|resize|scroll|securitypolicyviolation|seeked|seeking|select|slotchange|stalled|submit|suspend|timeupdate|toggle|touch(?:cancel|end|move|start)|transition(?:cancel|end|run|start)|volumechange|waiting|wheel)$/;

function isCallbackPropKey(key: PropertyKey): boolean {
  if (typeof key !== "string" || key.length < 3 || !key.startsWith("on")) {
    return false;
  }
  const third = key.charCodeAt(2);
  if (third >= 65 && third <= 90) return true;
  return DOM_EVENT_PROP.test(key);
}

function liveRead(raw: object, key: PropertyKey): unknown {
  const value = Reflect.get(raw, key);
  return isCallbackPropKey(key) ? value : unwrap(value);
}

/** Raw props bag behind a live proxy, or `props` when it is not live. */
export function getRawProps<T extends object>(props: T): T {
  return (rawOf.get(props) as T | undefined) ?? props;
}

export function isLiveProps(value: unknown): boolean {
  return isObject(value) && liveSet.has(value);
}

function createHandler(
  raw: object,
  omit: ReadonlySet<PropertyKey> | null,
): ProxyHandler<object> {
  function isOmitted(key: PropertyKey): boolean {
    return omit != null && omit.has(key);
  }

  function isOwn(key: PropertyKey): boolean {
    if (isOmitted(key)) return false;
    return Object.prototype.hasOwnProperty.call(raw, key);
  }

  return {
    get(_target, key) {
      if (isOmitted(key)) return undefined;
      if (!Object.prototype.hasOwnProperty.call(raw, key)) {
        return Reflect.get(raw, key);
      }
      return liveRead(raw, key);
    },
    has(_target, key) {
      return isOwn(key);
    },
    set(_target, key, value) {
      if (isOmitted(key)) return false;
      Reflect.set(raw, key, value);
      return true;
    },
    defineProperty(_target, key, descriptor) {
      if (isOmitted(key)) return false;
      Object.defineProperty(raw, key, descriptor);
      return true;
    },
    deleteProperty(_target, key) {
      if (isOmitted(key)) return false;
      return Reflect.deleteProperty(raw, key);
    },
    ownKeys() {
      return Reflect.ownKeys(raw).filter((key) => !isOmitted(key));
    },
    getOwnPropertyDescriptor(_target, key) {
      if (!isOwn(key)) return undefined;
      const desc = Reflect.getOwnPropertyDescriptor(raw, key);
      if (!desc) return undefined;
      if ("value" in desc) {
        return {
          ...desc,
          value: isCallbackPropKey(key) ? desc.value : unwrap(desc.value),
        };
      }
      return desc;
    },
    getPrototypeOf() {
      return Reflect.getPrototypeOf(raw);
    },
  };
}

function makeProxy<T extends object>(
  source: T,
  omit: ReadonlySet<PropertyKey> | null,
): T {
  const proxy = new Proxy(source, createHandler(source, omit));
  rawOf.set(proxy, source);
  liveSet.add(proxy);
  if (omit) omitOf.set(proxy, omit);
  return proxy as T;
}

/**
 * Object to spread into JSX. Returns the raw bag for live props so native
 * attributes keep getter functions. Rest proxies copy leftover raw keys.
 */
export function getSpreadProps<T extends object>(props: T): T {
  if (!isObject(props)) return props;
  const raw = getRawProps(props);
  const omit = omitOf.get(props);
  if (!omit || omit.size === 0) return raw as T;
  const out = Object.create(Object.getPrototypeOf(raw)) as Record<
    PropertyKey,
    unknown
  >;
  for (const key of Reflect.ownKeys(raw)) {
    if (omit.has(key)) continue;
    const desc = Reflect.getOwnPropertyDescriptor(raw, key);
    if (!desc) continue;
    Object.defineProperty(out, key, desc);
  }
  return out as T;
}

/** Live view of a props bag. Zero-arity getters are invoked; Signals are not. */
export function createLiveProps<T extends object>(raw: T): T {
  if (!isObject(raw)) return raw;
  if (liveSet.has(raw)) return raw;
  const source = getRawProps(raw);
  const existing = proxyOf.get(source);
  if (existing) return existing as T;
  const proxy = makeProxy(source, null);
  proxyOf.set(source, proxy);
  return proxy;
}

/** Live view of leftover keys after a flat `cc` rest destructure. */
export function createLiveRest<T extends object>(
  props: T,
  omit: readonly PropertyKey[],
): T {
  if (!isObject(props)) return props;
  return makeProxy(getRawProps(props), new Set(omit));
}
