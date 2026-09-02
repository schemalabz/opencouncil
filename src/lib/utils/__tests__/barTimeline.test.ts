import { bandAt, chapterStarts, intersectsAny, mergeIntervals, resolveOverlaps, utteranceRuns, type BarBand, type ChapterKey } from '../barTimeline';

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

const run = (category: ChapterKey, start: number, end: number) => ({ category, start, end });

describe('chapterStarts', () => {
    it('is empty with fewer than two categories that hold the floor', () => {
        expect(chapterStarts([])).toEqual([]);
        expect(chapterStarts([run('agenda', 100, 800), run('agenda', 50, 90)])).toEqual([]);
    });

    it('starts each chapter where its category holds the floor and sorts them', () => {
        expect(chapterStarts([
            run('agenda', 2750, 3100),
            run('beforeAgenda', 900, 1200),
            run('beforeAgenda', 382, 700),
            run('agenda', 3100, 3500),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 2750 },
        ]);
    });

    it('folds the preamble into the first chapter', () => {
        const chapters = chapterStarts([
            run('outOfAgenda', 5000, 5400),
            run('agenda', 400, 3000),
        ]);
        expect(chapters[0]).toEqual({ key: 'agenda', start: 0 });
        expect(chapters[1]).toEqual({ key: 'outOfAgenda', start: 5000 });
    });

    it('skips a brief early visit to a category', () => {
        // Athens, 11 Feb 2026: a one-minute answer on an agenda item in the middle
        // of the προ ημερησίας opened the agenda chapter 56 minutes early.
        expect(chapterStarts([
            run('beforeAgenda', 0, 2700),
            run('agenda', 2750, 2810),
            run('beforeAgenda', 2810, 6100),
            run('agenda', 6141, 6600),
            run('agenda', 6600, 7000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 6141 },
        ]);
    });

    it('keeps a short opening chapter that is real', () => {
        // Sparta: five minutes of προ ημερησίας, then the agenda for the rest.
        expect(chapterStarts([
            run('beforeAgenda', 0, 291),
            run('agenda', 300, 5000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 300 },
        ]);
    });

    it('counts the floor across gaps within the window', () => {
        // Sixty-second runs every two minutes: no single long run, but the category
        // holds 300 of the 600 seconds after 1000.
        const items = [run('beforeAgenda', 0, 900)];
        for (let s = 1000; s < 2200; s += 120) items.push(run('agenda', s, s + 60));
        expect(chapterStarts(items)).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 1000 },
        ]);
    });

    it('gives no chapter to a category that never holds the floor', () => {
        // Chalandri, 11 Mar 2026: one out-of-agenda item of 107 seconds.
        expect(chapterStarts([
            run('beforeAgenda', 0, 600),
            run('outOfAgenda', 620, 727),
            run('agenda', 740, 5000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 740 },
        ]);
    });
});

const band = (start: number, end: number, name = ''): BarBand => ({
    start, end, speakerColor: '#000', speakerName: name,
    subjectId: null, subjectColor: '#000', subjectName: null, subjectIcon: null,
});

describe('resolveOverlaps', () => {
    it('leaves disjoint bands untouched', () => {
        const bands = [band(0, 10), band(10, 20), band(25, 30)];
        expect(resolveOverlaps(bands)).toEqual(bands);
    });

    it('splits a band around a nested interjection, which wins its span', () => {
        const out = resolveOverlaps([band(0, 100, 'a'), band(20, 30, 'b')]);
        expect(out.map(b => [b.start, b.end, b.speakerName])).toEqual([
            [0, 20, 'a'], [20, 30, 'b'], [30, 100, 'a'],
        ]);
    });

    it('truncates a partial overlap in favour of the later band', () => {
        const out = resolveOverlaps([band(0, 50, 'a'), band(40, 80, 'b')]);
        expect(out.map(b => [b.start, b.end, b.speakerName])).toEqual([
            [0, 40, 'a'], [40, 80, 'b'],
        ]);
    });

    it('drops zero-width fragments and keeps bandAt searchable', () => {
        const out = resolveOverlaps([band(100, 140, 'a'), band(120, 130, 'b'), band(140, 200, 'c')]);
        expect(out.map(b => [b.start, b.end, b.speakerName])).toEqual([
            [100, 120, 'a'], [120, 130, 'b'], [130, 140, 'a'], [140, 200, 'c'],
        ]);
        expect(bandAt(out, 135)).toBe(2);
        expect(bandAt(out, 125)).toBe(1);
    });
});

describe('utteranceRuns with overlapping utterances', () => {
    it('does not shrink a run when a nested same-subject utterance follows', () => {
        expect(utteranceRuns([u(10, 30, 'a'), u(12, 20, 'a'), u(30, 40, 'b')], 10, 40)).toEqual([
            { subjectId: 'a', start: 10, end: 30 },
            { subjectId: 'b', start: 30, end: 40 },
        ]);
    });

    it('never produces a run whose end precedes its start', () => {
        const runs = utteranceRuns([u(10, 30, 'a'), u(15, 25, 'b')], 10, 30);
        for (const run of runs) expect(run.end).toBeGreaterThanOrEqual(run.start);
    });
});
