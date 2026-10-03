import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
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
    return createHmac("sha256", secret).update(code).digest("hex");
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
