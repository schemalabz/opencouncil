import { Prisma } from '@prisma/client';

/**
 * A subject's decision as the meeting, subject and search payloads carry it:
 * every column except `extraction`. The stored reading of a page averages
 * 7.5 KB and reaches 36 KB, and these payloads reach the browser on every
 * meeting page. Code that needs the reading loads it on the server.
 */
export const subjectDecisionSelect = {
    id: true,
    subjectId: true,
    ada: true,
    protocolNumber: true,
    decisionNumber: true,
    meetingDate: true,
    title: true,
    pdfUrl: true,
    publishDate: true,
    createdAt: true,
    updatedAt: true,
    excerpt: true,
    references: true,
    voteResultPhrase: true,
    mayorPresent: true,
    declaredItemNumber: true,
    declaredOutOfAgenda: true,
    incomplete: true,
    unmatchedNames: true,
    extractorVersion: true,
    taskId: true,
    createdById: true,
} satisfies Prisma.DecisionSelect;

export type SubjectDecision = Prisma.DecisionGetPayload<{ select: typeof subjectDecisionSelect }>;
