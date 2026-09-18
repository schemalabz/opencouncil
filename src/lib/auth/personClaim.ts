import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Realm } from "@prisma/client";
import { env } from "@/env.mjs";
import { normalizeEmail } from "@/lib/personJoin/email";
import { personJoinPagePath } from "@/lib/personJoin/paths";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";

/**
 * A person claim link: the QR a councillor scans to get an account that
 * administers their own `Person`. The token names the person and when it
 * expires, nothing else. "One claim per person" is not in the token:
 * `claimPerson` refuses once the person has a claimed account.
 *
 * The token is printed as a QR, so every character is a denser code that a
 * phone must read off a strip of paper. It is compact on purpose, not the
 * JSON of `signedPayload.ts`: `<personId>.<expiry in base-36 seconds>.<mac>`,
 * about 50 characters. The mac is an HMAC-SHA256 over a `person-claim:`
 * prefix, cut to 96 bits: far beyond guessing online, and the prefix keeps it
 * from ever matching a token of another purpose.
 */
const MAC_BYTES = 12;

function mac(input: string): Buffer {
    return createHmac("sha256", env.NEXTAUTH_SECRET).update(input).digest().subarray(0, MAC_BYTES);
}

function claimMac(personId: string, exp: string): Buffer {
    return mac(`person-claim:${personId}:${exp}`);
}

function macMatches(given: string, expected: Buffer): boolean {
    const a = new Uint8Array(Buffer.from(given, "base64url"));
    const b = new Uint8Array(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

// Short on purpose: the sheet is printed for one council session and a strip
// left on a desk should not stay usable for long. Open the QR page right
// before printing; the clock starts when the page renders.
const CLAIM_TTL_MS = 5 * 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a claim token minted now expires. */
export function claimExpiry(now: number = Date.now()): Date {
    return new Date(now + CLAIM_TTL_MS);
}

/**
 * The last day to print as "valid until": the day before the expiry. The
 * token expires at a moment in that day, so the day itself is not safe; the
 * day before always is, in any timezone the date is written in.
 */
export function claimLastValidDay(expiresAt: Date): Date {
    return new Date(expiresAt.getTime() - DAY_MS);
}

/**
 * `expiresAt`: pass one value for a whole sheet, so the printed date holds for
 * every strip. The expiry is kept to the second, rounded down, so the token
 * never outlives the date printed from `expiresAt`.
 */
export function generatePersonClaimToken(personId: string, expiresAt: Date = claimExpiry()): string {
    const exp = Math.floor(expiresAt.getTime() / 1000).toString(36);
    return `${personId}.${exp}.${claimMac(personId, exp).toString("base64url")}`;
}

/**
 * How long past its expiry a code still counts on the way back from the
 * sign-in email: the magic link's own lifetime. A councillor who scans just
 * before the code expires must not end up with an account that the expiry
 * then refuses to link.
 */
export const CLAIM_EMAIL_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * The person the token names, or null for a forged, malformed or expired
 * token. `graceMs` extends the expiry; only the return from the sign-in email
 * passes it, after `verifyJoinConfirmation`.
 */
export function verifyPersonClaimToken(token: string, graceMs = 0): string | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [personId, exp, tag] = parts;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(personId) || !/^[0-9a-z]{1,10}$/.test(exp) || !/^[A-Za-z0-9_-]{16}$/.test(tag)) return null;

    if (!macMatches(tag, claimMac(personId, exp))) return null;
    if (Date.now() > parseInt(exp, 36) * 1000 + graceMs) return null;
    return personId;
}

/**
 * The mark of the sign-in email's link: `<issued at, base-36 seconds>.<mac>`,
 * bound to one code and to the address the email goes to. Only
 * `sendJoinEmail` mints it, and only while the code is valid, so it proves
 * that the reader confirmed the name in time. The email link may then arrive
 * after the code expired: the grace runs from when the email was sent, never
 * from a parameter the caller chose. The address is in the mac, so a copied
 * link claims nothing in a browser that is signed in as somebody else.
 */
export function signJoinConfirmation(token: string, email: string, now: number = Date.now()): string {
    const at = Math.floor(now / 1000).toString(36);
    return `${at}.${confirmationMac(token, email, at).toString("base64url")}`;
}

function confirmationMac(token: string, email: string, at: string): Buffer {
    return mac(`join-confirm:${token}:${at}:${normalizeEmail(email)}`);
}

/**
 * Whether `marker` was minted for `token` and for the account with `email`
 * while the code was valid, and is still within the grace.
 */
export function verifyJoinConfirmation(token: string, marker: string | null, email: string): boolean {
    if (!marker) return false;
    const [at, tag, ...rest] = marker.split(".");
    if (rest.length || !at || !tag || !/^[0-9a-z]{1,10}$/.test(at) || !/^[A-Za-z0-9_-]{16}$/.test(tag)) return false;
    if (!macMatches(tag, confirmationMac(token, email, at))) return false;
    const exp = token.split(".")[1];
    const issuedMs = parseInt(at, 36) * 1000;
    if (!exp || issuedMs > parseInt(exp, 36) * 1000) return false;
    return Date.now() <= issuedMs + CLAIM_EMAIL_GRACE_MS;
}

/**
 * The absolute URL to print in a person's QR, on the realm the city lives
 * on: the first page of the join flow. Nothing else rides along: every
 * character makes the code denser, and the flow counts its own scans.
 */
export function personJoinUrl(
    person: { id: string; cityId: string },
    realm: Realm | null,
    expiresAt: Date = claimExpiry(),
): string {
    return `${realmBaseUrl(realm)}${personJoinPagePath(person.cityId, generatePersonClaimToken(person.id, expiresAt))}`;
}
