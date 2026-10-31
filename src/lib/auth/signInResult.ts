/**
 * Auth.js's server `signIn` (raw mode) rethrows `AuthError` instances, but
 * every other failure — `sendVerificationRequest` throwing on a Resend
 * outage, a misconfigured deploy — comes back as a redirect URL to our own
 * sign-in page with the code in `error` (`pages.signIn` and `pages.error`
 * in src/auth.config.ts). Callers that pass `redirect: false` must treat
 * that URL as a failure, not as the verify-request success URL.
 *
 * Returns the failing path with its query (e.g.
 * "/sign-in?error=Configuration"), or null for a success URL.
 */
export function signInFailurePath(url: string): string | null {
    const { pathname, search, searchParams } = new URL(url);
    if (/(^|\/)sign-in$/.test(pathname) && searchParams.has("error")) {
        return `${pathname}${search}`;
    }
    return null;
}

/** The `error` code of a sign-in refused by the magic-link rate limit (src/lib/auth/magicLinkLimit.ts). */
export const RATE_LIMITED_ERROR = "RateLimited";
const RETRY_AFTER_PARAM = "retryAfterMs";

/**
 * Where a refused magic-link request lands: our sign-in page with the code
 * and the wait. The signIn callback in src/auth.ts returns it, and Auth.js
 * resolves it like any sign-in failure, so the raw `signIn` call and the
 * HTTP route report it the same way.
 */
export function rateLimitedSignInPath(retryAfterMs: number): string {
    const params = new URLSearchParams({ error: RATE_LIMITED_ERROR, [RETRY_AFTER_PARAM]: String(Math.ceil(retryAfterMs)) });
    return `/sign-in?${params}`;
}

/** The wait a refused sign-in URL names, or null for every other URL. */
export function rateLimitedRetryAfterMs(url: string): number | null {
    const failurePath = signInFailurePath(url);
    if (!failurePath) return null;
    const { searchParams } = new URL(url);
    if (searchParams.get("error") !== RATE_LIMITED_ERROR) return null;
    const wait = Number(searchParams.get(RETRY_AFTER_PARAM));
    return Number.isFinite(wait) && wait > 0 ? wait : 0;
}

/** The whole minutes a sign-in page tells a refused reader to wait: never zero. */
export function retryAfterMinutes(retryAfterMs: number): number {
    return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}
