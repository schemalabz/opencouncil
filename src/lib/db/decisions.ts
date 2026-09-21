// Server-only: not a "use server" module, so these functions are never client
// -invocable actions. The user-facing path goes through the decisions API route
// (gated per-method by withUserAuthorizedToEdit({ cityId })); the write path is
// also driven by the pollDecisions service task, which has no user session — so
// gating must stay at the callers, not inside these functions.
import "server-only";
import prisma from './prisma';
import { localCalendarDate } from '@/lib/formatters/time';
import { AttendanceStatus, DataSource, Decision, Prisma, TaskStatus, User, VoteType } from '@prisma/client';

/** Subjects eligible for decisions: agenda + out-of-agenda, excluding withdrawn.
 *  Shared between decision count queries and the polling pipeline. */
export { DECISION_ELIGIBLE_SUBJECT_WHERE } from './decisionEligibility';
import { DECISION_ELIGIBLE_SUBJECT_WHERE } from './decisionEligibility';

export type DecisionWithSource = Decision & {
    task: TaskStatus | null;
    createdBy: User | null;
    /** True when a DecisionCandidate row backs this decision, making unlink reversible. Set by the meeting decisions GET route. */
    candidateBacked?: boolean;
};

export async function getDecisionsForMeeting(cityId: string, meetingId: string): Promise<DecisionWithSource[]> {
    return prisma.decision.findMany({
        where: {
            subject: {
                cityId,
                councilMeetingId: meetingId,
            },
        },
        include: {
            task: true,
            createdBy: true,
        },
    });
}

export interface UpsertDecisionData {
    subjectId: string;
    pdfUrl: string;
    decisionNumber?: string;
    protocolNumber?: string;
    ada?: string;
    title?: string;
    publishDate?: Date;
    taskId?: string;
    createdById?: string;
}

/**
 * What a decision document yields once it is read: the excerpt and the legal
 * references on the decision itself, and the attendance and the votes extracted
 * from it. Named once, because four writes have to clear exactly this set —
 * replacing a document, resetting an extraction, unlinking a decision, and
 * moving a decision to the subject that claims its ΑΔΑ (`claimCandidate` in
 * ./decisionCandidates).
 *
 * The last two then delete the decision row, so the excerpt update is a no-op
 * for them. The attendance and the votes are not: those rows cascade from
 * Subject, not from Decision, so they outlive the decision and leave the subject
 * stating votes from a document it no longer carries.
 *
 * Run the returned writes inside the caller's transaction, beside the write they
 * belong to.
 */
export function clearDecisionDerivedFacts(tx: Prisma.TransactionClient, subjectId: string) {
    return [
        tx.decision.updateMany({ where: { subjectId }, data: CLEARED_EXTRACTION }),
        tx.subjectAttendance.deleteMany({ where: { subjectId, source: DataSource.decision } }),
        tx.subjectVote.deleteMany({ where: { subjectId, source: DataSource.decision } }),
    ];
}

/**
 * Link a decision document to a subject, or replace the one it carries.
 *
 * Replacing the document drops what the previous one yielded, in the same
 * transaction that swaps it: an editor who corrects a wrong ΑΔΑ must never be
 * shown the old document's attendance and votes underneath the new number, and
 * the page's own rule is that everything a row states comes from one document.
 * Re-pointing at the same document — the same ΑΔΑ submitted twice, a corrected
 * decision number — keeps them, because they still describe what is linked.
 */
export async function upsertDecision(data: UpsertDecisionData): Promise<Decision> {
    const existing = await prisma.decision.findUnique({
        where: { subjectId: data.subjectId },
        select: { ada: true, pdfUrl: true },
    });
    const replacesDocument = existing !== null
        && ((data.ada ?? null) !== existing.ada || data.pdfUrl !== existing.pdfUrl);

    return prisma.$transaction(async tx => {
        if (replacesDocument) await Promise.all(clearDecisionDerivedFacts(tx, data.subjectId));
        return tx.decision.upsert({
            where: { subjectId: data.subjectId },
            create: {
                subjectId: data.subjectId,
                pdfUrl: data.pdfUrl,
                decisionNumber: data.decisionNumber ?? null,
                protocolNumber: data.protocolNumber ?? null,
                ada: data.ada ?? null,
                title: data.title ?? null,
                publishDate: data.publishDate ?? null,
                taskId: data.taskId ?? null,
                createdById: data.createdById ?? null,
            },
            update: {
                pdfUrl: data.pdfUrl,
                decisionNumber: data.decisionNumber ?? null,
                protocolNumber: data.protocolNumber ?? null,
                ada: data.ada ?? null,
                title: data.title ?? null,
                publishDate: data.publishDate ?? null,
                // Don't update taskId/createdById on updates - preserve original source
            },
        });
    });
}

