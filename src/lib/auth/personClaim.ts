import "server-only";
import type { Realm } from "@prisma/client";
import { signPayload, verifyPayload, type ExpiringPayload } from "@/lib/auth/signedPayload";
import { personJoinPagePath } from "@/lib/personJoin/paths";
import { realmBaseUrl } from "@/lib/utils/realmBaseUrl";

/**
 * A person claim link: the QR a councillor scans to get an account that
 * administers their own `Person`. The token names the person, nothing else.
 * "One claim per person" is not in the token: `claimPerson` refuses once an
 * `Administers` row for the person exists, so a leaked sheet is only a race
 * until the councillor scans, and a superadmin can end the race by linking
 * the right account by hand.
 */
interface PersonClaimPayload extends ExpiringPayload {
    personId: string;
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

/** `expiresAt`: pass one value for a whole sheet, so the printed date holds for every strip. */
export function generatePersonClaimToken(personId: string, expiresAt: Date = claimExpiry()): string {
    return signPayload<PersonClaimPayload>("person-claim", { personId, exp: expiresAt.getTime() });
}

/** The person the token names, or null for a forged, malformed or expired token. */
export function verifyPersonClaimToken(token: string): string | null {
    const data = verifyPayload<PersonClaimPayload>("person-claim", token);
    return data && typeof data.personId === "string" && data.personId ? data.personId : null;
}

/**
 * The absolute URL to print in a person's QR, on the realm the city lives
 * on: the first page of the join flow. The utm parameters ride along, so
 * Plausible shows scans per sheet and per councillor.
 */
export function personJoinUrl(
    person: { id: string; cityId: string },
    realm: Realm | null,
    expiresAt: Date = claimExpiry(),
): string {
    const url = new URL(`${realmBaseUrl(realm)}${personJoinPagePath(person.cityId, generatePersonClaimToken(person.id, expiresAt))}`);
    url.searchParams.set("utm_source", "qr");
    url.searchParams.set("utm_medium", "print");
    url.searchParams.set("utm_campaign", `council-${person.cityId}`);
    url.searchParams.set("utm_content", person.id);
    return url.toString();
}
