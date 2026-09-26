import { DiscussionStatus } from '@prisma/client';

/** Minimal utterance shape needed for window computation and assignment. */
export interface WindowUtterance {
    id: string;
    startTimestamp: number;
    endTimestamp: number;
    discussionSubjectId: string | null;
    discussionStatus: DiscussionStatus | null;
    speakerSegment: {
        speakerTag: {
            label: string | null;
            personId: string | null;
        };
    };
    text: string;
}

export interface TemporalWindow {
    subjectId: string;
    start: number;
    end: number;
}

export type AssignedBucket =
    | { type: 'subject'; subjectId: string; window: TemporalWindow; crossSubjectId?: string }
    | { type: 'preDiscussion'; nextSubjectIndex: number }
    | { type: 'preamble' }
    | { type: 'epilogue' };

export interface AssignmentResult {
    /** Utterances assigned to each subject's transcript, keyed by subjectId */
    utterancesBySubject: Map<string, WindowUtterance[]>;
    /** Cross-subject utterance IDs within each subject, keyed by subjectId.
     *  Maps utterance ID → the subjectId it's actually linked to. */
    crossSubjectMap: Map<string, Map<string, string>>;
    /** Pre-discussion utterances, keyed by sorted subject index */
    preDiscussionByIndex: Map<number, WindowUtterance[]>;
    preambleUtterances: WindowUtterance[];
    epilogueUtterances: WindowUtterance[];
    /** The utterances that open a later window of their subject's section: the
     *  discussion resumes there, so the transcript does not join them to the
     *  block before. */
    resumedAt: Set<string>;
}

/** The utterance fields a discussion span is read from. */
export interface SpanUtterance {
    discussionSubjectId: string | null;
    discussionStatus: DiscussionStatus | null;
    startTimestamp: number;
    endTimestamp: number;
}

/** One stretch of the meeting in which a subject was discussed. */
export interface DiscussionSpan {
    start: number;
    end: number;
    /** The span holds a VOTE utterance of its own subject. */
    hasVote: boolean;
}

/**
 * The stretches of the meeting in which each subject was discussed, by subject
 * and in time order. The minutes' sections and the discussion order are both
 * read from these spans.
 *
 * A subject's spans are read from its utterances that are not procedural votes;
 * a subject with nothing else is read from its procedural votes. A subject's
 * discussion splits into two spans where another subject has a VOTE utterance
 * between two consecutive utterances of the subject: there the council left the
 * subject pending and decided something else (Sparta may6_2026: item 5 is
 * opened after item 4, stopped, and resumed and voted after item 14). A joint
 * vote tagged to one of two subjects splits nothing, because no vote of a third
 * subject falls inside either discussion.
 *
 * A span ends with the procedural votes of its subject that follow it before an
 * utterance of another subject: the vote to postpone a subject closes the span
 * that it postpones (Athens jul29_2_2026, item 2 at 17632). These votes change
 * only the end of a span, not its start or its split points, so the discussion
 * order does not read them.
 */
