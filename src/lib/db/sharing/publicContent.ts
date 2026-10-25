import 'server-only';
import type { Prisma, Realm } from '@prisma/client';
import type { AdministrativeBodyType } from '@prisma/client';
import prisma from '@/lib/db/prisma';
import { publicMeetingWhere } from '@/lib/cityStatus';
import { SECONDARY_BODY_TYPES, pipelineRunsUnattended } from '@/lib/utils/bodyTier';

/** The columns that `transcriptIsPublic` reads. */
export const transcriptGateSelect = {
    administrativeBody: { select: { showUnreviewedTranscript: true, type: true } },
    taskStatuses: { where: { type: 'humanReview', status: 'succeeded' }, take: 1, select: { id: true } },
} satisfies Prisma.CouncilMeetingSelect;

export const publicMeetingSelect = {
    id: true, cityId: true, name: true, name_en: true, kind: true, sessionNumber: true, urgent: true, dateTime: true,
    city: { select: { id: true, name: true, name_en: true, timezone: true, realm: true, logoImage: true } },
    administrativeBody: { select: { name: true, name_en: true, showUnreviewedTranscript: true, type: true } },
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
    administrativeBody: { showUnreviewedTranscript: boolean; type: AdministrativeBodyType } | null;
};

/**
 * May a reader read the transcript of this released meeting? A body that
 * hides unreviewed transcripts shows one only after the human review. A body
 * whose pipeline runs unattended (#829) has no review step, so its transcript
 * is public as it is, whatever the setting says, as on the meeting page.
 * Every path that gives transcript text to a reader asks this, or its
 * database form `TRANSCRIPT_PUBLIC_WHERE`.
 */
export const transcriptIsPublic = (meeting: TranscriptGateFields) =>
    meeting.administrativeBody?.showUnreviewedTranscript !== false
    || pipelineRunsUnattended(meeting.administrativeBody)
    || meeting.taskStatuses.length > 0;

/**
 * `transcriptIsPublic` for one meeting, read by its ids. The meeting page reads
 * it alongside the meeting: the public body that the page receives does not
 * carry the setting. False when the meeting does not exist.
 */
export async function meetingTranscriptIsPublic(cityId: string, meetingId: string): Promise<boolean> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: transcriptGateSelect,
    });
    return meeting !== null && transcriptIsPublic(meeting);
}

/**
 * Does the body that holds the meeting send no notifications (#829)? The
 * meeting page reads this one fact of the body's settings, so that it does
 * not promise a reader an update. False when the meeting has no body.
 */
export async function meetingNotificationsDisabled(cityId: string, meetingId: string): Promise<boolean> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId } },
        select: { administrativeBody: { select: { notificationBehavior: true } } },
    });
    return meeting?.administrativeBody?.notificationBehavior === 'NOTIFICATIONS_DISABLED';
}

/** `transcriptIsPublic` as a database filter, for a released meeting. */
export const TRANSCRIPT_PUBLIC_WHERE = {
    released: true,
    OR: [
        { administrativeBody: null },
        { administrativeBody: { showUnreviewedTranscript: true } },
        { administrativeBody: { type: { in: [...SECONDARY_BODY_TYPES] } } },
        { taskStatuses: { some: { type: 'humanReview', status: 'succeeded' } } },
    ],
} satisfies Prisma.CouncilMeetingWhereInput;

export async function getPublicMeeting(cityId: string, meetingId: string, realm: Realm) {
    return prisma.councilMeeting.findFirst({
        where: { cityId, id: meetingId, ...publicMeetingWhere(realm) }, select: publicMeetingSelect,
    });
}

export async function getPublicSubject(cityId: string, meetingId: string, subjectId: string, realm: Realm) {
    return prisma.subject.findFirst({
        where: { id: subjectId, cityId, councilMeetingId: meetingId, councilMeeting: publicMeetingWhere(realm) },
        select: publicSubjectSelect,
    });
}
