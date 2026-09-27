/**
 * Pure derivations for the expanded player's captions: which utterance is
 * spoken at a given time, across the whole transcript, and how to break a
 * long one into timed chunks that advance instead of freezing. Kept separate
 * from `barTimeline.ts` (bands only carry speaker/subject spans, not text)
 * and free of React, so it can be unit-tested on plain rows.
 */

interface TimedSpan {
    startTimestamp: number;
    endTimestamp: number;
}

/** A transcript utterance decorated with the speaker its own segment resolves to. */
export interface CaptionUtterance extends TimedSpan {
    id: string;
    text: string;
    speakerName: string;
    speakerColor: string;
}

interface SegmentLike<T extends TimedSpan> {
    utterances: T[];
}

/** Every utterance in the transcript, in speaking order. */
export function flattenUtterances<T extends TimedSpan>(segments: SegmentLike<T>[]): T[] {
    return segments.flatMap(segment => segment.utterances).sort((a, b) => a.startTimestamp - b.startTimestamp);
}

/**
 * The span spoken at `time`, if any. Spans can nest — an interjection
 * recorded inside a longer turn — so among the ones that cover `time`, the
 * last one to start wins: the interjection, not the turn it interrupts.
 * `spans` must already be sorted by start, ascending (see `flattenUtterances`).
 *
 * Generic so the same lookup serves both the transcript's utterances and one
 * utterance's own caption chunks (see `splitCaptionChunks`) — a caption's
 * name and its text must always come from the one span this picks, never
 * from two independent lookups that could disagree on an overlap.
 */
export function utteranceAt<T extends TimedSpan>(spans: T[], time: number): T | null {
    let match: T | null = null;
    for (const span of spans) {
        if (span.startTimestamp > time) break;
        if (time <= span.endTimestamp) match = span;
    }
    return match;
}

/** One timed portion of a long utterance, from `splitCaptionChunks`. */
export interface CaptionChunk extends TimedSpan {
    text: string;
}

/** Roughly two lines of the overlay's caption text, in characters. */
const MAX_CHUNK_CHARS = 80;

/**
 * The portions of `[start, end]` not covered by any span in `gaps` — an
 * interjection takes the caption over from the turn it interrupts (see
 * `utteranceAt`), so the turn's own chunks must not count that time as its
 * own to read through. `gaps` need not be sorted or clipped to the range.
 */
function activeSegments(start: number, end: number, gaps: TimedSpan[]): TimedSpan[] {
    const clipped = gaps
        .map(gap => ({ startTimestamp: Math.max(gap.startTimestamp, start), endTimestamp: Math.min(gap.endTimestamp, end) }))
        .filter(gap => gap.endTimestamp > gap.startTimestamp)
        .sort((a, b) => a.startTimestamp - b.startTimestamp);

    const segments: TimedSpan[] = [];
    let cursor = start;
    for (const gap of clipped) {
        if (gap.startTimestamp > cursor) segments.push({ startTimestamp: cursor, endTimestamp: gap.startTimestamp });
        cursor = Math.max(cursor, gap.endTimestamp);
    }
    if (cursor < end) segments.push({ startTimestamp: cursor, endTimestamp: end });
    return segments;
}

/**
 * Splits a long utterance into word-grouped chunks that each fit the caption
 * box, so a long turn advances across its own duration instead of freezing on
 * its first two lines the whole time. Chunks tile the utterance's span
 * exactly and in order, timed proportionally to each chunk's share of the
 * utterance's characters — word-level timestamps aren't loaded on the client
 * transcript, so this is a reading-pace estimate, not a transcription-exact
 * one. A short utterance comes back as its own single chunk.
 *
 * `gaps` are other utterances that interrupt this one (see `activeSegments`):
 * time spent showing an interjection's own caption doesn't advance this
 * utterance's chunks, so its words are still shown in full once it resumes,
 * rather than some being skipped over while the interjection had the floor.
 */
export function splitCaptionChunks(utterance: { text: string } & TimedSpan, gaps: TimedSpan[] = []): CaptionChunk[] {
    const words = utterance.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const groups: string[] = [];
    let current = '';
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (current && next.length > MAX_CHUNK_CHARS) {
            groups.push(current);
            current = word;
        } else {
            current = next;
        }
    }
    groups.push(current);

    const totalChars = groups.reduce((sum, group) => sum + group.length, 0);
    let segments = activeSegments(utterance.startTimestamp, utterance.endTimestamp, gaps);
    let activeDuration = segments.reduce((sum, seg) => sum + (seg.endTimestamp - seg.startTimestamp), 0);
    // An interjection spanning the whole utterance would leave no reading
    // time at all; fall back to the full span rather than collapse every chunk.
    if (activeDuration <= 0) {
        segments = [{ startTimestamp: utterance.startTimestamp, endTimestamp: utterance.endTimestamp }];
        activeDuration = utterance.endTimestamp - utterance.startTimestamp;
    }

    let segmentIndex = 0;
    let position = segments[0].startTimestamp;
    let remainingInSegment = segments[0].endTimestamp - segments[0].startTimestamp;

    return groups.map((text, index) => {
        const isLast = index === groups.length - 1;
        const share = totalChars > 0 ? text.length / totalChars : 1 / groups.length;
        const start = position;
        let need = activeDuration * share;
        while (need > remainingInSegment && segmentIndex < segments.length - 1) {
            need -= remainingInSegment;
            segmentIndex += 1;
            position = segments[segmentIndex].startTimestamp;
            remainingInSegment = segments[segmentIndex].endTimestamp - segments[segmentIndex].startTimestamp;
        }
        position += need;
        remainingInSegment -= need;
        const end = isLast ? utterance.endTimestamp : position;
        return { text, startTimestamp: start, endTimestamp: end };
    });
}