export function discussionSpans(utterances: SpanUtterance[]): Map<string, DiscussionSpan[]> {
    const nonProcedural = new Map<string, SpanUtterance[]>();
    const procedural = new Map<string, SpanUtterance[]>();
    const votes: TaggedAt[] = [];
    const tagged: TaggedAt[] = [];
    for (const u of utterances) {
        const id = u.discussionSubjectId;
        if (!id) continue;
        const byStatus = u.discussionStatus === 'PROCEDURAL_VOTE' ? procedural : nonProcedural;
        const list = byStatus.get(id);
        if (list) list.push(u); else byStatus.set(id, [u]);
        tagged.push({ subjectId: id, at: u.startTimestamp });
        if (u.discussionStatus === 'VOTE') votes.push({ subjectId: id, at: u.startTimestamp });
    }
    votes.sort((a, b) => a.at - b.at);
    tagged.sort((a, b) => a.at - b.at);

    const spans = new Map<string, DiscussionSpan[]>();
    for (const id of new Set([...nonProcedural.keys(), ...procedural.keys()])) {
        const source = [...(nonProcedural.get(id) ?? procedural.get(id) ?? [])]
            .sort((a, b) => a.startTimestamp - b.startTimestamp);
        const subjectSpans: DiscussionSpan[] = [];
        // The start of each span's last utterance, where its closing procedural votes begin.
        const lastStarts: number[] = [];
        let current: DiscussionSpan | null = null;
        let previousStart = -Infinity;
        for (const u of source) {
            if (!current || otherSubjectBetween(votes, id, previousStart, u.startTimestamp)) {
                current = { start: u.startTimestamp, end: u.endTimestamp, hasVote: false };
                subjectSpans.push(current);
                lastStarts.push(u.startTimestamp);
            }
            current.end = Math.max(current.end, u.endTimestamp);
            if (u.discussionStatus === 'VOTE') current.hasVote = true;
            lastStarts[lastStarts.length - 1] = u.startTimestamp;
            previousStart = u.startTimestamp;
        }
        if (nonProcedural.has(id)) {
            for (const p of procedural.get(id) ?? []) {
                const i = subjectSpans.findLastIndex(s => s.start <= p.startTimestamp);
                if (i < 0 || otherSubjectBetween(tagged, id, lastStarts[i], p.startTimestamp)) continue;
                subjectSpans[i].end = Math.max(subjectSpans[i].end, p.endTimestamp);
            }
        }
        spans.set(id, subjectSpans);
    }
    return spans;
}

interface TaggedAt {
    subjectId: string;
    at: number;
}

/** Whether `sorted` has an entry of a subject other than `subjectId` strictly inside (from, to). */
function otherSubjectBetween(sorted: TaggedAt[], subjectId: string, from: number, to: number): boolean {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (sorted[mid].at <= from) lo = mid + 1; else hi = mid;
    }
    for (let i = lo; i < sorted.length && sorted[i].at < to; i++) {
        if (sorted[i].subjectId !== subjectId) return true;
    }
    return false;
}

/**
 * The temporal windows of the given subjects, sorted by start: one window per
 * discussion span (`discussionSpans`), so a subject that was left pending and
 * resumed has two windows, and the subjects discussed in between keep their
 * own utterances.
 */
export function computeTemporalWindows(
    utterances: SpanUtterance[],
    subjectIds: string[],
): TemporalWindow[] {
    const spans = discussionSpans(utterances);
    const windows: TemporalWindow[] = subjectIds.flatMap(subjectId =>
        (spans.get(subjectId) ?? []).map(({ start, end }) => ({ subjectId, start, end })),
    );
    // Sorted by start: where two windows overlap, the earlier-starting one wins.
    windows.sort((a, b) => a.start - b.start);
    return windows;
}

/**
 * Assigns every utterance to exactly one bucket by walking the timeline.
 * @param utterances All meeting utterances, sorted by startTimestamp ascending.
 * @param windows Temporal windows sorted by start ascending.
 * @param sortedSubjectIds Subject IDs in discussion order (for pre-discussion indexing).
 */
