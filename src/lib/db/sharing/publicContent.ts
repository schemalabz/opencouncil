import 'server-only';
import type { Prisma, Realm } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { PUBLIC_CITY_WHERE } from '@/lib/cityStatus';

/** The columns that `transcriptIsPublic` reads. */
export const transcriptGateSelect = {
    administrativeBody: { select: { showUnreviewedTranscript: true } },
    taskStatuses: { where: { type: 'humanReview', status: 'succeeded' }, take: 1, select: { id: true } },
} satisfies Prisma.CouncilMeetingSelect;

export const publicMeetingSelect = {
    id: true, cityId: true, name: true, name_en: true, kind: true, sessionNumber: true, dateTime: true,
    city: { select: { id: true, name: true, name_en: true, timezone: true, realm: true, logoImage: true } },
    administrativeBody: { select: { name: true, name_en: true, showUnreviewedTranscript: true } },
    taskStatuses: { where: { type: 'humanReview', status: 'succeeded' }, take: 1, select: { id: true } },
} satisfies Prisma.CouncilMeetingSelect;
export type PublicMeeting = Prisma.CouncilMeetingGetPayload<{ select: typeof publicMeetingSelect }>;

export const publicSubjectSelect = {
    id: true, name: true, description: true, cityId: true, councilMeetingId: true,
    topic: { select: { name: true, name_en: true, colorHex: true, icon: true } },
    location: { select: { text: true } },
    councilMeeting: { select: publicMeetingSelect },
} satisfies Prisma.SubjectSelect;
export type PublicSubject = Prisma.SubjectGetPayload<{ select: typeof publicSubjectSelect }>;

type TranscriptGateFields = Pick<PublicMeeting, 'taskStatuses'> & {
    administrativeBody: { showUnreviewedTranscript: boolean } | null;
};

/**
 * May a reader read the transcript of this released meeting? A body that
 * hides unreviewed transcripts shows one only after the human review. Every
 * path that gives transcript text to a reader asks this, or its database
 * form `TRANSCRIPT_PUBLIC_WHERE`.
 */
export const transcriptIsPublic = (meeting: TranscriptGateFields) =>
    meeting.administrativeBody?.showUnreviewedTranscript !== false || meeting.taskStatuses.length > 0;

/** `transcriptIsPublic` as a database filter, for a released meeting. */
export const TRANSCRIPT_PUBLIC_WHERE = {
    released: true,
    OR: [
        { administrativeBody: null },
        { administrativeBody: { showUnreviewedTranscript: true } },
        { taskStatuses: { some: { type: 'humanReview', status: 'succeeded' } } },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;

export async function getPublicMeeting(cityId: string, meetingId: string, realm: Realm) {
    return prisma.councilMeeting.findFirst({
        where: { cityId, id: meetingId, released: true, city: { ...PUBLIC_CITY_WHERE, realm } }, select: publicMeetingSelect,
    });
}

export async function getPublicSubject(cityId: string, meetingId: string, subjectId: string, realm: Realm) {
    return prisma.subject.findFirst({
        where: { id: subjectId, cityId, councilMeetingId: meetingId, councilMeeting: { released: true, city: { ...PUBLIC_CITY_WHERE, realm } } },
        select: publicSubjectSelect,
    });
}
