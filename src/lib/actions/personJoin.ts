"use server";

import { getCurrentUser } from "@/lib/auth";
import { signJoinConfirmation, verifyPersonClaimToken } from "@/lib/auth/personClaim";
import { claimPerson, type PersonClaimStatus } from "@/lib/db/personClaim";
import { getVoicePrintConsents } from "@/lib/db/personConsent";
import { sendPersonClaimedAdminAlert } from "@/lib/discord";
import { isLikelyEmail, normalizeEmail } from "@/lib/personJoin/email";
import { signInWithEmail } from "@/lib/serverSignIn";

/** "consented": the person is this account's, and a consent is already in force, so the flow has no question left. */
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
        const consents = await getVoicePrintConsents([personId]);
        if (consents.has(personId)) return "consented";
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
