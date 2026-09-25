import prisma from './prisma';
import { DataSource, type AttendanceStatus, type Prisma, type VoteType } from '@prisma/client';
import type { EventRow } from '@/lib/derivation/types';

/**
 * The rows the derivation reads for one meeting, unshaped: the meeting with its
 * subjects and their decisions, the first transcript timestamp per subject, the
 * roll-call rows and the events that sources other than the pages state, and the
 * city's people with roles. Shaping into
 * the derivation's input happens in src/lib/derivation/load.ts.
 */
export async function readDerivationRows(cityId: string, meetingId: string) {
    const meeting = await prisma.councilMeeting.findUniqueOrThrow({
        where: { cityId_id: { cityId, id: meetingId } },
        include: {
            administrativeBody: { select: { decisionConventions: true, type: true } },
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
        // Only what another source states. The pages' own roll call and events are
        // resolved by the derivation from every stored page, and the rows of source
        // `decision` are its output: reading them back would repeat a partial poll.
        prisma.meetingAttendance.findMany({ where: { cityId, councilMeetingId: meetingId, source: { not: DataSource.decision } }, select: { personId: true, status: true, source: true }, orderBy: { personId: 'asc' } }),
        getAttendanceEventsForMeeting(cityId, meetingId, { not: DataSource.decision }),
        prisma.person.findMany({ where: { cityId }, select: { id: true, roles: true } }),
    ]);
    const voted = await prisma.subjectVote.findMany({ where: { subjectId: { in: subjectIds }, source: 'decision' }, select: { subjectId: true }, distinct: ['subjectId'] });
    const subjectIdsWithStoredVotes = voted.map(r => r.subjectId).sort();
    return { meeting, firstUtteranceBySubject, rollCall, events, people, subjectIdsWithStoredVotes };
}

/**
 * The meeting's stated arrivals and departures, in a fixed order, of every
 * source or of the sources that `source` selects.
 *
 * Ordered by id as well as `createdAt` because every row of one `createMany`
 * shares a timestamp, and the replay's "first wins" tie-breaks would otherwise
 * settle differently between two runs over the same rows. The minutes read every
 * source and print the events as sentences. The derivation reads the rows of the
 * other sources in this order; it writes the rows of source `decision` in this
 * order (resolveSession) and does not read them.
 */
export async function getAttendanceEventsForMeeting(cityId: string, meetingId: string, source?: Prisma.AttendanceEventWhereInput['source']) {
    return prisma.attendanceEvent.findMany({
        where: { cityId, councilMeetingId: meetingId, source },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
}

/** Replace the meeting's decision-sourced derived rows — per subject and per meeting — in one transaction. */
export async function replaceDerivedRows(
    meeting: { cityId: string; meetingId: string },
    subjectIds: string[],
    attendance: Array<{ subjectId: string; personId: string; status: AttendanceStatus }>,
    votes: Array<{ subjectId: string; personId: string; voteType: VoteType }>,
    rollCall: Array<{ personId: string; status: AttendanceStatus }>,
    events: EventRow[],
    taskId: string | null,
): Promise<void> {
    const { cityId, meetingId } = meeting;
    await prisma.$transaction(async tx => {
        await tx.subjectAttendance.deleteMany({ where: { subjectId: { in: subjectIds }, source: DataSource.decision } });
        await tx.subjectVote.deleteMany({ where: { subjectId: { in: subjectIds }, source: DataSource.decision } });
        await tx.meetingAttendance.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: DataSource.decision } });
        await tx.attendanceEvent.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: DataSource.decision } });
        if (attendance.length) await tx.subjectAttendance.createMany({ data: attendance.map(a => ({ ...a, source: DataSource.decision, taskId })) });
        if (votes.length) await tx.subjectVote.createMany({ data: votes.map(v => ({ ...v, source: DataSource.decision, taskId })) });
        if (rollCall.length) await tx.meetingAttendance.createMany({ data: rollCall.map(r => ({ cityId, councilMeetingId: meetingId, personId: r.personId, status: r.status, source: DataSource.decision, taskId })) });
        if (events.length) await tx.attendanceEvent.createMany({ data: events.map(e => ({
            id: e.id, cityId, councilMeetingId: meetingId, personId: e.personId, kind: e.kind, anchorKind: e.anchorKind,
            anchorAgendaItemIndex: e.anchorAgendaItemIndex, anchorNonAgendaReason: e.anchorNonAgendaReason, anchorDecisionNumber: e.anchorDecisionNumber,
            anchorSubjectId: e.anchorSubjectId, anchorPhase: e.anchorPhase, timing: e.timing, rawText: e.rawText,
            reportingDocuments: e.reportingDocuments, totalDocuments: e.totalDocuments, source: DataSource.decision, taskId,
        })) });
    });
}
