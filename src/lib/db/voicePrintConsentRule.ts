import { Prisma } from "@prisma/client";

/**
 * The one spelling of "a voiceprint consent is in force": a period that is
 * given and not withdrawn. Every reader of consent derives from here, so
 * these cannot disagree:
 * - the transcribe request sends only the voiceprints of people with one;
 * - the transcribe result keeps a voiceprint match only for them;
 * - voiceprint generation starts, and stores its result, only for them;
 * - when a consent ends, the person's voice data is deleted (voiceprintsDelete.ts).
 *
 * Pure constants, in a module of their own: personConsent.ts writes the
 * periods, voiceprintsDelete.ts deletes what a closed period leaves, and the
 * first calls the second.
 */
export const openPeriodWhere = { withdrawnAt: null } satisfies Prisma.VoicePrintConsentWhereInput;

/** The people whose voice the platform may process: those with an open period, whoever recorded it. */
export const voicePrintConsentInForce = {
    voicePrintConsents: { some: openPeriodWhere },
} satisfies Prisma.PersonWhereInput;

/** The voiceprints the platform may not keep: those of a person with no open period. */
export const voicePrintsWithoutConsentWhere = {
    person: { voicePrintConsents: { none: openPeriodWhere } },
} satisfies Prisma.VoicePrintWhereInput;
