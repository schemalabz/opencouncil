import { Prisma } from '@prisma/client';

/**
 * A subject's highlights as the meeting, subject and search payloads carry
 * them. These payloads are public and shared through the cache, so they hold
 * only the showcased highlights, which an editor publishes, and only the
 * fields that the showcase shows. The highlights of the current user come
 * from getHighlightsForMeeting, which applies canViewHighlight.
 */
export const subjectHighlightsInclude = {
    where: { isShowcased: true, muxPlaybackId: { not: null } },
    select: {
        id: true,
        name: true,
        muxPlaybackId: true,
        videoUrl: true,
    },
} satisfies Prisma.Subject$highlightsArgs;

export type SubjectHighlight = Prisma.HighlightGetPayload<{ select: typeof subjectHighlightsInclude.select }>;
