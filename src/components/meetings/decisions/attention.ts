import type { MeetingCandidate } from '@/lib/db/decisionCandidateShape';
import { normalizeText } from '@/lib/utils';

/**
 * Pure shaping for the meeting decisions page: what a person still has to
 * look at, how long that takes, and which documents a typed number matches.
 * Prisma-free so the unit tests stay cheap.
 */

/** MeetingCandidate as it arrives over JSON — dates serialized to strings. */
export type CandidateView = Omit<MeetingCandidate, 'publishDate' | 'meetingDate'> & {
    publishDate: string | null;
    meetingDate: string | null;
};

export interface AttentionSubject {
    id: string;
    name: string;
    agendaItemIndex: number | null;
    agendaItemTitle: string | null;
    nonAgendaReason: string | null;
    withdrawn: boolean;
}

/** The resolver suggested this document for a subject that has no decision yet. */
export interface Proposal {
    kind: 'proposal';
    candidate: CandidateView;
    subject: AttentionSubject;
    /** Confidence at or above the threshold reads as "probably a match"; below it says nothing. */
    likelyMatch: boolean;
}

/** Another subject's Decision already holds this document's ADA. */
export interface Conflict {
    kind: 'conflict';
    candidate: CandidateView;
    /** The subject that holds the decision now, when it is in this meeting. */
    holder: AttentionSubject | null;
    holderName: string;
    /** The subject the resolver wants to move it to, when it is in this meeting and still free. */
    claimant: AttentionSubject | null;
}

/** A document of this meeting that matched no subject. */
export interface Unplaced {
    kind: 'unplaced';
    candidate: CandidateView;
}

export interface Attention {
    proposals: Proposal[];
    conflicts: Conflict[];
    unplaced: Unplaced[];
    total: number;
}

/**
 * Below this the resolver's own confidence is not worth showing: a low number
 * next to a yes/no question only makes the person hesitate.
 */
export const LIKELY_MATCH_THRESHOLD = 0.6;

/**
 * Sort the meeting's open candidates into the three questions a person can
 * answer: "is this the decision of subject N?", "which subject holds it?",
 * and "which subject does this document belong to?". Each candidate lands in
 * at most one list, so the total is the count of pending items.
 */
export function buildAttention(
    subjects: AttentionSubject[],
    decisions: Record<string, unknown>,
    candidates: CandidateView[],
): Attention {
    const byId = new Map(subjects.map(s => [s.id, s]));
    const proposals: Proposal[] = [];
    const conflicts: Conflict[] = [];
    const unplaced: Unplaced[] = [];
    const proposedSubjects = new Set<string>();

    for (const candidate of candidates) {
        if (candidate.conflict) {
            // A claimant that got its own decision since is a stale claim: the
            // server would reject the move, so the only answer left is to keep.
            const claimantFree = candidate.subjectId !== null && !decisions[candidate.subjectId];
            conflicts.push({
                kind: 'conflict',
                candidate,
                holder: byId.get(candidate.conflict.subjectId) ?? null,
                holderName: candidate.conflict.subjectName,
                claimant: claimantFree && candidate.subjectId ? byId.get(candidate.subjectId) ?? null : null,
            });
            continue;
        }
        // A backfill row the resolver has not read yet carries no title and no
        // number: the next poll fills it in, and the admin overview does not
        // count it as work either.
        if (candidate.readStatus === 'unread') continue;
        const suggested = candidate.subjectId ? byId.get(candidate.subjectId) : undefined;
        if (suggested && !suggested.withdrawn && !decisions[suggested.id] && !proposedSubjects.has(suggested.id)) {
            proposedSubjects.add(suggested.id);
            proposals.push({
                kind: 'proposal',
                candidate,
                subject: suggested,
                likelyMatch: candidate.confidence != null && candidate.confidence >= LIKELY_MATCH_THRESHOLD,
            });
            continue;
        }
        unplaced.push({ kind: 'unplaced', candidate });
    }

    return { proposals, conflicts, unplaced, total: proposals.length + conflicts.length + unplaced.length };
}

/**
 * Seconds a person needs per item, measured generously: a yes/no on two
 * titles, a choice between two subjects, and reading a document's ΘΕΜΑ line
 * to find its subject.
 */
export const SECONDS_PER_ITEM = { proposal: 20, conflict: 40, unplaced: 40 } as const;

export type WorkEstimate = { kind: 'underMinute' } | { kind: 'minutes'; minutes: number };

/** The size of the job, in the unit a person plans with. */
export function estimateWork(attention: Pick<Attention, 'proposals' | 'conflicts' | 'unplaced'>): WorkEstimate {
    const seconds = attention.proposals.length * SECONDS_PER_ITEM.proposal
        + attention.conflicts.length * SECONDS_PER_ITEM.conflict
        + attention.unplaced.length * SECONDS_PER_ITEM.unplaced;
    return seconds < 60 ? { kind: 'underMinute' } : { kind: 'minutes', minutes: Math.ceil(seconds / 60) };
}

/**
 * The documents a typed decision number points at, lowest number first. An
 * empty query lists the whole pool, so the picker opens on the meeting's
 * documents. A clerk knows "545" from the minutes; the document's own number
 * may read "545/2026", so digits match the number they start with. Letters
 * match the ΑΔΑ and the title, for the person who knows the document by name.
 */
export function filterCandidatesByNumber<T extends Pick<CandidateView, 'decisionNumber' | 'ada' | 'title'>>(
    candidates: readonly T[],
    query: string,
): T[] {
    const q = query.trim();
    const digits = /^\d+$/.test(q);
    const needle = normalizeText(q);
    const matches = !q ? [...candidates] : candidates.filter(c => {
        if (digits) {
            const number = c.decisionNumber?.trim() ?? '';
            return number.startsWith(q) || number.split(/[/\-\s]/)[0] === q;
        }
        return [c.ada, c.decisionNumber, c.title].some(field => field && normalizeText(field).includes(needle));
    });
    return matches.sort((a, b) => numericPrefix(a.decisionNumber) - numericPrefix(b.decisionNumber));
}

function numericPrefix(value: string | null): number {
    const n = parseInt(value ?? '', 10);
    return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

export interface TableSplit<T> {
    visible: T[];
    hidden: T[];
}

/**
 * The table opens on its first rows. A search shows every match, and once
 * opened it stays open; the caller reports how many hidden rows lack a
 * decision so the fold never hides work.
 */
export function splitTableRows<T>(rows: T[], options: { limit: number; expanded: boolean; searching: boolean }): TableSplit<T> {
    if (options.expanded || options.searching || rows.length <= options.limit) {
        return { visible: rows, hidden: [] };
    }
    return { visible: rows.slice(0, options.limit), hidden: rows.slice(options.limit) };
}
