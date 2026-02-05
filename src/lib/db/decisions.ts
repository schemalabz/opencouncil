import prisma from './prisma';
import { Decision, TaskStatus, User } from '@prisma/client';

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
    issueDate?: Date;
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
            issueDate: data.issueDate ?? null,
            taskId: data.taskId ?? null,
            createdById: data.createdById ?? null,
        },
        update: {
            pdfUrl: data.pdfUrl,
            protocolNumber: data.protocolNumber ?? null,
            ada: data.ada ?? null,
            title: data.title ?? null,
            issueDate: data.issueDate ?? null,
            // Don't update taskId/createdById on updates - preserve original source
        },
    });
}

export async function deleteDecision(subjectId: string): Promise<void> {
    await prisma.decision.deleteMany({
        where: { subjectId },
    });
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

export async function getDecisionForSubject(subjectId: string): Promise<{
    ada: string | null;
    protocolNumber: string | null;
    title: string | null;
    pdfUrl: string;
    issueDate: string | null;
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
        issueDate: decision.issueDate?.toISOString() ?? null,
        updatedAt: decision.updatedAt?.toISOString() ?? null,
    };
}