export function assignUtterances(
    utterances: WindowUtterance[],
    windows: TemporalWindow[],
    sortedSubjectIds: string[],
): AssignmentResult {
    const utterancesBySubject = new Map<string, WindowUtterance[]>();
    const crossSubjectMap = new Map<string, Map<string, string>>();
    const preDiscussionByIndex = new Map<number, WindowUtterance[]>();
    const preambleUtterances: WindowUtterance[] = [];
    const epilogueUtterances: WindowUtterance[] = [];
    const resumedAt = new Set<string>();
    const lastWindowBySubject = new Map<string, TemporalWindow>();
    const subjectIndex = new Map(sortedSubjectIds.map((id, i) => [id, i]));
    const firstWindowBySubject = new Map<string, TemporalWindow>();
    for (const w of windows) {
        if (!firstWindowBySubject.has(w.subjectId)) firstWindowBySubject.set(w.subjectId, w);
    }

    for (const u of utterances) {
        const bucket = classifyUtterance(u, windows, subjectIndex, firstWindowBySubject);

        switch (bucket.type) {
            case 'subject': {
                const list = utterancesBySubject.get(bucket.subjectId) || [];
                list.push(u);
                utterancesBySubject.set(bucket.subjectId, list);

                const lastWindow = lastWindowBySubject.get(bucket.subjectId);
                if (lastWindow && lastWindow !== bucket.window) resumedAt.add(u.id);
                lastWindowBySubject.set(bucket.subjectId, bucket.window);

                // Track cross-subject references
                if (bucket.crossSubjectId) {
                    let subjectCrossMap = crossSubjectMap.get(bucket.subjectId);
                    if (!subjectCrossMap) {
                        subjectCrossMap = new Map();
                        crossSubjectMap.set(bucket.subjectId, subjectCrossMap);
                    }
                    subjectCrossMap.set(u.id, bucket.crossSubjectId);
                }
                break;
            }
            case 'preDiscussion': {
                const list = preDiscussionByIndex.get(bucket.nextSubjectIndex) || [];
                list.push(u);
                preDiscussionByIndex.set(bucket.nextSubjectIndex, list);
                break;
            }
            case 'preamble':
                preambleUtterances.push(u);
                break;
            case 'epilogue':
                epilogueUtterances.push(u);
                break;
        }
    }

    return {
        utterancesBySubject,
        crossSubjectMap,
        preDiscussionByIndex,
        preambleUtterances,
        epilogueUtterances,
        resumedAt,
    };
}

function classifyUtterance(
    u: WindowUtterance,
    windows: TemporalWindow[],
    subjectIndex: Map<string, number>,
    firstWindowBySubject: Map<string, TemporalWindow>,
): AssignedBucket {
    // Check if utterance falls within any window. The earlier-starting window
    // wins, except that a later window of a subject wins over the window it lies
    // in: the council took that subject up again there.
    let owner: TemporalWindow | undefined;
    for (const w of windows) {
        if (u.startTimestamp < w.start || u.startTimestamp > w.end) continue;
        if (w !== firstWindowBySubject.get(w.subjectId)) {
            owner = w;
            break;
        }
        owner ??= w;
    }
    if (owner) {
        if (u.discussionSubjectId && u.discussionSubjectId !== owner.subjectId) {
            // Linked to a different subject — cross-subject annotation
            return { type: 'subject', subjectId: owner.subjectId, window: owner, crossSubjectId: u.discussionSubjectId };
        }
        return { type: 'subject', subjectId: owner.subjectId, window: owner };
    }

    // Not inside any window — determine position relative to windows
    if (windows.length === 0) {
        return { type: 'preamble' };
    }

    const firstWindowStart = windows[0].start;
    const lastWindowEnd = Math.max(...windows.map(w => w.end));

    if (u.startTimestamp < firstWindowStart) {
        return { type: 'preamble' };
    }
    if (u.startTimestamp > lastWindowEnd) {
        return { type: 'epilogue' };
    }

    // Between windows — it leads into the window that starts next in time. A
    // subject's section can hold several windows, so the next window, and not
    // the next subject in the printed order, says which subject the utterance
    // leads into. Before a later window of a subject it is where the discussion
    // resumes, and it prints inside that subject's section, in time order.
    const next = windows.find(w => w.start > u.startTimestamp);
    if (next && next !== firstWindowBySubject.get(next.subjectId)) {
        return { type: 'subject', subjectId: next.subjectId, window: next };
    }
    const nextSubjectIndex = next ? subjectIndex.get(next.subjectId) : undefined;
    if (nextSubjectIndex !== undefined) {
        return { type: 'preDiscussion', nextSubjectIndex };
    }

    // Fallback: after all known windows but before lastWindowEnd (shouldn't happen often)
    return { type: 'epilogue' };
}
