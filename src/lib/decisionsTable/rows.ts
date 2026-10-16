import type { NonAgendaReason, VoteType } from '@prisma/client';
import { compareAgendaPosition } from '@/lib/utils';
import { agendaItemTitleOrName, isRecordSubject, recordSection, type RecordSection } from '@/lib/utils/subjects';
import { hasRecordedVote, resultKey, type ResultKey } from '@/lib/utils/decisionResult';
import { calculateVoteResult, type VoteCounts } from '@/lib/utils/votes';

/**
 * A subject as the Πίνακας αποφάσεων reads it. The meeting page's subjects
 * carry this shape as they are; the admin decisions page maps its own
 * decisions and votes onto it, because it refreshes both after every write
 * while the page's subjects stay as the server rendered them.
 */
export interface DecisionTableSubject {
    id: string;
    name: string;
    agendaItemTitle: string | null;
    agendaItemIndex: number | null;
    agendaSectionIndex: number | null;
    nonAgendaReason: NonAgendaReason | null;
    withdrawn: boolean;
    /** What the transcript says the body decided (`Subject.outcome`). */
    outcome: string | null;
    decision: {
        decisionNumber: string | null;
        protocolNumber: string | null;
        pdfUrl: string;
        ada: string | null;
        /** What the document decides, in a sentence or two (`Decision.summary`). */
        summary: string | null;
    } | null;
    votes: ReadonlyArray<{ voteType: VoteType }>;
}

/** Where a row's summary comes from. The document is the official record and wins. */
export type SummarySource = 'document' | 'discussion';

export interface DecisionTableRow {
    subject: {
        id: string;
        /** The item as written on the official agenda, else the summary name. */
        name: string;
        agendaItemIndex: number | null;
        nonAgendaReason: NonAgendaReason | null;
        withdrawn: boolean;
    };
    section: RecordSection;
    /** Null while no decision is linked: the row is pending. */
    decision: {
        /** The decision's own number, else Diavgeia's protocol number, else null when the document carries neither. */
        number: string | null;
        pdfUrl: string;
        ada: string | null;
    } | null;
    result: ResultKey;
    /** The counts behind the result word. Null unless a vote stands behind the word. */
    voteCounts: VoteCounts | null;
    summary: { text: string; source: SummarySource } | null;
}

/**
 * The message key of each result word, in the `decisionsTable` namespace. A
 * withdrawn row has no key: it prints the withdrawal label, which depends on
 * the register. The `Record` over the union is what keeps the map complete
 * when `ResultKey` gains a member.
 */
export const RESULT_MESSAGE_KEY: Record<Exclude<ResultKey, 'withdrawn'>, string> = {
    unanimous: 'result.unanimous',
    majority: 'result.majority',
    rejected: 'result.rejected',
    none: 'result.none',
    noVote: 'result.noVote',
};

export interface DecisionTable {
    /** Agenda order: the items taken up out of the agenda first, then the agenda by section and number. */
    rows: DecisionTableRow[];
    /** The subjects before the agenda. They never take a decision, so the table folds them into one line. */
    beforeAgenda: { id: string; name: string }[];
}

/**
 * The rows of the Πίνακας αποφάσεων, built once for the three surfaces that
 * print it: the admin decisions page, the public panel and the DOCX. One
 * builder, so the three cannot disagree on which subjects are rows, in what
 * order, or on the result word beside each one.
 */
export function buildDecisionTable(subjects: ReadonlyArray<DecisionTableSubject>): DecisionTable {
    return {
        rows: orderRecordSubjects(subjects).map(buildRow),
        beforeAgenda: subjects
            .filter(s => !isRecordSubject(s))
            .map(s => ({ id: s.id, name: agendaItemTitleOrName(s) })),
    };
}

/**
 * The record subjects in the order a posted Πίνακας is written in: the items
 * taken up out of the agenda first, then the agenda by section and number —
 * the same order the minutes print (issue 366).
 */
export function orderRecordSubjects<T extends {
    agendaItemIndex: number | null;
    agendaSectionIndex: number | null;
    nonAgendaReason: string | null;
}>(subjects: ReadonlyArray<T>): T[] {
    const record = subjects.filter(isRecordSubject);
    return [
        ...record.filter(s => recordSection(s) === 'outOfAgenda'),
        ...record.filter(s => recordSection(s) === 'agenda').sort(compareAgendaPosition),
    ];
}

function buildRow(subject: DecisionTableSubject): DecisionTableRow {
    const result = resultKey({ withdrawn: subject.withdrawn, hasDecision: subject.decision !== null, votes: subject.votes });
    return {
        subject: {
            id: subject.id,
            name: agendaItemTitleOrName(subject),
            agendaItemIndex: subject.agendaItemIndex,
            nonAgendaReason: subject.nonAgendaReason,
            withdrawn: subject.withdrawn,
        },
        section: recordSection(subject),
        decision: subject.decision
            ? {
                number: subject.decision.decisionNumber || subject.decision.protocolNumber || null,
                pdfUrl: subject.decision.pdfUrl,
                ada: subject.decision.ada,
            }
            : null,
        result,
        voteCounts: hasRecordedVote(result) ? calculateVoteResult([...subject.votes]) : null,
        summary: summaryOf(subject),
    };
}

/** The document's summary when the document has one, else what the transcript says. A withdrawn subject decided nothing. */
function summaryOf(subject: DecisionTableSubject): DecisionTableRow['summary'] {
    if (subject.withdrawn) return null;
    const document = subject.decision?.summary?.trim();
    if (document) return { text: document, source: 'document' };
    const discussion = subject.outcome?.trim();
    if (discussion) return { text: discussion, source: 'discussion' };
    return null;
}
