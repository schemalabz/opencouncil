/**
 * Auth.js's server `signIn` (raw mode) rethrows `AuthError` instances, but
 * every other failure — `sendVerificationRequest` throwing on a Resend
 * outage, a misconfigured deploy — comes back as a redirect URL. With
 * `pages.signIn` and `pages.error` set (src/auth.config.ts) that URL is our
 * own sign-in page with the code in `error`; without them it is Auth.js's
 * own error or sign-in endpoint. Callers that pass `redirect: false` must
 * treat those URLs as failures, not as the verify-request success URL.
 *
 * Returns the failing path with its query (e.g.
 * "/sign-in?error=Configuration"), or null for a success URL.
 */
export function signInFailurePath(url: string): string | null {
    const { pathname, search, searchParams } = new URL(url);
    if (pathname.startsWith("/api/auth/error") || pathname.startsWith("/api/auth/signin")) {
        return `${pathname}${search}`;
    }
    if (/(^|\/)sign-in$/.test(pathname) && searchParams.has("error")) {
        return `${pathname}${search}`;
    }
    return null;
}
