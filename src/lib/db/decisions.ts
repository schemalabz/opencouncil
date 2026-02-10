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
    await prisma.decision.delete({
        where: { subjectId },
    });
}
