"use server";

import { VoicePrintConsentSource } from "@prisma/client";
import { cookies } from "next/headers";
import { usesSecureCookies } from "@/lib/auth/sessionMirror";
import { getCurrentUser } from "@/lib/auth";
import { JOIN_NONCE_COOKIE, JOIN_NONCE_MAX_AGE_S, newJoinNonce, signJoinConfirmation, verifyPersonClaimToken } from "@/lib/auth/personClaim";
import { claimPerson, type PersonClaimStatus } from "@/lib/db/personClaim";
import { getVoicePrintConsents } from "@/lib/db/personConsent";
import { sendPersonClaimedAdminAlert } from "@/lib/discord";
import { isLikelyEmail, normalizeEmail } from "@/lib/personJoin/email";
import { signInWithEmail } from "@/lib/serverSignIn";

/** "consented": the person is this account's, and a consent in force answers for them, so the flow has no question left. */
export type ClaimWithTokenStatus = PersonClaimStatus | "consented" | "invalid" | "signed_out";

/** Step 1 of the join flow for a signed-in scanner: "yes, this is me". */
export async function claimWithToken(token: string): Promise<ClaimWithTokenStatus> {
    const personId = verifyPersonClaimToken(token);
    if (!personId) return "invalid";
    const user = await getCurrentUser();
    if (!user) return "signed_out";

    const result = await claimPerson(user.id, personId);
    if (result.status === "linked") {
        sendPersonClaimedAdminAlert({ cityId: result.cityId, cityName: result.cityName, personName: result.personName });
    }
    if (result.status === "linked" || result.status === "already_yours") {
        const consent = (await getVoicePrintConsents([personId])).get(personId);
        // A new claim closed the consent given in the app. One seen now was
        // given on paper, or by a delegate this instant, and only the paper
        // one answers for the person.
        const settled = consent === VoicePrintConsentSource.ADMIN || (consent !== undefined && result.status === "already_yours");
        if (settled) return "consented";
    }
    return result.status;
}

export type SendJoinEmailResult = { ok: true } | { ok: false; error: "invalid_code" | "invalid_email" | "send_failed" };

/**
 * Step 2 for a signed-out scanner: the sign-in email. Its link comes back
 * through /api/join with a signed `confirmed` mark, because the scanner
 * confirmed the name before asking for the email, and that route claims the
 * person. The return path is built here from a verified code, never taken
 * from the browser.
 */
export async function sendJoinEmail(token: string, email: string): Promise<SendJoinEmailResult> {
    if (!verifyPersonClaimToken(token)) return { ok: false, error: "invalid_code" };
    if (!isLikelyEmail(email)) return { ok: false, error: "invalid_email" };

    const form = new FormData();
    form.set("email", normalizeEmail(email));
    form.set("callbackUrl", `/api/join/${token}?confirmed=${signJoinConfirmation(token, email)}`);
    try {
        await signInWithEmail(form);
        return { ok: true };
    } catch (error) {
        console.error("Join email failed:", error);
        return { ok: false, error: "send_failed" };
    }
}

export type StartJoinGoogleResult = { ok: true; redirectTo: string } | { ok: false; error: "invalid_code" };

/**
 * Step 2 for a signed-out scanner who picks Google: where the sign-in must
 * land. The path is the email link's, through /api/join with a `confirmed`
 * mark, so the route claims the person and the page opens on the consent
 * step. The mark is bound to a nonce that this browser gets as a cookie,
 * because the address is not known before Google answers: a return path
 * copied into another browser carries the mark but not the cookie, and
 * claims nothing. Built here from a verified code, never taken from the
 * browser.
 */
export async function startJoinGoogle(token: string): Promise<StartJoinGoogleResult> {
    if (!verifyPersonClaimToken(token)) return { ok: false, error: "invalid_code" };
    const nonce = newJoinNonce();
    (await cookies()).set(JOIN_NONCE_COOKIE, nonce, {
        httpOnly: true,
        sameSite: "lax",
        secure: usesSecureCookies(),
        path: "/api/join",
        maxAge: JOIN_NONCE_MAX_AGE_S,
    });
    return { ok: true, redirectTo: `/api/join/${token}?confirmed=${signJoinConfirmation(token, nonce)}` };
}
