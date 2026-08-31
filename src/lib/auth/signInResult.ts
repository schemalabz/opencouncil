/**
 * Auth.js's server `signIn` (raw mode) rethrows `AuthError` instances, but
 * every other failure — `sendVerificationRequest` throwing on a Resend
 * outage, a misconfigured deploy — comes back as a redirect URL on Auth.js's
 * own error or sign-in endpoints. Callers that pass `redirect: false` must
 * treat those URLs as failures, not as the verify-request success URL.
 *
 * Returns the failing path with its query (e.g.
 * "/api/auth/error?error=Configuration"), or null for a success URL.
 */
export function signInFailurePath(url: string): string | null {
    const { pathname, search } = new URL(url);
    if (pathname.startsWith("/api/auth/error") || pathname.startsWith("/api/auth/signin")) {
        return `${pathname}${search}`;
    }
    return null;
}