export async function deleteDecision(subjectId: string): Promise<void> {
    await prisma.$transaction(async tx => {
        await Promise.all(clearDecisionDerivedFacts(tx, subjectId));
        await tx.decision.deleteMany({ where: { subjectId } });
    });
}

/**
 * What a reading left on a Decision, cleared: the text, the facts it stated and
 * the audit of the read. Every column the extraction writes belongs here, or
 * "reset" leaves the subject counting as read (`incomplete`,
 * `unmatchedNames`) and the derivation rebuilding rows from the surviving
 * `extraction`.
 */
const CLEARED_EXTRACTION = {
    excerpt: null, references: null,
    voteResultPhrase: null, mayorPresent: null, declaredItemNumber: null, declaredOutOfAgenda: null,
    incomplete: false, unmatchedNames: [], extractorVersion: null, extraction: Prisma.DbNull,
} satisfies Prisma.DecisionUpdateManyMutationInput;

export async function resetExtractionForSubject(subjectId: string): Promise<void> {
    await prisma.$transaction(async tx => {
        await Promise.all(clearDecisionDerivedFacts(tx, subjectId));
    });
}

/**
 * Clear extracted data for all decisions in a meeting, keeping the decision
 * links (pdfUrl, ada, protocolNumber) intact. Removes:
 * - everything a reading wrote on the Decision rows (CLEARED_EXTRACTION)
 * - decision-sourced SubjectAttendance and SubjectVote records
 * - the meeting's roll call and its decision-sourced AttendanceEvent rows —
 *   the events are what the arrivals/departures block prints from, and leaving
 *   them behind keeps a cleared meeting stating changes it no longer holds
 *   documents for.
 */
export async function clearExtractedDataForMeeting(cityId: string, meetingId: string): Promise<{ clearedCount: number }> {
    // Get all subject IDs for this meeting
    const subjects = await prisma.subject.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: { id: true },
    });
    const subjectIds = subjects.map(s => s.id);

    if (subjectIds.length === 0) return { clearedCount: 0 };

    // Clear all extracted data atomically to avoid partial state on failure
    const [updated] = await prisma.$transaction([
        prisma.decision.updateMany({
            where: { subjectId: { in: subjectIds } },
            data: CLEARED_EXTRACTION,
        }),
        prisma.subjectAttendance.deleteMany({
            where: { subjectId: { in: subjectIds }, source: DataSource.decision },
        }),
        prisma.subjectVote.deleteMany({
            where: { subjectId: { in: subjectIds }, source: DataSource.decision },
        }),
        prisma.meetingAttendance.deleteMany({
            where: { cityId, councilMeetingId: meetingId, source: DataSource.decision },
        }),
        prisma.attendanceEvent.deleteMany({
            where: { cityId, councilMeetingId: meetingId, source: DataSource.decision },
        }),
    ]);

    return { clearedCount: updated.count };
}

export type MeetingDecisionCounts = Record<string, { linked: number; eligible: number }>;

export async function getDecisionCountsForCity(cityId: string): Promise<MeetingDecisionCounts> {
    // Count subjects eligible for decisions (agenda + out-of-agenda, not withdrawn)
    const eligible = await prisma.subject.groupBy({
        by: ['councilMeetingId'],
        where: { cityId, ...DECISION_ELIGIBLE_SUBJECT_WHERE },
        _count: true,
    });

    // Count subjects that have a linked decision
    const linked = await prisma.subject.groupBy({
        by: ['councilMeetingId'],
        where: { cityId, ...DECISION_ELIGIBLE_SUBJECT_WHERE, decision: { isNot: null } },
        _count: true,
    });

    // Combine into a map
    const linkedMap = new Map(linked.map(r => [r.councilMeetingId, r._count]));
    const result: MeetingDecisionCounts = {};
    for (const row of eligible) {
        result[row.councilMeetingId] = {
            eligible: row._count,
            linked: linkedMap.get(row.councilMeetingId) ?? 0,
        };
    }
    return result;
}

export interface SubjectExtractedData {
    subjectId: string;
    attendance: { personId: string; personName: string; status: AttendanceStatus }[];
    votes: { personId: string; personName: string; voteType: VoteType }[];
}

