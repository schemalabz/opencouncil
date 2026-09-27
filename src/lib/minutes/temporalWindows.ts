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
    | { type: 'subject'; subjectId: string; crossSubjectId?: string }
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
}

/**
 * The stretches of the meeting in which each subject was discussed, by subject
 * and in time order. A subject's first span is its section and its place in the
 * discussion order; a later span prints where it happened, inside the flow.
 *
 * A subject's spans are read from its utterances that are not procedural votes;
 * a subject with nothing else is read from its procedural votes. A subject's
 * discussion splits into two spans where another subject has a VOTE utterance
 * between two consecutive utterances of the subject: there the council left the
 * subject pending and decided something else (Sparta may6_2026: item 5 is
 * opened after item 4, stopped, and resumed and voted after item 14; Sparta
 * sep9_2_2026: a late remark about item 3 does not stretch item 3's section over
 * items 4–7). A joint vote tagged to one of two subjects splits nothing,
 * because no vote of a third subject falls inside either discussion.
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
                current = { start: u.startTimestamp, end: u.endTimestamp };
                subjectSpans.push(current);
                lastStarts.push(u.startTimestamp);
            }
            current.end = Math.max(current.end, u.endTimestamp);
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
 * resumed has two windows. Only a subject's first window is its section. A
 * later window prints inside the section discussed before it, with a pointer to
 * its subject (`assignUtterances`).
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
    };
}

/**
 * The utterance in `owner`'s section. An utterance linked to a different
 * subject, or one inside a later window of a different subject (`later`),
 * carries the cross-subject annotation that points to that subject.
 */
function inSection(u: WindowUtterance, owner: TemporalWindow, later?: TemporalWindow): AssignedBucket {
    const linked = u.discussionSubjectId ?? later?.subjectId;
    return linked && linked !== owner.subjectId
        ? { type: 'subject', subjectId: owner.subjectId, crossSubjectId: linked }
        : { type: 'subject', subjectId: owner.subjectId };
}

function classifyUtterance(
    u: WindowUtterance,
    windows: TemporalWindow[],
    subjectIndex: Map<string, number>,
    firstWindowBySubject: Map<string, TemporalWindow>,
): AssignedBucket {
    const isFirst = (w: TemporalWindow) => w === firstWindowBySubject.get(w.subjectId);
    // A subject's section is its first window; where two overlap, the
    // earlier-starting one wins.
    const owner = windows.find(w => isFirst(w) && u.startTimestamp >= w.start && u.startTimestamp <= w.end);
    if (owner) return inSection(u, owner);

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

    // Inside a later window of a subject, or between windows before one: the
    // council took that subject up again here. The transcript stays in time
    // order, so the utterance prints in the section discussed before it, with a
    // pointer to the resumed subject.
    const later = windows.find(w => !isFirst(w) && u.startTimestamp >= w.start && u.startTimestamp <= w.end);
    const next = windows.find(w => w.start > u.startTimestamp);
    if (later || (next && !isFirst(next))) {
        const flow = windows.findLast(w => isFirst(w) && w.start <= u.startTimestamp);
        if (flow) return inSection(u, flow, later);
    }

    // Between windows — it leads into the window that starts next in time.
    const nextSubjectIndex = next ? subjectIndex.get(next.subjectId) : undefined;
    if (nextSubjectIndex !== undefined) {
        return { type: 'preDiscussion', nextSubjectIndex };
    }

    // Fallback: after all known windows but before lastWindowEnd (shouldn't happen often)
    return { type: 'epilogue' };
}
