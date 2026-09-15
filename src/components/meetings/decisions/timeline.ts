import type { MinutesData, MinutesSubject, MinutesProceduralVote, MinutesVoteResult } from '@/lib/minutes/types';
import { getAgendaLabel, type Translate } from '@/lib/utils/subjects';

export type TimelineItem =
    | { type: 'subject'; subjectId: string; position: number; subject: MinutesSubject }
    | { type: 'attendance'; atSubjectId: string; arrivals: string[]; departures: string[] }
    | { type: 'proceduralVote'; vote: MinutesProceduralVote };

export interface Timeline {
    items: TimelineItem[];
    /** Withdrawn subjects: listed after the timeline, without a position. */
    notDiscussed: MinutesSubject[];
    /** 1-based position in discussion order, keyed by subjectId. */
    positionById: Map<string, number>;
}

/** True when the transcript gives a discussion order: at least one subject has a start. */
export function hasDiscussionOrder(data: Pick<MinutesData, 'subjects'>): boolean {
    return data.subjects.some(s => s.discussion.start !== null);
}

/** 1-based position in discussion order, for the non-withdrawn subjects in the given order. */
export function positionsById(data: Pick<MinutesData, 'subjects'>): Map<string, number> {
    const map = new Map<string, number>();
    let n = 0;
    for (const s of data.subjects) {
        if (!s.withdrawn) map.set(s.subjectId, ++n);
    }
    return map;
}

/** One label for a vote's subject: the agenda marker, then the name. */
export function voteSubjectLabel(t: Translate, vote: Pick<MinutesProceduralVote, 'name' | 'agendaItemIndex' | 'nonAgendaReason'>): string {
    return `${getAgendaLabel(t, vote) ?? ''} ${vote.name}`.trim();
}

/** The one-line vote outcome sentence, shared by the decisions row and the sheet. */
export function voteResultSentence(t: (key: string, params?: Record<string, unknown>) => string, vote: MinutesVoteResult): string {
    const main = vote.isUnanimous
        ? t('unanimous', { count: vote.forMembers.length })
        : vote.passed
            ? t('majorityVote', { for: vote.forMembers.length, against: vote.againstMembers.length })
            : t('rejected', { against: vote.againstMembers.length, for: vote.forMembers.length });
    const abstain = !vote.isUnanimous && vote.abstainMembers.length > 0
        ? `, ${vote.abstainMembers.length} ${t('voteAbstain')}`
        : '';
    return main + abstain;
}

/**
 * The discussion-order view: the minutes' subjects, numbered, with the
 * meeting-level events between them. `data.subjects` arrives already sorted
 * by `getMinutesData`; this function adds nothing to that order.
 *
 * An attendance change sits before the subject it was observed at. A
 * procedural vote sits before the first placed subject that starts after it,
 * or after the last placed subject. A subject with no start never attracts an
 * event: its position is inferred, not observed.
 */
export function buildTimeline(data: Pick<MinutesData, 'subjects' | 'attendanceChanges' | 'proceduralVotes'>): Timeline {
    const active = data.subjects.filter(s => !s.withdrawn);
    const notDiscussed = data.subjects.filter(s => s.withdrawn);
    const positionById = positionsById(data);

    const changesBySubject = new Map<string, { arrivals: string[]; departures: string[] }>();
    for (const change of data.attendanceChanges) {
        const entry = changesBySubject.get(change.atSubject.id) ?? { arrivals: [], departures: [] };
        (change.type === 'arrival' ? entry.arrivals : entry.departures).push(change.name);
        changesBySubject.set(change.atSubject.id, entry);
    }

    const votes = [...data.proceduralVotes].sort((a, b) => a.timestamp - b.timestamp);
    let nextVote = 0;
    const items: TimelineItem[] = [];
    active.forEach((subject) => {
        const start = subject.discussion.start;
        if (start !== null) {
            while (nextVote < votes.length && votes[nextVote].timestamp < start) {
                items.push({ type: 'proceduralVote', vote: votes[nextVote] });
                nextVote++;
            }
        }
        const changes = changesBySubject.get(subject.subjectId);
        if (changes) items.push({ type: 'attendance', atSubjectId: subject.subjectId, ...changes });
        items.push({ type: 'subject', subjectId: subject.subjectId, position: positionById.get(subject.subjectId)!, subject });
    });
    for (; nextVote < votes.length; nextVote++) {
        items.push({ type: 'proceduralVote', vote: votes[nextVote] });
    }
    return { items, notDiscussed, positionById };
}

/** A row the minutes would print with something missing. A withdrawn subject is not part of the record, so it has no gap. */
export function subjectHasGaps(subject: MinutesSubject): boolean {
    if (subject.withdrawn) return false;
    return subject.discussion.kind === 'none' || subject.attendance === null || subject.voteResult === null;
}

export type SubjectStatusFilter = 'linked' | 'none' | 'gaps';

/** Whether a subject passes the decisions-page status filter: several values OR together. */
export function matchesStatusFilter(
    filter: ReadonlyArray<SubjectStatusFilter>,
    hasDecision: boolean,
    minutesSubject: MinutesSubject | undefined,
): boolean {
    if (filter.length === 0) return true;
    return filter.some(f => {
        switch (f) {
            case 'gaps':
                return minutesSubject ? subjectHasGaps(minutesSubject) : false;
            case 'linked':
                return hasDecision;
            case 'none':
                return !hasDecision;
            default:
                const exhaustive: never = f;
                return exhaustive;
        }
    });
}