export async function getExtractedDataForMeeting(
    cityId: string,
    meetingId: string
): Promise<SubjectExtractedData[]> {
    // Fetch attendance and votes for all subjects in the meeting
    const subjects = await prisma.subject.findMany({
        where: {
            cityId,
            councilMeetingId: meetingId,
            ...DECISION_ELIGIBLE_SUBJECT_WHERE,
        },
        select: {
            id: true,
            attendance: {
                select: {
                    personId: true,
                    status: true,
                    person: { select: { name: true } },
                },
                orderBy: { person: { name: 'asc' } },
            },
            votes: {
                select: {
                    personId: true,
                    voteType: true,
                    person: { select: { name: true } },
                },
                orderBy: { person: { name: 'asc' } },
            },
        },
    });

    return subjects
        .filter(s => s.attendance.length > 0 || s.votes.length > 0)
        .map(s => ({
            subjectId: s.id,
            attendance: s.attendance.map(a => ({
                personId: a.personId,
                personName: a.person.name,
                status: a.status,
            })),
            votes: s.votes.map(v => ({
                personId: v.personId,
                personName: v.person.name,
                voteType: v.voteType,
            })),
        }));
}

const meetingAttendanceSelect = {
    personId: true,
    status: true,
    person: { select: { name: true } },
} satisfies Prisma.MeetingAttendanceSelect;

export type MeetingAttendanceRecord = Prisma.MeetingAttendanceGetPayload<{ select: typeof meetingAttendanceSelect }>;

export async function getMeetingAttendance(
    cityId: string,
    meetingId: string,
): Promise<MeetingAttendanceRecord[]> {
    return prisma.meetingAttendance.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: meetingAttendanceSelect,
        orderBy: { person: { name: 'asc' } },
    });
}

/**
 * The decision a subject carries, as the subject page reads it over JSON.
 * `publishDate` is a city-local calendar date (`YYYY-MM-DD`); `updatedAt` is an
 * instant, because the page shows it as a relative time.
 */
export async function getDecisionForSubject(subjectId: string): Promise<{
    ada: string | null;
    decisionNumber: string | null;
    protocolNumber: string | null;
    title: string | null;
    pdfUrl: string;
    publishDate: string | null;
    updatedAt: string | null;
} | null> {
    const decision = await prisma.decision.findUnique({
        where: { subjectId },
        include: { subject: { select: { councilMeeting: { select: { city: { select: { timezone: true } } } } } } },
    });
    if (!decision) return null;
    return {
        ada: decision.ada,
        decisionNumber: decision.decisionNumber,
        protocolNumber: decision.protocolNumber,
        title: decision.title,
        pdfUrl: decision.pdfUrl,
        // The city's calendar date, not the UTC one: Diavgeia publishes at a
        // wall-clock time, and a document published after 21:00 Athens-summer
        // carries the next UTC day. The reader wants the day the city saw.
        publishDate: decision.publishDate
            ? localCalendarDate(decision.publishDate, decision.subject.councilMeeting.city.timezone)
            : null,
        updatedAt: decision.updatedAt?.toISOString() ?? null,
    };
}

/** One meeting's count of documents we read but could not read cleanly. */
export interface DecisionReadIssueCount {
    cityId: string;
    councilMeetingId: string;
    /** City-local calendar date of the session, so the row reads as a date. */
    sessionDate: string;
    count: number;
}

/**
 * Per meeting, how many of its decisions the extraction could not read in full:
 * the read was flagged incomplete, or it left a name it could not match to a
 * person. These are the issues a human can fix at the document — the
 * derivation's other issues follow from the facts and change with them.
 */
export async function countDecisionReadIssuesByMeeting(cityId?: string): Promise<DecisionReadIssueCount[]> {
    return prisma.$queryRaw<DecisionReadIssueCount[]>`
        SELECT s."cityId" AS "cityId",
               s."councilMeetingId" AS "councilMeetingId",
               to_char(cm."dateTime" AT TIME ZONE c.timezone, 'YYYY-MM-DD') AS "sessionDate",
               COUNT(*)::int AS count
        FROM "Decision" d
        JOIN "Subject" s ON s.id = d."subjectId"
        JOIN "CouncilMeeting" cm ON cm.id = s."councilMeetingId" AND cm."cityId" = s."cityId"
        JOIN "City" c ON c.id = s."cityId"
        WHERE (d.incomplete OR cardinality(d."unmatchedNames") > 0)
          ${cityId ? Prisma.sql`AND s."cityId" = ${cityId}` : Prisma.empty}
        GROUP BY 1, 2, 3
    `;
}
