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

/**
 * Computes temporal windows for subjects from their linked utterances.
 * Window boundaries exclude PROCEDURAL_VOTE utterances unless that's
 * all a subject has.
 */
export function computeTemporalWindows(
    utterances: WindowUtterance[],
    subjectIds: string[],
): TemporalWindow[] {
    const subjectIdSet = new Set(subjectIds);

    // Group linked utterances by subject, split by procedural vs non-procedural
    const nonProceduralBySubject = new Map<string, WindowUtterance[]>();
    const proceduralBySubject = new Map<string, WindowUtterance[]>();

    for (const u of utterances) {
        if (!u.discussionSubjectId || !subjectIdSet.has(u.discussionSubjectId)) continue;
        if (u.discussionStatus === 'PROCEDURAL_VOTE') {
            const list = proceduralBySubject.get(u.discussionSubjectId) || [];
            list.push(u);
            proceduralBySubject.set(u.discussionSubjectId, list);
        } else {
            const list = nonProceduralBySubject.get(u.discussionSubjectId) || [];
            list.push(u);
            nonProceduralBySubject.set(u.discussionSubjectId, list);
        }
    }

    const windows: TemporalWindow[] = [];
    for (const subjectId of subjectIds) {
        // Use non-procedural utterances for boundaries; fall back to procedural
        const primary = nonProceduralBySubject.get(subjectId);
        const fallback = proceduralBySubject.get(subjectId);
        const source = primary && primary.length > 0 ? primary : fallback;
        if (!source || source.length === 0) continue;

        let start = source[0].startTimestamp;
        let end = source[0].endTimestamp;
        for (const u of source) {
            if (u.startTimestamp < start) start = u.startTimestamp;
            if (u.endTimestamp > end) end = u.endTimestamp;
        }
        windows.push({ subjectId, start, end });
    }

    // Sort windows by start timestamp (earlier-starting window wins overlaps)
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

    // Build a lookup for window by subject ID
    const windowBySubjectId = new Map<string, TemporalWindow>();
    for (const w of windows) {
        windowBySubjectId.set(w.subjectId, w);
    }

    for (const u of utterances) {
        const bucket = classifyUtterance(u, windows, sortedSubjectIds, windowBySubjectId);

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

function classifyUtterance(
    u: WindowUtterance,
    windows: TemporalWindow[],
    sortedSubjectIds: string[],
    windowBySubjectId: Map<string, TemporalWindow>,
): AssignedBucket {
    // Check if utterance falls within any window (earlier-starting wins)
    for (const w of windows) {
        if (u.startTimestamp >= w.start && u.startTimestamp <= w.end) {
            // Inside this window
            if (u.discussionSubjectId && u.discussionSubjectId !== w.subjectId) {
                // Linked to a different subject — cross-subject annotation
                return { type: 'subject', subjectId: w.subjectId, crossSubjectId: u.discussionSubjectId };
            }
            return { type: 'subject', subjectId: w.subjectId };
        }
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

    // Between windows — assign to next subject
    for (let i = 0; i < sortedSubjectIds.length; i++) {
        const w = windowBySubjectId.get(sortedSubjectIds[i]);
        if (w && u.startTimestamp < w.start) {
            return { type: 'preDiscussion', nextSubjectIndex: i };
        }
    }

    // Fallback: after all known windows but before lastWindowEnd (shouldn't happen often)
    return { type: 'epilogue' };
}
