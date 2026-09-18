import { Prisma } from '@prisma/client';

/**
 * The speaker tag fields anyone may read.
 *
 * A tag also carries speaker hints (who the voiceprint match and the transcript
 * each say the speaker is). Those are for reviewers only, and are read through
 * getSpeakerHintsForMeeting, which checks edit rights. Every other query selects
 * a tag through this constant, so a new column never reaches a public page by
 * default.
 *
 * personSetBy is public on purpose. It says how the name a reader sees was
 * decided — by a method or by a reviewer — and nothing about the opinion that
 * lost.
 */
export const publicSpeakerTagSelect = {
    id: true,
    createdAt: true,
    updatedAt: true,
    label: true,
    personId: true,
    personSetBy: true,
} satisfies Prisma.SpeakerTagSelect;

export type PublicSpeakerTag = Prisma.SpeakerTagGetPayload<{ select: typeof publicSpeakerTagSelect }>;
