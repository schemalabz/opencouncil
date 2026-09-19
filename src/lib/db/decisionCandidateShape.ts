import { DecisionCandidate } from "@prisma/client";
import { localCalendarDate } from "@/lib/formatters/time";

/** Pure shaping for meeting decision candidates — kept prisma-free for unit tests. */

export interface MeetingCandidate {
    id: string;
    ada: string;
    title: string | null;
    pdfUrl: string;
    /**
     * The city-local calendar date (`YYYY-MM-DD`) Diavgeia published it on. Not
     * the instant: the page prints this date, and Diavgeia publishes late in the
     * evening often enough that the UTC day is the day before the city's.
     */
    publishDate: string | null;
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

/**
 * Pure: attach conflict info (which subject's Decision holds each ADA) to
 * candidate rows, and put the publish instant on the city's calendar.
 *
 * @param timeZone - The city's timezone. Always City.timezone; realms make
 * Athens an assumption, not a fact.
 */
export function shapeCandidates(rows: CandidateRow[], holders: AdaHolder[], timeZone: string): MeetingCandidate[] {
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
            publishDate: r.publishDate ? localCalendarDate(r.publishDate, timeZone) : null,
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
