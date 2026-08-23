import { env } from "@/env.mjs";

/**
 * Which cookie carries the main app's session credential. Edge-safe (env
 * only) — proxy.ts uses it for the coarse presence gate; session-auth.ts for
 * the real lookup.
 *
 * - dev: the main dev server's port-suffixed Auth.js cookie, carrying the RAW
 *   token (localhost cookies ignore ports, so notis on :3001 receives it
 *   directly). The port comes from OPENCOUNCIL_BASE_URL — the one notis
 *   setting that already knows where the main dev server runs — so the
 *   flake's multi-instance APP_PORT setups work by pointing that URL at the
 *   right port. Override with MAIN_SESSION_COOKIE_NAME if the main app uses
 *   a custom cookie name.
 * - deployed: the domain-scoped mirror the main app maintains
 *   (src/lib/auth/sessionMirror.ts there), which carries a SHA-256 of the
 *   token. Staging overrides via MAIN_SESSION_COOKIE_NAME to the
 *   "-staging"-suffixed mirror name.
 */
export function sessionCookieName(): string {
  if (env.MAIN_SESSION_COOKIE_NAME) return env.MAIN_SESSION_COOKIE_NAME;
  if (process.env.NODE_ENV === "development") {
    let port = "3000";
    try {
      port = new URL(env.OPENCOUNCIL_BASE_URL).port || "3000";
    } catch {
      // malformed base URL — keep the default port
    }
    return `authjs.session-token-${port}`;
  }
  return "__Secure-oc-session";
}

/**
 * Raw Auth.js cookies (dev) carry the token itself and must be hashed before
 * the view lookup; mirror cookies already carry the hash. The naming rule is
 * the discriminator: Auth.js session cookies always start with "authjs".
 */
export function cookieCarriesRawToken(cookieName: string): boolean {
  return cookieName.startsWith("authjs");
}
