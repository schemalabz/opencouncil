import { DecisionCandidate } from "@prisma/client";

/** Pure shaping for meeting decision candidates — kept prisma-free for unit tests. */

export interface MeetingCandidate {
    id: string;
    ada: string;
    title: string | null;
    pdfUrl: string;
    publishDate: Date | null;
    meetingDate: Date | null;
    decisionNumber: string | null;
    readStatus: string;
    /** The pipeline's suggested subject, if any. */
    subjectId: string | null;
    confidence: number | null;
    reasoning: string | null;
    /** Set when another subject's Decision already holds this ADA. */
    conflict: { subjectId: string; subjectName: string } | null;
}

type CandidateRow = Pick<
    DecisionCandidate,
    'id' | 'ada' | 'title' | 'pdfUrl' | 'publishDate' | 'meetingDate' | 'decisionNumber'
    | 'readStatus' | 'subjectId' | 'confidence' | 'reasoning'
>;

export interface AdaHolder {
    ada: string;
    subjectId: string;
    subjectName: string;
}

/** Pure: attach conflict info (which subject's Decision holds each ADA) to candidate rows. */
export function shapeCandidates(rows: CandidateRow[], holders: AdaHolder[]): MeetingCandidate[] {
    const holderByAda = new Map(holders.map(h => [h.ada, h]));
    return rows.map(r => {
        // A holder that IS the candidate's own suggested subject is a stale
        // claim (the admin linked it manually), not an actionable conflict —
        // parity with getConflictingCandidates in decisionCandidates.ts.
        const rawHolder = holderByAda.get(r.ada);
        const holder = rawHolder && rawHolder.subjectId !== r.subjectId ? rawHolder : undefined;
        return {
            id: r.id,
            ada: r.ada,
            title: r.title,
            pdfUrl: r.pdfUrl,
            publishDate: r.publishDate,
            meetingDate: r.meetingDate,
            decisionNumber: r.decisionNumber,
            readStatus: r.readStatus,
            subjectId: r.subjectId,
            confidence: r.confidence,
            reasoning: r.reasoning,
            conflict: holder ? { subjectId: holder.subjectId, subjectName: holder.subjectName } : null,
        };
    });
}
