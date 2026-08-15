import { env } from "@/env.mjs";

/**
 * Which cookie carries the main app's session token. Edge-safe (env only) —
 * proxy.ts uses it for the coarse presence gate; session-auth.ts for the real
 * lookup.
 *
 * - dev: the main dev server's port-suffixed Auth.js cookie. localhost
 *   cookies ignore ports, so notis on :3001 receives it directly.
 * - deployed: the domain-scoped mirror the main app's proxy maintains
 *   (applySessionMirror). Staging overrides via MAIN_SESSION_COOKIE_NAME
 *   to the "-staging"-suffixed mirror name.
 */
export function sessionCookieName(): string {
  if (env.MAIN_SESSION_COOKIE_NAME) return env.MAIN_SESSION_COOKIE_NAME;
  if (process.env.NODE_ENV === "development") return "authjs.session-token-3000";
  return "__Secure-oc-session";
}
