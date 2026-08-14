import prisma from "./prisma";
import { shapeCandidates, type MeetingCandidate } from "./decisionCandidateShape";

export { shapeCandidates, type MeetingCandidate, type AdaHolder } from "./decisionCandidateShape";

/**
 * Meeting-scoped access to DecisionCandidate (issue #617 phase 4).
 *
 * Unresolved rows (decisionId null, dismissedAt null) are the decisions we know
 * belong to a meeting but could not place automatically. Assigning one creates
 * the Decision and links it via decisionId; deleting the Decision reverts the
 * assignment through onDelete: SetNull — no code needed here for revert.
 */

export async function getUnresolvedCandidatesForMeeting(cityId: string, meetingId: string): Promise<MeetingCandidate[]> {
    const rows = await prisma.decisionCandidate.findMany({
        where: {
            cityId,
            councilMeetingId: meetingId,
            decisionId: null,
            dismissedAt: null,
            // not_a_decision names the document, not the reader: agendas and
            // mayoral acts are nobody's work queue.
            readStatus: { not: 'not_a_decision' },
        },
        orderBy: [{ publishDate: 'asc' }, { ada: 'asc' }],
        select: {
            id: true, ada: true, title: true, pdfUrl: true, publishDate: true,
            meetingDate: true, decisionNumber: true, readStatus: true,
            subjectId: true, confidence: true, reasoning: true,
        },
    });
    if (rows.length === 0) return [];

    const holders = await prisma.decision.findMany({
        where: { ada: { in: rows.map(r => r.ada) } },
        select: { ada: true, subjectId: true, subject: { select: { name: true } } },
    });

    return shapeCandidates(
        rows,
        holders
            .filter((h): h is typeof h & { ada: string } => h.ada !== null)
            .map(h => ({ ada: h.ada, subjectId: h.subjectId, subjectName: h.subject.name })),
    );
}

/**
 * Assign an unresolved candidate to a subject: creates the Decision and links
 * the candidate to it. Throws with a human-readable message when the subject
 * already has a decision or the ADA is held elsewhere — the panel surfaces it.
 */
export async function assignCandidate(cityId: string, meetingId: string, candidateId: string, subjectId: string, userId?: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const candidate = await tx.decisionCandidate.findUnique({ where: { id: candidateId } });
        if (!candidate || candidate.cityId !== cityId || candidate.councilMeetingId !== meetingId) throw new Error('Candidate not found');
        if (candidate.decisionId || candidate.dismissedAt) throw new Error('Candidate is already resolved');

        const subjectTaken = await tx.decision.findUnique({ where: { subjectId }, select: { id: true } });
        if (subjectTaken) throw new Error('Subject already has a decision — remove it first');

        const adaHolder = await tx.decision.findUnique({ where: { ada: candidate.ada }, select: { subjectId: true } });
        if (adaHolder) throw new Error('This decision is already linked to another subject');

        const decision = await tx.decision.create({
            data: {
                subjectId,
                ada: candidate.ada,
                title: candidate.title,
                pdfUrl: candidate.pdfUrl,
                protocolNumber: candidate.protocolNumber,
                publishDate: candidate.publishDate,
                decisionNumber: candidate.decisionNumber,
                meetingDate: candidate.meetingDate,
                createdById: userId ?? null,
            },
        });

        await tx.decisionCandidate.update({
            where: { id: candidateId },
            data: {
                decisionId: decision.id,
                // Record the accepted placement when the pipeline had no suggestion;
                // an existing suggestion stays as-made for acceptance analysis.
                ...(candidate.subjectId ? {} : { subjectId }),
            },
        });
    });
}

export async function dismissCandidate(cityId: string, meetingId: string, candidateId: string): Promise<void> {
    // Conditional write: a concurrent assignment between read and update would
    // otherwise leave a row both assigned and dismissed.
    const updated = await prisma.decisionCandidate.updateMany({
        where: { id: candidateId, cityId, councilMeetingId: meetingId, decisionId: null, dismissedAt: null },
        data: { dismissedAt: new Date() },
    });
    if (updated.count === 0) {
        const candidate = await prisma.decisionCandidate.findUnique({ where: { id: candidateId }, select: { cityId: true, councilMeetingId: true } });
        if (!candidate || candidate.cityId !== cityId || candidate.councilMeetingId !== meetingId) throw new Error('Candidate not found');
        throw new Error('Candidate is already resolved');
    }
}
