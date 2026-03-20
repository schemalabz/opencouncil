import prisma from './prisma';
import { AttendanceStatus, DataSource, Decision, TaskStatus, User, VoteType } from '@prisma/client';

export type DecisionWithSource = Decision & {
    task: TaskStatus | null;
    createdBy: User | null;
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
    protocolNumber?: string;
    ada?: string;
    title?: string;
    publishDate?: Date;
    taskId?: string;
    createdById?: string;
}

export async function upsertDecision(data: UpsertDecisionData): Promise<Decision> {
    return prisma.decision.upsert({
        where: { subjectId: data.subjectId },
        create: {
            subjectId: data.subjectId,
            pdfUrl: data.pdfUrl,
            protocolNumber: data.protocolNumber ?? null,
            ada: data.ada ?? null,
            title: data.title ?? null,
            publishDate: data.publishDate ?? null,
            taskId: data.taskId ?? null,
            createdById: data.createdById ?? null,
        },
        update: {
            pdfUrl: data.pdfUrl,
            protocolNumber: data.protocolNumber ?? null,
            ada: data.ada ?? null,
            title: data.title ?? null,
            publishDate: data.publishDate ?? null,
            // Don't update taskId/createdById on updates - preserve original source
        },
    });
}

export async function deleteDecision(subjectId: string): Promise<void> {
    await prisma.decision.deleteMany({
        where: { subjectId },
    });
}

/**
 * Clear extracted data for all decisions in a meeting, keeping the decision
 * links (pdfUrl, ada, protocolNumber) intact. Removes:
 * - Decision.excerpt and Decision.references (set to null)
 * - Decision-sourced SubjectAttendance records
 * - Decision-sourced SubjectVote records
 */
export async function clearExtractedDataForMeeting(cityId: string, meetingId: string): Promise<{ clearedCount: number }> {
    // Get all subject IDs for this meeting
    const subjects = await prisma.subject.findMany({
        where: { cityId, councilMeetingId: meetingId },
        select: { id: true },
    });
    const subjectIds = subjects.map(s => s.id);

    if (subjectIds.length === 0) return { clearedCount: 0 };

    // Clear excerpt/references from decisions
    const updated = await prisma.decision.updateMany({
        where: { subjectId: { in: subjectIds } },
        data: { excerpt: null, references: null },
    });

    // Delete decision-sourced attendance and vote records
    await prisma.subjectAttendance.deleteMany({
        where: { subjectId: { in: subjectIds }, source: DataSource.decision },
    });
    await prisma.subjectVote.deleteMany({
        where: { subjectId: { in: subjectIds }, source: DataSource.decision },
    });

    return { clearedCount: updated.count };
}

export type MeetingDecisionCounts = Record<string, { linked: number; eligible: number }>;

export async function getDecisionCountsForCity(cityId: string): Promise<MeetingDecisionCounts> {
    // Count subjects eligible for decisions (have agendaItemIndex)
    const eligible = await prisma.subject.groupBy({
        by: ['councilMeetingId'],
        where: { cityId, agendaItemIndex: { not: null } },
        _count: true,
    });

    // Count subjects that have a linked decision
    const linked = await prisma.subject.groupBy({
        by: ['councilMeetingId'],
        where: { cityId, agendaItemIndex: { not: null }, decision: { isNot: null } },
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
        where: { cityId, councilMeetingId: meetingId, agendaItemIndex: { not: null } },
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

export async function getDecisionForSubject(subjectId: string): Promise<{
    ada: string | null;
    protocolNumber: string | null;
    title: string | null;
    pdfUrl: string;
    publishDate: string | null;
    updatedAt: string | null;
} | null> {
    const decision = await prisma.decision.findUnique({
        where: { subjectId },
    });
    if (!decision) return null;
    return {
        ada: decision.ada,
        protocolNumber: decision.protocolNumber,
        title: decision.title,
        pdfUrl: decision.pdfUrl,
        publishDate: decision.publishDate?.toISOString() ?? null,
        updatedAt: decision.updatedAt?.toISOString() ?? null,
    };
}
