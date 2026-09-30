"use server";

import { getCurrentUser } from "@/lib/auth";
import {
    confirmPhoneCode as confirmPhoneCodeInternal,
    getPhoneVerificationState as getPhoneVerificationStateInternal,
    requestPhoneCode as requestPhoneCodeInternal,
    type ConfirmCodeResult,
    type PhoneVerificationState,
    type RequestCodeResult,
    type VerificationLocale,
} from "@/lib/db/phoneVerification";

/**
 * The signed-in reader's phone verification (issue #813): the code dialog
 * in the profile calls these. Every one answers for the session's
 * own account and nobody else's.
 */

export type { ConfirmCodeResult, PhoneVerificationState, RequestCodeResult };

const UNAUTHENTICATED = { ok: false, code: "unauthenticated" } as const;

/** Null when nobody is signed in. */
export async function getPhoneVerificationState(): Promise<PhoneVerificationState | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    return getPhoneVerificationStateInternal(user.id);
}

/**
 * Send a code to the number waiting on the account, or to `phone` after
 * staging it. `locale` picks the language of the message.
 */
export async function requestPhoneCode(input: { phone?: string | null; locale?: string } = {}): Promise<RequestCodeResult> {
    const user = await getCurrentUser();
    if (!user) return UNAUTHENTICATED;
    const locale: VerificationLocale = input.locale === "el" ? "el" : "en";
    return requestPhoneCodeInternal(user.id, { rawPhone: input.phone, locale });
}

export async function confirmPhoneCode(code: string): Promise<ConfirmCodeResult | typeof UNAUTHENTICATED> {
    const user = await getCurrentUser();
    if (!user) return UNAUTHENTICATED;
    return confirmPhoneCodeInternal(user.id, code);
}
