import "server-only";
import { CLAIM_EMAIL_GRACE_MS, verifyPersonClaimToken } from "@/lib/auth/personClaim";
import { getJoinPerson, type JoinPerson } from "@/lib/db/personClaim";
import { getVoicePrintConsents } from "@/lib/db/personConsent";
import { readerSubscribedToCity } from "@/lib/notis/reader";
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
 * The stages that can reach the done screen say whether it invites the
 * reader to the city's notifications (`offerNotifications`): the city has
 * them, and the reader does not get them yet. A signed-out confirm stage
 * carries no such answer, because there is no account to ask about: that
 * reader reaches the done screen only through the sign-in email, which
 * renders the stage again with their account.
 *
 * `inFlow` says the reader is inside the flow: back from the email link, or
 * past step 1 in this tab. Only then does the owner see the consent step; a
 * fresh scan of a spent code is spent, for the owner too.
 */
export type JoinStage =
    | { kind: "invalid" }
    | { kind: "used"; signedIn: boolean; own: boolean; person: JoinPersonView }
    | { kind: "confirm"; signedIn: false; person: JoinPersonView }
    | { kind: "confirm"; signedIn: true; person: JoinPersonView; offerNotifications: boolean }
    | { kind: "consent"; consented: boolean; person: JoinPersonView; offerNotifications: boolean };

export async function getJoinStage(token: string | undefined, userId: string | null, inFlow = false): Promise<JoinStage> {
    const current = token ? verifyPersonClaimToken(token) : null;
    // Past its expiry, a code only still opens the owner's own step inside the
    // flow: the return from the sign-in email, which linked the account.
    const personId = current ?? (token && inFlow ? verifyPersonClaimToken(token, CLAIM_EMAIL_GRACE_MS) : null);
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
    const own = userId !== null && claimedBy === userId;
    if (!current && !(own && inFlow)) return { kind: "invalid" };
    // The `userId !== null` that `own` already carries, said again so it narrows.
    if (userId !== null && own && inFlow) {
        const [consents, offerNotifications] = await Promise.all([
            getVoicePrintConsents([person.id]),
            offersNotifications(row, userId),
        ]);
        return { kind: "consent", consented: consents.has(person.id), person, offerNotifications };
    }
    if (claimedBy) return { kind: "used", signedIn: userId !== null, own, person };
    if (userId === null) return { kind: "confirm", signedIn: false, person };
    return { kind: "confirm", signedIn: true, person, offerNotifications: await offersNotifications(row, userId) };
}

/** Whether the done screen invites this reader to the city's notifications. */
async function offersNotifications(row: JoinPerson, userId: string): Promise<boolean> {
    if (!row.city.supportsNotifications) return false;
    return !(await readerSubscribedToCity(userId, row.cityId));
}
