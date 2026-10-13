import { Prisma } from "@prisma/client";

/**
 * The one spelling of "a voiceprint consent is in force": a period that is
 * given and not withdrawn. Every reader and every writer of consent derives
 * its query from here, so the request filter, the result gate, the
 * voiceprint task and the deletion of voiceprints cannot disagree.
 *
 * Pure constants, in a module of their own: personConsent.ts writes the
 * periods and voiceprintsDelete.ts removes the voiceprints a closed period
 * leaves behind, and one calls the other.
 */
export const openPeriodWhere = { withdrawnAt: null } satisfies Prisma.VoicePrintConsentWhereInput;

/**
 * The people whose voice the platform may process: those with an open consent
 * period, whoever recorded it. The three places that process a voice read
 * this rule, each at its own time: the transcribe request, which selects the
 * voiceprints to match against; the transcribe result, which accepts a match;
 * and voiceprint generation, on request and on result.
 */
export const voicePrintConsentInForce = {
    voicePrintConsents: { some: openPeriodWhere },
} satisfies Prisma.PersonWhereInput;

/**
 * The voiceprints the platform may not keep: those of a person with no open
 * period. A withdrawal deletes them at once, and the cleanup script removes
 * the ones stored before consent was read.
 */
export const voicePrintsWithoutConsentWhere = {
    person: { voicePrintConsents: { none: openPeriodWhere } },
} satisfies Prisma.VoicePrintWhereInput;
