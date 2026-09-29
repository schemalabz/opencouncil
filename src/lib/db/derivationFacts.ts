import prisma from './prisma';
import { DataSource, type AttendanceStatus, type Prisma, type VoteType } from '@prisma/client';
import { DERIVED_SOURCES } from '@/lib/derivation/types';
import type { DerivedAttendanceRow, DerivedVoteRow, EventRow, RollCallRow } from '@/lib/derivation/types';

/**
 * The rows the derivation reads for one meeting, unshaped: the meeting with its
 * subjects and their decisions, the utterances linked to those subjects, the
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
    // The utterances the discussion order is read from (discussionOrderKeys). The
    // derivation orders subjects by the minutes' rule, because a subject has to
    // land at the same index here as on the page: that index is what an «after
    // item 3» anchor resolves against.
    const subjectIds = meeting.subjects.map(s => s.id);
    const linkedUtterances = subjectIds.length > 0
        ? await prisma.utterance.findMany({
            where: { discussionSubjectId: { in: subjectIds } },
            select: { discussionSubjectId: true, discussionStatus: true, startTimestamp: true, endTimestamp: true },
        })
        : [];
    const [rollCall, events, people, factSources, parties] = await Promise.all([
        // Only what a person states. The pages', the sheet's and the transcript's
        // roll call and events are resolved by the derivation from every stored
        // reading, and their rows are its output: reading them back would repeat a
        // partial poll or an earlier reading.
        prisma.meetingAttendance.findMany({ where: { cityId, councilMeetingId: meetingId, source: { notIn: DERIVED_SOURCES } }, select: { personId: true, status: true, source: true }, orderBy: { personId: 'asc' } }),
        getAttendanceEventsForMeeting(cityId, meetingId, { notIn: DERIVED_SOURCES }),
        prisma.person.findMany({ where: { cityId }, select: { id: true, roles: true } }),
        prisma.meetingFactSource.findMany({ where: { cityId, councilMeetingId: meetingId }, select: { source: true, status: true, reading: true } }),
        prisma.party.findMany({ where: { cityId }, select: { id: true, name: true, name_short: true } }),
    ]);
    const voted = await prisma.subjectVote.findMany({ where: { subjectId: { in: subjectIds }, source: 'decision' }, select: { subjectId: true }, distinct: ['subjectId'] });
    const subjectIdsWithStoredVotes = voted.map(r => r.subjectId).sort();
    return { meeting, linkedUtterances, rollCall, events, people, factSources, parties, subjectIdsWithStoredVotes };
}

/** The person now assigned to the speaker of each utterance, for a party that answered by voice. */
export async function readUtteranceSpeakers(utteranceIds: string[]): Promise<Map<string, string | null>> {
    if (utteranceIds.length === 0) return new Map();
    const rows = await prisma.utterance.findMany({
        where: { id: { in: utteranceIds } },
        select: { id: true, speakerSegment: { select: { speakerTag: { select: { personId: true } } } } },
    });
    return new Map(rows.map(r => [r.id, r.speakerSegment.speakerTag.personId]));
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

/**
 * Remove the derived rows of the sources named, per subject and per meeting. For
 * a source whose reading is gone or no longer counts — a removed or replaced
 * sheet — when the write that would replace its rows refuses to run: the rows
 * would otherwise stand for a reading that no longer exists.
 */
export async function deleteDerivedRowsOfSources(meeting: { cityId: string; meetingId: string }, subjectIds: string[], sources: DataSource[]): Promise<void> {
    if (sources.length === 0) return;
    const { cityId, meetingId } = meeting;
    const gone = { in: sources };
    await prisma.$transaction([
        prisma.subjectAttendance.deleteMany({ where: { subjectId: { in: subjectIds }, source: gone } }),
        prisma.subjectVote.deleteMany({ where: { subjectId: { in: subjectIds }, source: gone } }),
        prisma.meetingAttendance.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: gone } }),
        prisma.attendanceEvent.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: gone } }),
    ]);
}

/**
 * Replace the meeting's derived rows — those of every source in DERIVED_SOURCES,
 * per subject and per meeting — in one transaction. Each row is written with the
 * source whose statement decided it; a `manual` row is never touched.
 */
export async function replaceDerivedRows(
    meeting: { cityId: string; meetingId: string },
    subjectIds: string[],
    attendance: Array<Pick<DerivedAttendanceRow, 'subjectId' | 'personId' | 'status' | 'source'>>,
    votes: Array<Pick<DerivedVoteRow, 'subjectId' | 'personId' | 'voteType' | 'source'>>,
    rollCall: Array<Pick<RollCallRow, 'personId' | 'status' | 'source' | 'absenceJustified'>>,
    events: EventRow[],
    taskId: string | null,
): Promise<void> {
    const { cityId, meetingId } = meeting;
    const derived = { in: DERIVED_SOURCES };
    await prisma.$transaction(async tx => {
        await tx.subjectAttendance.deleteMany({ where: { subjectId: { in: subjectIds }, source: derived } });
        await tx.subjectVote.deleteMany({ where: { subjectId: { in: subjectIds }, source: derived } });
        await tx.meetingAttendance.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: derived } });
        await tx.attendanceEvent.deleteMany({ where: { cityId, councilMeetingId: meetingId, source: derived } });
        if (attendance.length) await tx.subjectAttendance.createMany({ data: attendance.map(a => ({ subjectId: a.subjectId, personId: a.personId, status: a.status, source: a.source, taskId })) });
        if (votes.length) await tx.subjectVote.createMany({ data: votes.map(v => ({ subjectId: v.subjectId, personId: v.personId, voteType: v.voteType, source: v.source, taskId })) });
        if (rollCall.length) await tx.meetingAttendance.createMany({ data: rollCall.map(r => ({ cityId, councilMeetingId: meetingId, personId: r.personId, status: r.status, source: r.source, absenceJustified: r.absenceJustified ?? null, taskId })) });
        if (events.length) await tx.attendanceEvent.createMany({ data: events.map(e => ({
            id: e.id, cityId, councilMeetingId: meetingId, personId: e.personId, kind: e.kind, anchorKind: e.anchorKind,
            anchorAgendaItemIndex: e.anchorAgendaItemIndex, anchorNonAgendaReason: e.anchorNonAgendaReason, anchorDecisionNumber: e.anchorDecisionNumber,
            anchorSubjectId: e.anchorSubjectId, anchorPhase: e.anchorPhase, timing: e.timing, rawText: e.rawText,
            reportingDocuments: e.reportingDocuments, totalDocuments: e.totalDocuments, source: e.source, taskId,
        })) });
    });
}

/** Every meeting of an administrative body, newest first. Ungated: the caller checks rights. */
export async function getMeetingsOfBody(administrativeBodyId: string): Promise<{ cityId: string; id: string }[]> {
    return prisma.councilMeeting.findMany({
        where: { administrativeBodyId },
        select: { cityId: true, id: true },
        orderBy: { dateTime: 'desc' },
    });
}
