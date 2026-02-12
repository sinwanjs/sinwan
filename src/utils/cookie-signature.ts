import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign a cookie value with the given secret.
 *
 * @param val - The value to sign
 * @param secret - The secret key
 * @returns `val.signature` where signature is base64url (no padding)
 */
export function sign(val: string, secret: string): string {
  if (typeof val !== "string")
    throw new TypeError("Cookie value must be a string");
  if (!secret) throw new TypeError("Secret is required");

  const mac = createHmac("sha256", secret)
    .update(val)
    .digest("base64")
    .replace(/=+$/, "");

  return `${val}.${mac}`;
}

/**
 * Unsign and verify a signed cookie value.
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param signedVal - The signed value (`val.signature`)
 * @param secret - The secret key used to sign
 * @returns The original value if the signature is valid, or `false`
 */
export function unsign(signedVal: string, secret: string): string | false {
  if (typeof signedVal !== "string")
    throw new TypeError("Signed value must be a string");
  if (!secret) throw new TypeError("Secret is required");

  const lastDot = signedVal.lastIndexOf(".");
  if (lastDot === -1) return false;

  const val = signedVal.slice(0, lastDot);
  const expected = sign(val, secret);

  const a = Buffer.from(expected);
  const b = Buffer.from(signedVal);

  // Both must have the same length and content
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b) ? val : false;
  } catch {
    return false;
  }
}
