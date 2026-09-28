/**
 * Whether a sign-in attempt may go on to Auth.js's account handling.
 *
 * Google admits an unverified email (a Workspace admin can create one, and a
 * plain account may still be pending). Linking by email is on for Google
 * (allowDangerousEmailAccountLinking in src/auth.config.ts), so only a
 * verified email may sign in as, or create, the account under that address.
 * Every other provider passes: the magic link proves its address itself.
 */
export function signInAllowed(
    account: { provider: string } | null | undefined,
    profile: { email_verified?: boolean | null } | undefined,
): boolean {
    if (account?.provider === "google") return profile?.email_verified === true;
    return true;
}
