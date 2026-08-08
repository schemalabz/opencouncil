/**
 * Interim admin gate for PR 1: a single shared secret (NOTIS_ADMIN_SECRET)
 * exchanged at /admin/login for an HttpOnly cookie carrying an HMAC of the
 * secret — the secret itself never sits in the cookie jar. Replaced by
 * shared-cookie validation against the main app's sessions in PR 2.
 *
 * Web Crypto only (no node:crypto) so proxy.ts can run on the edge runtime.
 */

export const ADMIN_COOKIE = "notis_admin";
const HMAC_MESSAGE = "notis-admin-v1";

async function hmacOfSecret(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(HMAC_MESSAGE));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function mintToken(secret: string): Promise<string> {
  return hmacOfSecret(secret);
}

export async function verifyToken(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const expected = await hmacOfSecret(secret);
  return timingSafeEqual(token, expected);
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against self when lengths differ to keep timing flat; the result
  // is forced to false either way.
  const cmp = ab.length === bb.length ? bb : ab;
  let diff = ab.length === bb.length ? 0 : 1;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ cmp[i];
  }
  return diff === 0;
}
