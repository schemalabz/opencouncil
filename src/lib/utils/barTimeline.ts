/**
 * Pure derivations for the playback bar: what to paint and what to light up.
 *
 * Everything works on plain timestamp rows so it can run in one memo over the
 * client-side transcript (every utterance already carries its subject via
 * discussionSubjectId — the same predicate the server's statistics use) and be
 * unit-tested without React.
 */

export type Interval = [number, number];

export interface BarBand {
    start: number;
    end: number;
    /** The party colour, as of the meeting date. */
    speakerColor: string;
    speakerName: string;
    /** null for a procedural run (attendance, votes, chair housekeeping) */
    subjectId: string | null;
    subjectColor: string;
    subjectName: string | null;
    /** the topic's icon name, for the shared TopicIcon badge */
    subjectIcon: string | null;
}

interface UtteranceLike {
    startTimestamp: number;
    endTimestamp: number;
    discussionSubjectId: string | null;
    discussionStatus: string | null;
}

export interface SubjectRun {
    /** null for procedural talk (attendance, votes, chair housekeeping) */
    subjectId: string | null;
    start: number;
    end: number;
}

/**
 * Split one speaker segment into runs of consecutive utterances on the same
 * subject. Runs tile the segment exactly — the first starts at the segment
 * start, each boundary sits on the first utterance of the next run, and the
 * last ends at the segment end — so the bar's coverage stays gapless and a
 * band never spans two subjects. Assumes utterances in transcript order.
 */
export function utteranceRuns(
    utterances: UtteranceLike[],
    segmentStart: number,
    segmentEnd: number,
): SubjectRun[] {
    const runs: SubjectRun[] = [];
    for (const u of utterances) {
        const subjectId = u.discussionStatus === 'SUBJECT_DISCUSSION' ? (u.discussionSubjectId ?? null) : null;
        const last = runs[runs.length - 1];
        if (last && last.subjectId === subjectId) {
            last.end = u.endTimestamp;
        } else {
            if (last) last.end = u.startTimestamp;
            runs.push({ subjectId, start: last ? u.startTimestamp : segmentStart, end: u.endTimestamp });
        }
    }
    if (runs.length === 0) return [{ subjectId: null, start: segmentStart, end: segmentEnd }];
    runs[runs.length - 1].end = Math.max(runs[runs.length - 1].end, segmentEnd);
    return runs;
}

/**
 * Merge sorted-by-start intervals, joining runs whose gap is below
 * `mergeGapSeconds` — a subject's discussion is fragmented at the utterance
 * level, but a 2-second breath is not a departure from the subject.
 */
export function mergeIntervals(intervals: Interval[], mergeGapSeconds = 3): Interval[] {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    const out: Interval[] = [sorted[0].slice() as Interval];
    for (let i = 1; i < sorted.length; i++) {
        const [s, e] = sorted[i];
        const last = out[out.length - 1];
        if (s - last[1] <= mergeGapSeconds) {
            last[1] = Math.max(last[1], e);
        } else {
            out.push([s, e]);
        }
    }
    return out;
}

/** Whether [start, end] touches any of the (merged, sorted) ranges. */
export function intersectsAny(start: number, end: number, ranges: Interval[]): boolean {
    for (const [s, e] of ranges) {
        if (s >= end) return false; // sorted: nothing later can touch
        if (e > start) return true;
    }
    return false;
}

/** Binary search: the index of the band containing `time`, or -1. */
export function bandAt(bands: { start: number; end: number }[], time: number): number {
    let lo = 0;
    let hi = bands.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const b = bands[mid];
        if (time < b.start) hi = mid - 1;
        else if (time > b.end) lo = mid + 1;
        else return mid;
    }
    return -1;
}
