import { Prisma } from '@prisma/client';
import type { ExtractedDecisionData } from '@/lib/apiTypes';
import prisma from './prisma';

/**
 * Keep what the document states, as the extractor read it, on the Decision row.
 * Called inside the per-subject transaction of the poll callback. Accepts a
 * version-3 result (boolean mayorPresent, no rollCall) and a version-4 one.
 */
export async function storeDecisionFacts(
    tx: Prisma.TransactionClient,
    decisionId: string,
    d: ExtractedDecisionData,
    meta: { taskId: string; extractorVersion: string | null },
): Promise<void> {
    const mayor = d.mayorPresent;
    await tx.decision.update({
        where: { id: decisionId },
        data: {
            extractorVersion: meta.extractorVersion,
            voteResultPhrase: d.voteResult ?? null,
            declaredItemNumber: d.subjectInfo?.number ?? null,
            declaredOutOfAgenda: d.subjectInfo ? d.subjectInfo.isOutOfAgenda : null,
            mayorPresent: typeof mayor === 'boolean' ? mayor : mayor?.present ?? null,
            incomplete: d.incomplete ?? (d.warnings ?? []).some(w => w.code === 'EXTRACTION_INCOMPLETE'),
            unmatchedNames: d.unmatchedMembers ?? [],
            extraction: d as unknown as Prisma.InputJsonValue,
        },
    });
}

const decisionReadingSelect = { subjectId: true, extraction: true, extractorVersion: true } satisfies Prisma.DecisionSelect;
export type DecisionReading = Omit<Prisma.DecisionGetPayload<{ select: typeof decisionReadingSelect }>, 'subjectId'>;

/**
 * The stored reading of each decision of a meeting, by subject id. The subject
 * payloads leave the reading out (`subjectDecisionSelect`), so server code that
 * needs it reads it here.
 */
export async function getDecisionReadingsForMeeting(
    cityId: string,
    meetingId: string,
): Promise<Map<string, DecisionReading>> {
    const rows = await prisma.decision.findMany({
        where: { subject: { cityId, councilMeetingId: meetingId } },
        select: decisionReadingSelect,
    });
    return new Map(rows.map(r => [r.subjectId, { extraction: r.extraction, extractorVersion: r.extractorVersion }]));
}
