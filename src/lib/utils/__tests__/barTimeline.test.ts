import { bandAt, intersectsAny, mergeIntervals, utteranceRuns } from '../barTimeline';

const u = (start: number, end: number, subjectId: string | null, status = 'SUBJECT_DISCUSSION') => ({
    startTimestamp: start,
    endTimestamp: end,
    discussionSubjectId: subjectId,
    discussionStatus: subjectId ? status : null,
});

describe('utteranceRuns', () => {
    it('groups consecutive same-subject utterances into one run', () => {
        expect(utteranceRuns([u(0, 10, 'a'), u(11, 20, 'a'), u(21, 30, 'b')], 0, 30)).toEqual([
            { subjectId: 'a', start: 0, end: 21 },
            { subjectId: 'b', start: 21, end: 30 },
        ]);
    });

    it('splits a segment that returns to an earlier subject', () => {
        expect(utteranceRuns([u(0, 10, 'a'), u(10, 20, 'b'), u(20, 30, 'a')], 0, 30)).toEqual([
            { subjectId: 'a', start: 0, end: 10 },
            { subjectId: 'b', start: 10, end: 20 },
            { subjectId: 'a', start: 20, end: 30 },
        ]);
    });

    it('treats non-discussion utterances as a null-subject run', () => {
        expect(utteranceRuns([u(0, 10, 'a', 'PROCEDURAL_VOTE'), u(10, 20, 'b')], 0, 20)).toEqual([
            { subjectId: null, start: 0, end: 10 },
            { subjectId: 'b', start: 10, end: 20 },
        ]);
    });

    it('tiles the whole segment: bounds stretch to the segment edges', () => {
        expect(utteranceRuns([u(5, 10, 'a')], 0, 20)).toEqual([{ subjectId: 'a', start: 0, end: 20 }]);
    });

    it('covers an utterance-less segment with a single null run', () => {
        expect(utteranceRuns([], 3, 9)).toEqual([{ subjectId: null, start: 3, end: 9 }]);
    });
});

describe('mergeIntervals', () => {
    it('joins runs separated by less than the gap', () => {
        expect(mergeIntervals([[0, 10], [12, 20], [40, 50]])).toEqual([[0, 20], [40, 50]]);
    });

    it('sorts unsorted input', () => {
        expect(mergeIntervals([[40, 50], [0, 10]])).toEqual([[0, 10], [40, 50]]);
    });

    it('keeps overlaps as one run', () => {
        expect(mergeIntervals([[0, 10], [5, 15]])).toEqual([[0, 15]]);
    });

    it('handles empty input', () => {
        expect(mergeIntervals([])).toEqual([]);
    });
});

describe('intersectsAny', () => {
    const ranges: [number, number][] = [[10, 20], [50, 60]];
    it('hits inside a range', () => {
        expect(intersectsAny(12, 15, ranges)).toBe(true);
    });
    it('hits on partial overlap', () => {
        expect(intersectsAny(18, 25, ranges)).toBe(true);
    });
    it('misses between ranges', () => {
        expect(intersectsAny(21, 49, ranges)).toBe(false);
    });
    it('misses after the last range', () => {
        expect(intersectsAny(61, 70, ranges)).toBe(false);
    });
});

describe('bandAt', () => {
    const bands = [{ start: 0, end: 10 }, { start: 12, end: 30 }, { start: 30, end: 45 }];
    it('finds the containing band', () => {
        expect(bandAt(bands, 5)).toBe(0);
        expect(bandAt(bands, 20)).toBe(1);
        expect(bandAt(bands, 44)).toBe(2);
    });
    it('returns -1 in a gap and outside', () => {
        expect(bandAt(bands, 11)).toBe(-1);
        expect(bandAt(bands, 99)).toBe(-1);
    });
});
