import { isMachineAccountAddress } from "@/lib/auth/machineAccounts";

/**
 * Whether a sign-in attempt may go on to Auth.js's account handling.
 *
 * A machine account never signs in: its rights are for its MCP tokens only
 * (#590). Auth.js passes the account row when the address is known, and
 * only the address when it is not, so both are checked; the address is
 * enough on its own, because the whole domain is reserved for machines.
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
    // Required, so a caller cannot drop it and switch the machine check off.
    user: { email?: string | null; isMachine?: boolean } | null | undefined,
): boolean {
    if (user?.isMachine || isMachineAccountAddress(user?.email)) return false;
    if (account?.provider === "google") return profile?.email_verified === true;
    return true;
}
