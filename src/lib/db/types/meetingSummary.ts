import type { Prisma } from '@prisma/client';

/**
 * Lean read for the meeting summary widget: the meeting, its body and its
 * subjects with the fields a card shows. No transcript, votes, attendance or
 * location — the widget renders none of those.
 */
export const meetingSummarySelect = {
    id: true,
    cityId: true,
    name: true,
    name_en: true,
    dateTime: true,
    administrativeBody: { select: { name: true, name_en: true } },
    subjects: {
        select: {
            id: true,
            name: true,
            description: true,
            agendaItemIndex: true,
            nonAgendaReason: true,
            topic: { select: { name: true, name_en: true, colorHex: true, icon: true } },
            _count: { select: { contributions: true } },
        },
    },
} satisfies Prisma.CouncilMeetingSelect;

export type MeetingSummaryMeeting = Prisma.CouncilMeetingGetPayload<{ select: typeof meetingSummarySelect }>;
export type MeetingSummarySubject = MeetingSummaryMeeting['subjects'][number];

/**
 * Everything one meeting block of the summary widget renders. Plain data only
 * (no Map, no class instances): it crosses `unstable_cache`, which revives a
 * hit from JSON — so `meeting.dateTime` may arrive as an ISO string.
 */
export interface MeetingSummary {
    meeting: MeetingSummaryMeeting;
    /** Seconds from the first to the last speaker segment; null before transcription. */
    durationSeconds: number | null;
    /** Distinct people with at least one speaker segment in the meeting. */
    speakerCount: number;
    /** Seconds into the recording where each subject's discussion starts, by subject id. */
    subjectStartSeconds: Record<string, number>;
}
