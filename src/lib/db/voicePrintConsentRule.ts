/**
 * The one spelling of "a voiceprint consent is in force": a period that is
 * given and not withdrawn. Every reader of consent derives from here: the
 * transcribe request and result, voiceprint generation, and the deletion of
 * voice data when a consent ends.
 *
 * A module of its own: personConsent.ts writes the periods and calls
 * voiceprintsDelete.ts, and both read the rule.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db/prisma";

export const openPeriodWhere = { withdrawnAt: null } satisfies Prisma.VoicePrintConsentWhereInput;

/** The people whose voice the platform may process: those with an open period, whoever recorded it. */
export const voicePrintConsentInForce = {
    voicePrintConsents: { some: openPeriodWhere },
} satisfies Prisma.PersonWhereInput;

/** The voiceprints the platform may not keep: those of a person with no open period. */
export const voicePrintsWithoutConsentWhere = {
    person: { voicePrintConsents: { none: openPeriodWhere } },
} satisfies Prisma.VoicePrintWhereInput;

/** The ids among `personIds` with a consent in force. */
export async function getConsentedPersonIds(personIds: string[]): Promise<Set<string>> {
    if (personIds.length === 0) return new Set();
    const periods = await prisma.voicePrintConsent.findMany({
        where: { personId: { in: personIds }, ...openPeriodWhere },
        select: { personId: true },
    });
    return new Set(periods.map((period) => period.personId));
}

/** Whether the person's voiceprint consent is in force now. */
export async function hasVoicePrintConsent(personId: string): Promise<boolean> {
    return (await getConsentedPersonIds([personId])).has(personId);
}
