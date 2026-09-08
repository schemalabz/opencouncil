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
            // max, not assignment: an utterance nested inside the previous one
            // must not shrink the run and tear a phantom gap in the tiling
            last.end = Math.max(last.end, u.endTimestamp);
        } else {
            if (last) last.end = Math.max(last.start, u.startTimestamp);
            const start = last ? Math.max(u.startTimestamp, last.end) : segmentStart;
            runs.push({ subjectId, start, end: Math.max(u.endTimestamp, start) });
        }
    }
    if (runs.length === 0) return [{ subjectId: null, start: segmentStart, end: segmentEnd }];
    runs[runs.length - 1].end = Math.max(runs[runs.length - 1].end, segmentEnd);
    return runs;
}

/**
 * Flatten bands sorted by start into disjoint bands, the invariant `bandAt`'s
 * binary search needs. Real transcripts contain nested and partially
 * overlapping speaker segments (an interjection recorded inside a longer
 * turn); the later-starting band wins its span — it is the interruption — and
 * the earlier band resumes after it. Zero-width fragments are dropped.
 */
export function resolveOverlaps(bands: BarBand[]): BarBand[] {
    const out: BarBand[] = [];
    const stack: BarBand[] = [];
    let cursor = -Infinity;

    const emit = (band: BarBand, start: number, end: number) => {
        if (end - start > 1e-6) out.push(start === band.start && end === band.end ? band : { ...band, start, end });
    };
    const drainUpTo = (limit: number) => {
        while (stack.length > 0 && stack[stack.length - 1].end <= limit) {
            const seg = stack.pop()!;
            emit(seg, Math.max(seg.start, cursor), seg.end);
            cursor = Math.max(cursor, seg.end);
        }
    };

    for (const band of bands) {
        drainUpTo(band.start);
        const top = stack[stack.length - 1];
        if (top) {
            emit(top, Math.max(top.start, cursor), band.start);
            cursor = Math.max(cursor, band.start);
        }
        stack.push(band);
    }
    drainUpTo(Infinity);
    return out;
}

/** One painted run of the strip: what `coalesceSpans` returns. */
export interface CoalescedSpan {
    start: number;
    end: number;
    color: string;
    lit: boolean;
}

/**
 * Join neighbouring bands that would paint the same, so a strip drawn at
 * sliver scale carries a few dozen spans instead of one per band. Bands
 * separated by less than `gapSeconds` count as neighbours — at that scale the
 * gap between two turns is narrower than a pixel. Takes the disjoint bands in
 * time order that `resolveOverlaps` produces.
 */
export function coalesceSpans(
    bands: BarBand[],
    colorOf: (band: BarBand) => string,
    litOf: (band: BarBand) => boolean,
    gapSeconds: number,
): CoalescedSpan[] {
    const out: CoalescedSpan[] = [];
    for (const band of bands) {
        const color = colorOf(band);
        const lit = litOf(band);
        const last = out[out.length - 1];
        if (last && last.color === color && last.lit === lit && band.start - last.end < gapSeconds) {
            last.end = band.end;
        } else {
            out.push({ start: band.start, end: band.end, color, lit });
        }
    }
    return out;
}

import type { SubjectCategoryKey } from './subjects';

export type ChapterKey = SubjectCategoryKey;

export interface Chapter {
    key: ChapterKey;
    start: number;
}

/** A run of discussion on a subject of one category, in seconds. */
export interface ChapterItem {
    category: ChapterKey;
    start: number;
    end: number;
}

/** How long a category has to hold the floor for its chapter to begin. */
export const CHAPTER_FLOOR_SECONDS = 120;
/** ...within this long of the candidate start. */
export const CHAPTER_WINDOW_SECONDS = 600;

/**
 * The bar's chapters: one per agenda category present, starting where the
 * category takes the floor — the first run from which it holds at least
 * CHAPTER_FLOOR_SECONDS of the next CHAPTER_WINDOW_SECONDS.
 *
 * The first mention is not the start. A member answering a question on an
 * agenda item in the middle of the προ ημερησίας, or a vote to admit an
 * urgent item an hour before it is discussed, is a brief visit; on the
 * meetings we have, the first-mention rule opened chapters up to an hour
 * early on such visits. A category that never holds the floor that long — a
 * couple of announcements, one urgent item — starts at its first mention:
 * brief visits are all it has.
 *
 * The preamble (roll call, housekeeping) belongs to the first chapter, so its
 * start folds back to `transcriptStart`, the first utterance — not to 0: the
 * recording often rolls for minutes before anyone speaks, and that is no
 * chapter. Fewer than two chapters means the meeting has no structure worth
 * drawing — empty result.
 */
export function chapterStarts(items: ChapterItem[], transcriptStart = 0): Chapter[] {
    const byCategory = new Map<ChapterKey, Interval[]>();
    for (const item of items) {
        const runs = byCategory.get(item.category);
        const run: Interval = [item.start, item.end];
        if (runs) runs.push(run);
        else byCategory.set(item.category, [run]);
    }
    const out: Chapter[] = [];
    for (const [key, runs] of byCategory) {
        // Joined where they touch or overlap: an interjection recorded inside
        // another speaker's segment must not count its seconds twice.
        const floor = mergeIntervals(runs, 0);
        out.push({ key, start: sustainedStart(floor) ?? floor[0][0] });
    }
    if (out.length < 2) return [];
    out.sort((a, b) => a.start - b.start);
    out[0] = { ...out[0], start: transcriptStart };
    return out;
}

