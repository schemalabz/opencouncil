import 'server-only';
import prisma from '@/lib/db/prisma';
import { meetingSummarySelect, type MeetingSummary } from '@/lib/db/types/meetingSummary';

/**
 * The data one meeting block of the summary widget needs, from four cheap
 * queries: the meeting with its subjects, the span of its speaker segments,
 * the number of distinct speakers, and the first discussion utterance per
 * subject. Released meetings only; null otherwise.
 */
export async function getMeetingSummary(cityId: string, meetingId: string): Promise<MeetingSummary | null> {
    const meeting = await prisma.councilMeeting.findUnique({
        where: { cityId_id: { cityId, id: meetingId }, released: true },
        select: meetingSummarySelect,
    });
    if (!meeting) return null;

    const subjectIds = meeting.subjects.map(subject => subject.id);
    const [segments, speakerCount, firstUtterances] = await Promise.all([
        prisma.speakerSegment.aggregate({
            where: { cityId, meetingId },
            _min: { startTimestamp: true },
            _max: { endTimestamp: true },
        }),
        prisma.person.count({
            where: { speakerTags: { some: { speakerSegments: { some: { cityId, meetingId } } } } },
        }),
        subjectIds.length > 0
            ? prisma.utterance.groupBy({
                by: ['discussionSubjectId'],
                where: { discussionSubjectId: { in: subjectIds }, discussionStatus: 'SUBJECT_DISCUSSION' },
                _min: { startTimestamp: true },
            })
            : [],
    ]);

    const subjectStartSeconds: Record<string, number> = {};
    for (const row of firstUtterances) {
        if (row.discussionSubjectId && row._min.startTimestamp != null) {
            subjectStartSeconds[row.discussionSubjectId] = row._min.startTimestamp;
        }
    }

    const start = segments._min.startTimestamp;
    const end = segments._max.endTimestamp;
    const durationSeconds = start != null && end != null ? Math.max(0, end - start) : null;

    return { meeting, durationSeconds, speakerCount, subjectStartSeconds };
}
