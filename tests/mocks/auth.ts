/**
 * Stands in for @/auth (jest moduleNameMapper). By default nobody is signed
 * in. A suite that exercises guarded data-layer functions presents a session
 * through __setSessionEmail — the real guard chain (auth() → user row →
 * isSuperAdmin/administers) then runs against the seeded database, so the
 * authorization check is part of what the test verifies.
 */
let sessionEmail: string | null = null

export function __setSessionEmail(email: string | null) {
    sessionEmail = email
}

export async function auth() {
    return sessionEmail ? { user: { email: sessionEmail } } : null
}

// With `redirect: false`, Auth.js returns the URL it would redirect to: the
// verify-request page when the magic link went out, the sign-in page with an
// `error` when it did not (see signInFailurePath).
const SIGN_IN_SENT = 'http://localhost:3000/api/auth/verify-request?provider=resend&type=email'
let signInUrl = SIGN_IN_SENT

export function __setSignInUrl(url: string | null) {
    signInUrl = url ?? SIGN_IN_SENT
}

export async function signIn(): Promise<string> {
    return signInUrl
}
