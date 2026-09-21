import prisma from './prisma';
import { DataSource, type AttendanceStatus, type VoteType } from '@prisma/client';

/**
 * The rows the derivation reads for one meeting, unshaped: the meeting with its
 * subjects and their decisions, the first transcript timestamp per subject, the
 * roll call, the stored events, and the city's people with roles. Shaping into
 * the derivation's input happens in src/lib/derivation/load.ts.
 */
export async function readDerivationRows(cityId: string, meetingId: string) {
    const meeting = await prisma.councilMeeting.findUniqueOrThrow({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            administrativeBody: { select: { decisionConventions: true } },
            subjects: { include: { decision: true, discussedIn: { select: { id: true } } } },
        },
    });
    // The minutes' rule (getMinutesData): a subject is ordered by its first
    // utterance that is not a procedural vote, and only a subject with nothing
    // else is ordered by its procedural vote. A subject voted on at the top of
    // the session and discussed an hour later belongs where it was discussed —
    // and has to land at the same index here as on the page, because that index
    // is what an «after item 3» anchor resolves against.
    const subjectIds = meeting.subjects.map(s => s.id);
    const firstUtteranceBySubject = new Map<string, number>();
    if (subjectIds.length > 0) {
        const [discussion, anyStatus] = await Promise.all([
            prisma.utterance.groupBy({
                by: ['discussionSubjectId'],
                // Spelled as an OR because the column is nullable and an untagged
                // utterance counts as discussion, the way the page reads it.
                where: { discussionSubjectId: { in: subjectIds }, OR: [{ discussionStatus: null }, { discussionStatus: { not: 'PROCEDURAL_VOTE' } }] },
                _min: { startTimestamp: true },
            }),
            prisma.utterance.groupBy({
                by: ['discussionSubjectId'],
                where: { discussionSubjectId: { in: subjectIds } },
                _min: { startTimestamp: true },
            }),
        ]);
        for (const u of [...discussion, ...anyStatus]) {
            if (u.discussionSubjectId && u._min.startTimestamp != null && !firstUtteranceBySubject.has(u.discussionSubjectId)) {
                firstUtteranceBySubject.set(u.discussionSubjectId, u._min.startTimestamp);
            }
        }
    }
    const [rollCall, events, people] = await Promise.all([
        prisma.meetingAttendance.findMany({ where: { cityId, councilMeetingId: meetingId }, select: { personId: true, status: true, source: true }, orderBy: { personId: 'asc' } }),
        getAttendanceEventsForMeeting(cityId, meetingId),
        prisma.person.findMany({ where: { cityId }, select: { id: true, roles: true } }),
    ]);
    const [attended, voted] = await Promise.all([
        prisma.subjectAttendance.findMany({ where: { subjectId: { in: subjectIds }, source: 'decision' }, select: { subjectId: true }, distinct: ['subjectId'] }),
        prisma.subjectVote.findMany({ where: { subjectId: { in: subjectIds }, source: 'decision' }, select: { subjectId: true }, distinct: ['subjectId'] }),
    ]);
    const subjectIdsWithStoredRows = [...new Set([...attended, ...voted].map(r => r.subjectId))].sort();
    return { meeting, firstUtteranceBySubject, rollCall, events, people, subjectIdsWithStoredRows };
}

/**
 * The meeting's stated arrivals and departures, in a fixed order.
 *
 * Ordered by id as well as `createdAt` because every row of one `createMany`
 * shares a timestamp, and the replay's "first wins" tie-breaks would otherwise
 * settle differently between two runs over the same rows. Read by the derivation
 * and by the minutes, which print the same events as sentences.
 */
export async function getAttendanceEventsForMeeting(cityId: string, meetingId: string) {
    return prisma.attendanceEvent.findMany({
        where: { cityId, councilMeetingId: meetingId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
}

/** Replace the decision-sourced derived rows of the given subjects, in one transaction. */
export async function replaceDerivedRows(
    subjectIds: string[],
    attendance: Array<{ subjectId: string; personId: string; status: AttendanceStatus }>,
    votes: Array<{ subjectId: string; personId: string; voteType: VoteType }>,
    taskId: string | null,
): Promise<void> {
    await prisma.$transaction(async tx => {
        await tx.subjectAttendance.deleteMany({ where: { subjectId: { in: subjectIds }, source: DataSource.decision } });
        await tx.subjectVote.deleteMany({ where: { subjectId: { in: subjectIds }, source: DataSource.decision } });
        if (attendance.length) await tx.subjectAttendance.createMany({ data: attendance.map(a => ({ ...a, source: DataSource.decision, taskId })) });
        if (votes.length) await tx.subjectVote.createMany({ data: votes.map(v => ({ ...v, source: DataSource.decision, taskId })) });
    });
}
