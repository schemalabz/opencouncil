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
 * - used: another account claimed the person, or, signed out, some account did.
 * - confirm: nobody claimed the person yet; step 1.
 * - consent: this account claimed the person; the consent step, or done.
 */
export type JoinStage =
    | { kind: "invalid" }
    | { kind: "used"; signedIn: boolean; person: JoinPersonView }
    | { kind: "confirm"; signedIn: boolean; person: JoinPersonView }
    | { kind: "consent"; consented: boolean; person: JoinPersonView };

export async function getJoinStage(token: string | undefined, userId: string | null): Promise<JoinStage> {
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
    if (userId && claimedBy === userId) {
        const consented = await getVoicePrintConsentedIds([person.id], userId);
        return { kind: "consent", consented: consented.has(person.id), person };
    }
    if (claimedBy) return { kind: "used", signedIn: userId !== null, person };
    return { kind: "confirm", signedIn: userId !== null, person };
}
