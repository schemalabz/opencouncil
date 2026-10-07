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
