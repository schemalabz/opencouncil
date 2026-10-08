"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
    confirmPhoneCode as confirmPhoneCodeInternal,
    requestPhoneCode as requestPhoneCodeInternal,
    type ConfirmCodeResult,
    type RequestCodeResult,
    type VerificationLocale,
} from "@/lib/db/phoneVerification";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/config";
import { CODE_LENGTH } from "@/lib/phone-verification/constants";

/**
 * The signed-in reader's phone verification (issue #813): the code dialog
 * in the profile calls these. Every one answers for the session's
 * own account and nobody else's. The arguments come from the browser, so
 * each is checked before it reaches the database.
 */

export type { ConfirmCodeResult, RequestCodeResult };

const UNAUTHENTICATED = { ok: false, code: "unauthenticated" } as const;

const requestSchema = z.object({ phone: z.string().max(40), locale: z.string().max(16).optional() });
const codeSchema = z.string().regex(new RegExp(`^\\d{${CODE_LENGTH}}$`));

/** The site locale the form runs in; an unknown one reads as the default, as everywhere else. */
function smsLocale(locale: string | undefined): VerificationLocale {
    return LOCALES.find((l) => l === locale) ?? DEFAULT_LOCALE;
}

/** Send a code to `phone` after staging it. `locale` picks the language of the message. */
export async function requestPhoneCode(input: { phone: string; locale?: string }): Promise<RequestCodeResult> {
    const user = await getCurrentUser();
    if (!user) return UNAUTHENTICATED;
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return { ok: false, code: "phone_invalid" };
    return requestPhoneCodeInternal(user.id, parsed.data.phone, { locale: smsLocale(parsed.data.locale) });
}

export async function confirmPhoneCode(code: string): Promise<ConfirmCodeResult | typeof UNAUTHENTICATED> {
    const user = await getCurrentUser();
    if (!user) return UNAUTHENTICATED;
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return { ok: false, code: "code_invalid" };
    return confirmPhoneCodeInternal(user.id, parsed.data);
}
