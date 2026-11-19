import "server-only";

import { env } from "@/env.mjs";
import { claimAllowance } from "@/lib/rate-limit/limiter";
import { clientIp, hashIdentifier, type Allowance } from "@/lib/rate-limit/rules";

/**
 * How many magic links may go out. A magic link is one email to whatever
 * address a stranger types in, so the cap on the address is what keeps a
 * victim's inbox quiet, and the cap on the client is what keeps a script
 * from burning the Resend quota. Both are generous for a person: a reader
 * who taps "resend" a few times stays well inside.
 */
export const MAGIC_LINK_WINDOW_MS = 60 * 60_000;
/** Links to one address per window, from any client. */
export const MAX_MAGIC_LINKS_PER_ADDRESS_PER_WINDOW = 5;
/** Links from one client per window, to any address. An office or a campus shares one. */
export const MAX_MAGIC_LINKS_PER_IP_PER_WINDOW = 30;

/**
 * Count a magic-link send and say whether it may go out. The signIn
 * callback in src/auth.ts asks before Auth.js sends, so every entry
 * (the sign-in form, person join, a pending comment, signup, and Auth.js's
 * own HTTP route) passes here.
 */
export async function claimMagicLinkSend(email: string, headers: Headers): Promise<Allowance> {
    const ip = clientIp(headers);
    // The client first: a script past its own cap must not use up the count
    // of the addresses it types in, or it could lock their owners out.
    return claimAllowance("magic-link", [
        ...(ip
            ? [{ name: "ip", key: `rate-limit:magic-link:ip:${ip}`, max: MAX_MAGIC_LINKS_PER_IP_PER_WINDOW, windowMs: MAGIC_LINK_WINDOW_MS }]
            : []),
        {
            name: "address",
            key: `rate-limit:magic-link:address:${hashIdentifier(env.NEXTAUTH_SECRET, email)}`,
            max: MAX_MAGIC_LINKS_PER_ADDRESS_PER_WINDOW,
            windowMs: MAGIC_LINK_WINDOW_MS,
        },
    ]);
}
