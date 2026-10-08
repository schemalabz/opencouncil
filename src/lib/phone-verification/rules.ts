import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
    ABUSE_WARNING_SENDS,
    CODE_LENGTH,
    MAX_SENDS_PER_PHONE_PER_WINDOW,
    MAX_SENDS_PER_USER_PER_WINDOW,
    RESEND_COOLDOWN_MS,
    SEND_WINDOW_MS,
} from "./constants";

/**
 * The pure rules of a phone verification: what a code looks like, how it is
 * kept, and when a reader may ask for another one. The data module applies
 * them; tests need no database.
 */

/** A code of CODE_LENGTH digits, leading zeros included. */
export function generateCode(random: (max: number) => number = (max) => randomInt(max)): string {
    return String(random(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/**
 * A keyed hash, not a plain one: six digits are a million guesses, which a
 * plain hash of a leaked row would give up in a second. The key stays out
 * of the database.
 */
export function hashCode(code: string, secret: string): string {
    // The purpose prefix keeps this hash apart from every other use of the secret.
    return createHmac("sha256", secret).update(`phone-code:${code}`).digest("hex");
}

export function codeMatches(code: string, hash: string, secret: string): boolean {
    const presented = Buffer.from(hashCode(code, secret), "hex");
    const expected = Buffer.from(hash, "hex");
    return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
    return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

/** The codes that went out inside the window: this account's, and this number's from any account. */
export interface SendHistory {
    userSends: Date[];
    phoneSends: Date[];
}

export type SendAllowance =
    | { ok: true }
    | { ok: false; reason: "too_soon" | "too_many"; retryAfterMs: number };

/**
 * May another code go out now? Three rails, all counted from the codes that
 * actually went out: a short wait between two codes to one account, so a
 * double tap sends one; a cap per account per window, so a stuck reader
 * costs a few messages and not a hundred; and a cap per number across
 * accounts, so a stranger's number does not ring all afternoon. The wait a
 * refusal names is exact: it ends when the send that fills the cap leaves
 * the window.
 */
export function sendAllowance(history: SendHistory, now: Date): SendAllowance {
    const t = now.getTime();
    const inWindow = (sends: Date[]) =>
        sends
            .map((d) => d.getTime())
            .filter((ms) => t - ms < SEND_WINDOW_MS)
            .sort((x, y) => x - y);
    const user = inWindow(history.userSends);
    const phone = inWindow(history.phoneSends);

    const last = user[user.length - 1];
    if (last !== undefined && t - last < RESEND_COOLDOWN_MS) {
        return { ok: false, reason: "too_soon", retryAfterMs: RESEND_COOLDOWN_MS - (t - last) };
    }
    const capped = (sends: number[], cap: number) =>
        sends.length >= cap ? sends[sends.length - cap] + SEND_WINDOW_MS - t : null;
    const waits = [capped(user, MAX_SENDS_PER_USER_PER_WINDOW), capped(phone, MAX_SENDS_PER_PHONE_PER_WINDOW)].filter(
        (w): w is number => w !== null,
    );
    if (waits.length > 0) return { ok: false, reason: "too_many", retryAfterMs: Math.max(...waits) };
    return { ok: true };
}

export interface UnusualSignal {
    /** One alert per kind, per number, per window: the caller holds the window. */
    kind: "foreign" | "flood" | "cap";
    text: string;
}

/**
 * What makes one code request worth an operator's look, the moment it goes
 * out. A number outside the realm countries, since real readers rarely need
 * one and SMS fraud targets expensive destinations. The third code to one
 * number within an hour, an early sign of a flood. The cap, when the flood
 * is happening. `phoneSendCount` counts this send too. The thresholds read
 * "at least", not "exactly": a refused send can sit in the count until it is
 * rolled back, so the send that crosses a threshold may count one more.
 */
export function unusualCodeRequest(
    input: { country: string | null; phoneSendCount: number },
    homeCountries: readonly string[],
): UnusualSignal[] {
    const signals: UnusualSignal[] = [];
    if (!input.country || !homeCountries.includes(input.country)) {
        signals.push({
            kind: "foreign",
            text: `The number is outside the realm countries (${input.country ?? "unknown country"}).`,
        });
    }
    if (input.phoneSendCount >= ABUSE_WARNING_SENDS) {
        signals.push({ kind: "flood", text: `The number got its ${ABUSE_WARNING_SENDS}rd code within an hour.` });
    }
    if (input.phoneSendCount >= MAX_SENDS_PER_PHONE_PER_WINDOW) {
        signals.push({ kind: "cap", text: `The number reached its cap of ${MAX_SENDS_PER_PHONE_PER_WINDOW} codes an hour.` });
    }
    return signals;
}
