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

export async function signIn() {
    return
}
