import prisma from "./prisma";
import { DataSource } from "@prisma/client";
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

        // Conditional terminal write: a dismissal that committed after the
        // read above must win — count 0 rolls the created Decision back.
        const linked = await tx.decisionCandidate.updateMany({
            where: { id: candidateId, decisionId: null, dismissedAt: null },
            data: {
                decisionId: decision.id,
                // Record the accepted placement when the pipeline had no suggestion;
                // an existing suggestion stays as-made for acceptance analysis.
                ...(candidate.subjectId ? {} : { subjectId }),
            },
        });
        if (linked.count === 0) throw new Error('Candidate is already resolved');
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

/** A candidate whose proposed subject collides with an ADA already held elsewhere. */
export interface CandidateConflict {
    candidateId: string;
    ada: string;
    claimingSubject: { id: string; name: string; cityId: string; councilMeetingId: string };
    existingDecision: {
        title: string | null;
        pdfUrl: string;
        currentSubject: { id: string; name: string; cityId: string; councilMeetingId: string };
    } | null;
}

/**
 * Conflicting candidates: unresolved, with a proposed subject, whose ADA a
 * Decision on a DIFFERENT subject already holds. Replaces the old
 * Subject.claimedAda listing — same shape, plus candidateId for resolution.
 */
export async function getConflictingCandidates(filter?: { cityId?: string; councilMeetingId?: string }): Promise<CandidateConflict[]> {
    const candidates = await prisma.decisionCandidate.findMany({
        where: {
            decisionId: null,
            dismissedAt: null,
            subjectId: { not: null },
            ...(filter?.cityId && { cityId: filter.cityId }),
            ...(filter?.councilMeetingId && { councilMeetingId: filter.councilMeetingId }),
        },
        select: { id: true, ada: true, subjectId: true },
    });
    if (candidates.length === 0) return [];

    const [holders, claimingSubjects] = await Promise.all([
        prisma.decision.findMany({
            where: { ada: { in: candidates.map(c => c.ada) } },
            select: {
                ada: true, title: true, pdfUrl: true,
                subject: { select: { id: true, name: true, cityId: true, councilMeetingId: true } },
            },
        }),
        prisma.subject.findMany({
            where: { id: { in: candidates.map(c => c.subjectId!).filter(Boolean) } },
            select: { id: true, name: true, cityId: true, councilMeetingId: true, decision: { select: { id: true } } },
        }),
    ]);
    const holderByAda = new Map(holders.filter(h => h.ada).map(h => [h.ada!, h]));
    const subjectById = new Map(claimingSubjects.map(s => [s.id, s]));

    const conflicts: CandidateConflict[] = [];
    for (const c of candidates) {
        const holder = holderByAda.get(c.ada);
        const claiming = c.subjectId ? subjectById.get(c.subjectId) : undefined;
        if (!holder || !claiming || holder.subject.id === claiming.id) continue;
        // A claimant that got its own decision since is a stale claim, not an
        // actionable conflict (parity with the old claimedAda clearing).
        if (claiming.decision) continue;
        conflicts.push({
            candidateId: c.id,
            ada: c.ada,
            claimingSubject: { id: claiming.id, name: claiming.name, cityId: claiming.cityId, councilMeetingId: claiming.councilMeetingId },
            existingDecision: {
                title: holder.title,
                pdfUrl: holder.pdfUrl,
                currentSubject: holder.subject,
            },
        });
    }
    return conflicts;
}

/**
 * Admin resolution of a conflicting candidate. 'dismiss' rejects the claim;
 * 'reassign' moves the Decision from its current subject to the claiming one —
 * an admin action, unlike the pipeline, which never moves confirmed links.
 */
export async function applyCandidateConflictResolution(
    candidateId: string,
    resolution: 'reassign' | 'dismiss',
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const candidate = await tx.decisionCandidate.findUnique({ where: { id: candidateId } });
        if (!candidate) throw new Error('Candidate not found');
        if (candidate.decisionId || candidate.dismissedAt) return; // resolved concurrently — nothing to do

        // Terminal writes below are conditional on the row still being
        // unresolved: a dismissal or assignment that commits between the read
        // above and the write must win, not be overwritten.
        const unresolved = { id: candidateId, decisionId: null, dismissedAt: null };

        if (resolution === 'dismiss' || !candidate.subjectId) {
            await tx.decisionCandidate.updateMany({ where: unresolved, data: { dismissedAt: new Date() } });
            return;
        }

        // Only move the decision if the claiming subject doesn't already have one
        const existingOnClaiming = await tx.decision.findUnique({ where: { subjectId: candidate.subjectId } });
        if (existingOnClaiming) {
            await tx.decisionCandidate.updateMany({ where: unresolved, data: { dismissedAt: new Date() } });
            return;
        }

        const holding = await tx.decision.findUnique({
            where: { ada: candidate.ada },
            include: { subject: { select: { cityId: true } } },
        });
        if (holding) {
            // Defensive: polls are per-city so cross-city conflicts shouldn't occur,
            // but guard against it to prevent modifying another city's data.
            if (holding.subject.cityId !== candidate.cityId) {
                throw new Error('Cannot reassign a decision that belongs to a different city');
            }
            // Delete to free the ADA unique constraint (this also releases the
            // holder's own candidate via onDelete: SetNull), then recreate on
            // the claiming subject with the candidate's reading fields.
            // The extracted rows cascade from Subject, not Decision, so drop
            // them explicitly or the old subject keeps votes and attendance
            // from a document that no longer belongs to it (mirrors
            // deleteDecision in ./decisions).
            await tx.subjectAttendance.deleteMany({ where: { subjectId: holding.subjectId, source: DataSource.decision } });
            await tx.subjectVote.deleteMany({ where: { subjectId: holding.subjectId, source: DataSource.decision } });
            await tx.decision.delete({ where: { id: holding.id } });
            const moved = await tx.decision.create({
                data: {
                    subjectId: candidate.subjectId,
                    ada: holding.ada,
                    pdfUrl: holding.pdfUrl,
                    protocolNumber: holding.protocolNumber,
                    title: holding.title,
                    publishDate: holding.publishDate,
                    decisionNumber: candidate.decisionNumber ?? holding.decisionNumber,
                    meetingDate: candidate.meetingDate ?? holding.meetingDate,
                    taskId: holding.taskId,
                    createdById: holding.createdById,
                },
            });
            const linkedMoved = await tx.decisionCandidate.updateMany({ where: unresolved, data: { decisionId: moved.id } });
            if (linkedMoved.count === 0) throw new Error('Candidate was resolved concurrently');
        } else {
            // Holder vanished concurrently — plain assignment
            const created = await tx.decision.create({
                data: {
                    subjectId: candidate.subjectId,
                    ada: candidate.ada,
                    title: candidate.title,
                    pdfUrl: candidate.pdfUrl,
                    protocolNumber: candidate.protocolNumber,
                    publishDate: candidate.publishDate,
                    decisionNumber: candidate.decisionNumber,
                    meetingDate: candidate.meetingDate,
                },
            });
            const linkedCreated = await tx.decisionCandidate.updateMany({ where: unresolved, data: { decisionId: created.id } });
            if (linkedCreated.count === 0) throw new Error('Candidate was resolved concurrently');
        }
    });
}