/** The earliest start in a sorted, disjoint floor from which it holds for long enough, if any. */
function sustainedStart(floor: Interval[]): number | null {
    for (let i = 0; i < floor.length; i++) {
        const candidate = floor[i][0];
        const windowEnd = candidate + CHAPTER_WINDOW_SECONDS;
        let held = 0;
        for (let j = i; j < floor.length && floor[j][0] < windowEnd; j++) {
            held += Math.min(floor[j][1], windowEnd) - floor[j][0];
            if (held >= CHAPTER_FLOOR_SECONDS) return candidate;
        }
    }
    return null;
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

/**
 * The chapter start the strip's chapter key lands on: the first one after
 * `time` going forward, the last one before it going back. Going back from the
 * middle of a chapter therefore restarts that chapter, and a second press
 * reaches the one before it — the same two steps a track button gives.
 *
 * Returns null when there is no chapter that way. The caller then takes a
 * plain large step, the behaviour a slider's Page keys owe the user.
 *
 * The half-second margin keeps a playhead parked on a boundary from landing on
 * the boundary it already sits on.
 */
export function chapterJumpTarget(chapters: Chapter[], time: number, direction: 1 | -1): number | null {
    if (direction === 1) {
        for (const chapter of chapters) {
            if (chapter.start > time + 0.5) return chapter.start;
        }
        return null;
    }
    for (let i = chapters.length - 1; i >= 0; i--) {
        if (chapters[i].start < time - 0.5) return chapters[i].start;
    }
    return null;
}

/** The message key (transcript.controls) that names each chapter, on the rail and in the lens. */
export const CHAPTER_LABEL_KEY = {
    beforeAgenda: 'chapterBeforeAgenda',
    agenda: 'chapterAgenda',
    outOfAgenda: 'chapterOutOfAgenda',
} as const satisfies Record<ChapterKey, string>;

// ── The lens: ten minutes of the strip, magnified above it ──────────────────

/** The span a lens window covers. */
export const LENS_SPAN_SECONDS = 600;
/** Below this the strip is precise enough on its own and the plain tooltip stays. */
export const LENS_MIN_DURATION_SECONDS = 2 * 60 * 60;
/** The margin the lens keeps from the viewport's edges. */
export const LENS_MARGIN = 8;

/** The time at strip x, clamped to the strip. Without a width or a duration there is no mapping: 0. */
export function timeAt(x: number, width: number, duration: number): number {
    if (width <= 0 || duration <= 0) return 0;
    return (Math.min(Math.max(x, 0), width) / width) * duration;
}

/**
 * The window start with `time` centred. At the meeting's ends the window
 * shifts rather than narrows, so the ruler's cadence and the bands' scale
 * never change; the marker walks off-centre instead.
 */
export function lensWindowStart(time: number, duration: number, span = LENS_SPAN_SECONDS): number {
    return Math.min(Math.max(time - span / 2, 0), Math.max(0, duration - span));
}

/**
 * The lens's left edge in strip coordinates: centred on the pointer, kept
 * inside the viewport by `margin`. A viewport narrower than the lens pins it
 * to the left margin.
 */
export function lensLeft(pointerX: number, lensWidth: number, stripLeft: number, viewportWidth: number, margin = LENS_MARGIN): number {
    const min = margin - stripLeft;
    const max = viewportWidth - margin - stripLeft - lensWidth;
    if (max < min) return min;
    return Math.min(Math.max(pointerX - lensWidth / 2, min), max);
}

/** How often the ruler labels a minute, in seconds, so HH:MM:SS labels never touch. */
export function rulerLabelStep(lensWidth: number, span = LENS_SPAN_SECONDS): 60 | 120 | 300 {
    const pxPerMinute = lensWidth / (span / 60);
    if (pxPerMinute >= 56) return 60;
    if (pxPerMinute >= 28) return 120;
    return 300;
}

/**
 * One step of a fine drag: the marker goes to `time`, and when that leaves
 * the window the window slides just far enough to keep it — the drag never
 * dead-ends at an edge.
 */
export function slideFine(time: number, windowStart: number, duration: number, span = LENS_SPAN_SECONDS): { time: number; windowStart: number } {
    const clampedTime = Math.min(Math.max(time, 0), duration);
    let start = windowStart;
    if (clampedTime < start) start = clampedTime;
    else if (clampedTime > start + span) start = clampedTime - span;
    start = Math.min(Math.max(start, 0), Math.max(0, duration - span));
    return { time: clampedTime, windowStart: start };
}

// ── The speed badge on the dock's video ─────────────────────────────────────

/** What one activation of the badge steps through. */
export const SPEED_CYCLE = [1, 1.25, 1.5, 2];
/** What the badge's long-press menu offers — a superset of the cycle. */
export const SPEED_MENU = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** Two speeds are the same speed: the values come as decimals from storage and from the menu. */
export function sameSpeed(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.01;
}

/**
 * The speed one activation of the badge selects next. A speed the cycle does
 * not hold — the menu's 0.5×, 0.75× and 3×, or any value restored from
 * storage — advances to the next higher cycle value, and wraps to the first
 * when it is already past the last. Without that step every off-cycle speed
 * fell back to 1×, so 1.75× jumped down instead of up.
 */
export function cycleSpeed(speed: number): number {
    const index = SPEED_CYCLE.findIndex(value => sameSpeed(value, speed));
    if (index >= 0) return SPEED_CYCLE[(index + 1) % SPEED_CYCLE.length];
    return SPEED_CYCLE.find(value => value > speed) ?? SPEED_CYCLE[0];
}

/** The badge's and the menu's label: `1×`, `1.25×`, `1.5×`. */
export function formatSpeed(value: number): string {
    return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}
