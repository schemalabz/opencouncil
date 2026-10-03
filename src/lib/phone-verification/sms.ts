import "server-only";

import { env } from "@/env.mjs";
import { sendErrorAdminAlert } from "@/lib/discord-core";
import { CODE_TTL_MS } from "./constants";

/**
 * The SMS that carries a phone verification code (issue #813), sent straight
 * to Bird's SMS channel. This is the main app's only call to Bird: every
 * message to a reader, on WhatsApp or SMS, is still Notis's. The code does
 * not go through Notis, so a reader can confirm a number while Notis is
 * down, and the two services deploy in any order.
 *
 * Never throws: a failure is a value, and the caller tells the reader to try
 * again. A failure also alerts the operators, who would otherwise learn
 * that codes do not go out only from a reader.
 */

export type VerificationLocale = "el" | "en";

const TIMEOUT_MS = 10_000;

/** One alert per window: a Bird outage must not post one alert per reader. */
const ALERT_WINDOW_MS = 10 * 60_000;
let lastAlertAt = 0;

function alertOperators(error: string): void {
    const now = Date.now();
    if (now - lastAlertAt < ALERT_WINDOW_MS) return;
    lastAlertAt = now;
    // Fire and forget, and never with the number: the alert channel is no place for a phone.
    sendErrorAdminAlert({ source: "Phone verification SMS", error }).catch((e) =>
        console.error("Verification SMS alert failed:", e),
    );
}

export function isSmsConfigured(): boolean {
    return Boolean(env.BIRD_API_KEY && env.BIRD_WORKSPACE_ID && env.BIRD_SMS_CHANNEL_ID);
}

export function verificationSmsText(code: string, locale: VerificationLocale): string {
    const minutes = Math.round(CODE_TTL_MS / 60_000);
    return locale === "en"
        ? `${code} is your OpenCouncil verification code. It expires in ${minutes} minutes.`
        : `${code} είναι ο κωδικός επαλήθευσης για το OpenCouncil. Ισχύει για ${minutes} λεπτά.`;
}

export type SmsResult = { ok: true } | { ok: false; reason: "unconfigured" | "rejected" | "unreachable" };

export async function sendVerificationSms(phone: string, code: string, locale: VerificationLocale): Promise<SmsResult> {
    if (!isSmsConfigured()) return { ok: false, reason: "unconfigured" };
    try {
        const response = await fetch(
            `https://api.bird.com/workspaces/${env.BIRD_WORKSPACE_ID}/channels/${env.BIRD_SMS_CHANNEL_ID}/messages`,
            {
                method: "POST",
                headers: { Authorization: `AccessKey ${env.BIRD_API_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    receiver: { contacts: [{ identifierValue: phone }] },
                    body: { type: "text", text: { text: verificationSmsText(code, locale) } },
                }),
                cache: "no-store",
                signal: AbortSignal.timeout(TIMEOUT_MS),
            },
        );
        const body: unknown = await response.json().catch(() => null);
        const receipt = typeof body === "object" && body !== null ? (body as { id?: unknown; status?: unknown }) : null;
        const status = receipt?.status;
        // Sent means Bird's own receipt: a message id. A 2xx without one (a
        // proxy's error page) is not a send, and a 2xx body can still carry
        // an immediate refusal.
        const accepted = response.ok && typeof receipt?.id === "string" && status !== "failed" && status !== "rejected";
        if (!accepted) {
            // The number stays out of the log; the status says enough.
            const detail = `Bird refused the SMS (HTTP ${response.status}${typeof status === "string" ? `, ${status}` : ""}${response.ok && typeof receipt?.id !== "string" ? ", no message id" : ""})`;
            console.error(`Verification SMS: ${detail}`);
            alertOperators(detail);
            return { ok: false, reason: "rejected" };
        }
        return { ok: true };
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("Verification SMS failed:", detail);
        alertOperators(`Bird did not answer: ${detail}`);
        return { ok: false, reason: "unreachable" };
    }
}
