import "server-only";
import { verifyPersonClaimToken } from "@/lib/auth/personClaim";
import { getJoinPerson } from "@/lib/db/personClaim";
import { getVoicePrintConsentedIds } from "@/lib/db/personConsent";
import { getCouncilTitle } from "@/lib/utils/roles";

/** What the join flow shows of the person a code names. */
export interface JoinPersonView {
    id: string;
    name: string;
    image: string | null;
    title: string | null;
    cityId: string;
    cityName: string;
}

/**
 * Where a scan stands, from the code, the database and the session. The
 * page renders from this alone, so a reload, a second device or the link in
 * the email all land on the right step.
 *
 * - invalid: forged, expired, or the person is gone.
 * - used: the person already has an account, so the code no longer works.
 *   `own` when that account is the reader's, back on a fresh scan.
 * - confirm: nobody claimed the person yet; step 1.
 * - consent: the reader's account claimed the person during this flow; the
 *   consent step, or done.
 *
 * `inFlow` says the reader is inside the flow: back from the email link, or
 * past step 1 in this tab. Only then does the owner see the consent step; a
 * fresh scan of a spent code is spent, for the owner too.
 */
export type JoinStage =
    | { kind: "invalid" }
    | { kind: "used"; signedIn: boolean; own: boolean; person: JoinPersonView }
    | { kind: "confirm"; signedIn: boolean; person: JoinPersonView }
    | { kind: "consent"; consented: boolean; person: JoinPersonView };

export async function getJoinStage(token: string | undefined, userId: string | null, inFlow = false): Promise<JoinStage> {
    const personId = token ? verifyPersonClaimToken(token) : null;
    if (!personId) return { kind: "invalid" };
    const row = await getJoinPerson(personId);
    if (!row) return { kind: "invalid" };

    const person: JoinPersonView = {
        id: row.id,
        name: row.name,
        image: row.image,
        title: getCouncilTitle(row.roles),
        cityId: row.cityId,
        cityName: row.city.name,
    };
    const claimedBy = row.administrators[0]?.userId ?? null;
    if (userId && claimedBy === userId && inFlow) {
        const consented = await getVoicePrintConsentedIds([person.id], userId);
        return { kind: "consent", consented: consented.has(person.id), person };
    }
    if (claimedBy) return { kind: "used", signedIn: userId !== null, own: userId !== null && claimedBy === userId, person };
    return { kind: "confirm", signedIn: userId !== null, person };
}
