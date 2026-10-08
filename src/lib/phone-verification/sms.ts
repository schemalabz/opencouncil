import "server-only";

import { getTranslations } from "next-intl/server";
import { env } from "@/env.mjs";
import type { AppLocale } from "@/i18n/config";
import { claimAlertWindow } from "@/lib/cache/alertWindow";
import { sendErrorAdminAlert } from "@/lib/discord-core";
import { birdSmsEndpoint, birdSmsPayload, readBirdSmsReceipt } from "@opencouncil/ui/lib/bird-sms";
import { CODE_TTL_MS } from "./constants";

/**
 * The SMS that carries a phone verification code (issue #813), sent straight
 * to Bird's SMS channel. This is the main app's only call to Bird: every
 * message to a reader, on WhatsApp or SMS, is still Notis's. The code does
 * not go through Notis, so a reader can confirm a number while Notis is
 * down, and the two services deploy in any order. The request and the
 * receipt rule are shared with Notis (packages/ui/src/lib/bird-sms.ts).
 *
 * Never throws: a failure is a value, and the caller tells the reader to try
 * again. A failure also alerts the operators, who would otherwise learn
 * that codes do not go out only from a reader.
 */

export type VerificationLocale = AppLocale;

const TIMEOUT_MS = 10_000;

/** One alert per window: a Bird outage must not post one alert per reader. */
const ALERT_WINDOW_S = 10 * 60;
const ALERT_KEY = "phone-verification:sms-alert";

async function alertOperators(error: string): Promise<void> {
    if (!(await claimAlertWindow(ALERT_KEY, ALERT_WINDOW_S))) return;
    // Not awaited, and never with the number: the alert channel is no place for a phone.
    sendErrorAdminAlert({ source: "Phone verification SMS", error }).catch((e) =>
        console.error("Verification SMS alert failed:", e),
    );
}

export function isSmsConfigured(): boolean {
    return Boolean(env.BIRD_API_KEY && env.BIRD_WORKSPACE_ID && env.BIRD_SMS_CHANNEL_ID);
}

/** The message, from the reader's catalog: the same source as the dialog's copy. */
export async function verificationSmsText(code: string, locale: VerificationLocale): Promise<string> {
    const t = await getTranslations({ locale, namespace: "phoneVerification" });
    return t("sms", { code, minutes: Math.round(CODE_TTL_MS / 60_000) });
}

/**
 * `rejected` is Bird's own answer: the SMS did not go out. `unreachable` is
 * no answer at all, a timeout or a network failure: the SMS may still arrive.
 */
export type SmsResult = { ok: true } | { ok: false; reason: "unconfigured" | "rejected" | "unreachable" };

export async function sendVerificationSms(phone: string, code: string, locale: VerificationLocale): Promise<SmsResult> {
    if (!isSmsConfigured()) return { ok: false, reason: "unconfigured" };
    const text = await verificationSmsText(code, locale);
    try {
        const response = await fetch(birdSmsEndpoint(env.BIRD_WORKSPACE_ID ?? "", env.BIRD_SMS_CHANNEL_ID ?? ""), {
            method: "POST",
            headers: { Authorization: `AccessKey ${env.BIRD_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(birdSmsPayload(phone, text)),
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const receipt = readBirdSmsReceipt(response.status, await response.json().catch(() => null));
        if (!receipt.sent) {
            // The number stays out of the log; the reason says enough.
            const detail = `Bird refused the SMS (${receipt.reason})`;
            console.error(`Verification SMS: ${detail}`);
            await alertOperators(detail);
            return { ok: false, reason: "rejected" };
        }
        return { ok: true };
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Verification SMS failed:", detail);
        await alertOperators(`Bird did not answer: ${detail}`);
        return { ok: false, reason: "unreachable" };
    }
}
