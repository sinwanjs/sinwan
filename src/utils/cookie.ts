// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParseOptions {
  decode?: (value: string) => string;
}

export interface SerializeOptions {
  encode?: (value: string) => string;
  maxAge?: number;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  partitioned?: boolean;
  priority?: "low" | "medium" | "high";
  sameSite?: boolean | "lax" | "strict" | "none";
}

// ---------------------------------------------------------------------------
// Validation patterns (RFC 6265)
// ---------------------------------------------------------------------------

/**
 * RegExp to match cookie name (token).
 * RFC 2616 §2.2 token = 1*<any CHAR except CTLs or separators>
 */
const COOKIE_NAME_RE = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;

/**
 * RegExp to match cookie value (cookie-octet).
 * cookie-value = *cookie-octet / ( DQUOTE *cookie-octet DQUOTE )
 */
const COOKIE_VALUE_RE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;

/**
 * RegExp to match domain value.
 */
const DOMAIN_RE =
  /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

/**
 * RegExp to match path value (no ';' or CTLs).
 */
const PATH_RE = /^[\x20-\x3a\x3c-\x7e]*$/;

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse a `Cookie` header string into a key/value object.
 *
 * @param str - The `Cookie` header value
 * @param options - Parse options
 * @returns Object of cookie name/value pairs
 */
export function parse(
  str: string,
  options?: ParseOptions,
): Record<string, string> {
  if (typeof str !== "string") {
    throw new TypeError("Cookie header must be a string");
  }

  const result: Record<string, string> = Object.create(null);
  const decode = options?.decode ?? defaultDecode;

  let index = 0;
  const len = str.length;

  while (index < len) {
    // Find the next '='
    const eqIdx = str.indexOf("=", index);
    if (eqIdx === -1) break;

    // Find the next ';'
    let semiIdx = str.indexOf(";", index);
    if (semiIdx === -1) semiIdx = len;

    // The '=' must come before the ';'
    if (eqIdx > semiIdx) {
      index = semiIdx + 1;
      continue;
    }

    // Extract name (trim spaces/tabs)
    const name = trim(str, index, eqIdx);

    if (name === "" || result[name] !== undefined) {
      // Skip empty names and duplicates (first wins)
      index = semiIdx + 1;
      continue;
    }

    // Extract value (trim spaces/tabs, handle optional quotes)
    let valStart = eqIdx + 1;
    let valEnd = semiIdx;

    // Trim leading/trailing whitespace
    while (valStart < valEnd && isWhitespace(str.charCodeAt(valStart)))
      valStart++;
    while (valEnd > valStart && isWhitespace(str.charCodeAt(valEnd - 1)))
      valEnd--;

    // Remove surrounding double quotes
    if (
      valEnd - valStart >= 2 &&
      str.charCodeAt(valStart) === 0x22 &&
      str.charCodeAt(valEnd - 1) === 0x22
    ) {
      valStart++;
      valEnd--;
    }

    const rawValue = str.slice(valStart, valEnd);

    try {
      result[name] = rawValue.includes("%") ? decode(rawValue) : rawValue;
    } catch {
      result[name] = rawValue;
    }

    index = semiIdx + 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

/**
 * Serialize a cookie name/value pair into a `Set-Cookie` header string.
 *
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Serialization options
 * @returns `Set-Cookie` header string
 */
export function serialize(
  name: string,
  value: string,
  options?: SerializeOptions,
): string {
  if (!COOKIE_NAME_RE.test(name)) {
    throw new TypeError(`Invalid cookie name: "${name}"`);
  }

  const encode = options?.encode ?? encodeURIComponent;
  const encodedValue = encode(value);

  if (!COOKIE_VALUE_RE.test(encodedValue)) {
    throw new TypeError(
      `Invalid cookie value after encoding: "${encodedValue}"`,
    );
  }

  let header = `${name}=${encodedValue}`;

  if (!options) return header;

  // Max-Age
  if (options.maxAge != null) {
    const maxAge = Math.floor(options.maxAge);
    if (!Number.isFinite(maxAge)) {
      throw new TypeError("maxAge must be a finite number");
    }
    header += `; Max-Age=${maxAge}`;
  }

  // Domain
  if (options.domain) {
    if (!DOMAIN_RE.test(options.domain)) {
      throw new TypeError(`Invalid domain: "${options.domain}"`);
    }
    header += `; Domain=${options.domain}`;
  }

  // Path
  if (options.path) {
    if (!PATH_RE.test(options.path)) {
      throw new TypeError(`Invalid path: "${options.path}"`);
    }
    header += `; Path=${options.path}`;
  }

  // Expires
  if (options.expires) {
    if (
      !(options.expires instanceof Date) ||
      isNaN(options.expires.getTime())
    ) {
      throw new TypeError("expires must be a valid Date");
    }
    header += `; Expires=${options.expires.toUTCString()}`;
  }

  // HttpOnly
  if (options.httpOnly) {
    header += "; HttpOnly";
  }

  // Secure
  if (options.secure) {
    header += "; Secure";
  }

  // Partitioned
  if (options.partitioned) {
    header += "; Partitioned";
  }

  // Priority
  if (options.priority) {
    const p = options.priority.toLowerCase();
    if (p === "low") header += "; Priority=Low";
    else if (p === "medium") header += "; Priority=Medium";
    else if (p === "high") header += "; Priority=High";
    else throw new TypeError(`Invalid priority: "${options.priority}"`);
  }

  // SameSite
  if (options.sameSite != null) {
    if (options.sameSite === true) {
      header += "; SameSite=Strict";
    } else if (options.sameSite === false) {
      // Don't append SameSite
    } else {
      const ss = options.sameSite.toLowerCase();
      if (ss === "strict") header += "; SameSite=Strict";
      else if (ss === "lax") header += "; SameSite=Lax";
      else if (ss === "none") header += "; SameSite=None";
      else throw new TypeError(`Invalid sameSite: "${options.sameSite}"`);
    }
  }

  return header;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDecode(value: string): string {
  return value.includes("%") ? decodeURIComponent(value) : value;
}

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09; // space or tab
}

/**
 * Trim leading/trailing spaces and tabs from a substring.
 */
function trim(str: string, start: number, end: number): string {
  while (start < end && isWhitespace(str.charCodeAt(start))) start++;
  while (end > start && isWhitespace(str.charCodeAt(end - 1))) end--;
  return str.slice(start, end);
}
