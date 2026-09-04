import { bandAt, chapterJumpTarget, chapterStarts, coalesceSpans, cycleSpeed, formatSpeed, intersectsAny, lensLeft, lensWindowStart, mergeIntervals, resolveOverlaps, rulerLabelStep, slideFine, timeAt, utteranceRuns, SPEED_CYCLE, SPEED_MENU, type BarBand, type Chapter, type ChapterKey } from '../barTimeline';

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

    it('folds the preamble to the first utterance, not to zero', () => {
        // The recording rolls for two minutes before anyone speaks.
        const chapters = chapterStarts([
            run('agenda', 400, 3000),
            run('outOfAgenda', 5000, 5400),
        ], 120);
        expect(chapters[0]).toEqual({ key: 'agenda', start: 120 });
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

    it('starts a category that never holds the floor at its first mention', () => {
        // Chalandri, 11 Mar 2026: one out-of-agenda item of 107 seconds.
        expect(chapterStarts([
            run('beforeAgenda', 0, 600),
            run('outOfAgenda', 620, 727),
            run('agenda', 740, 5000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'outOfAgenda', start: 620 },
            { key: 'agenda', start: 740 },
        ]);
    });

    it('keeps the rail when the second category is brief', () => {
        expect(chapterStarts([
            run('beforeAgenda', 0, 100),
            run('agenda', 100, 10000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 100 },
        ]);
    });

    it('does not count an overlapping run twice', () => {
        // The brief visit of the 11 Feb case, recorded as two overlapping runs:
        // 60 seconds of floor, not 120.
        expect(chapterStarts([
            run('beforeAgenda', 0, 2700),
            run('agenda', 2750, 2810),
            run('agenda', 2750, 2810),
            run('beforeAgenda', 2810, 6100),
            run('agenda', 6141, 7000),
        ])).toEqual([
            { key: 'beforeAgenda', start: 0 },
            { key: 'agenda', start: 6141 },
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

describe('lensWindowStart', () => {
    it('centres the window on the time', () => {
        expect(lensWindowStart(3000, 10000)).toBe(2700);
    });

    it('shifts, never narrows, at both ends', () => {
        expect(lensWindowStart(100, 10000)).toBe(0);
        expect(lensWindowStart(9950, 10000)).toBe(9400);
    });

    it('starts at zero for a meeting shorter than the window', () => {
        expect(lensWindowStart(200, 400)).toBe(0);
    });
});

describe('lensLeft', () => {
    // a 1000px strip starting 300px into a 1440px viewport, a 600px lens
    it('centres the lens on the pointer', () => {
        expect(lensLeft(500, 600, 300, 1440)).toBe(200);
    });

    it('keeps the lens inside the viewport margins', () => {
        expect(lensLeft(0, 600, 300, 1440)).toBe(-292);
        expect(lensLeft(1000, 600, 300, 1440)).toBe(532);
    });

    it('pins a lens wider than the viewport to the left margin', () => {
        expect(lensLeft(100, 400, 8, 390)).toBe(0);
    });
});

describe('timeAt', () => {
    it('maps strip x to time, clamped to the strip', () => {
        expect(timeAt(500, 1000, 14400)).toBe(7200);
        expect(timeAt(-20, 1000, 14400)).toBe(0);
        expect(timeAt(1200, 1000, 14400)).toBe(14400);
    });

    it('maps to 0 without a width or a duration', () => {
        expect(timeAt(500, 0, 14400)).toBe(0);
        expect(timeAt(500, 1000, 0)).toBe(0);
    });
});

describe('rulerLabelStep', () => {
    it('labels every minute when a minute has room, then every two, then every five', () => {
        expect(rulerLabelStep(700)).toBe(60);
        expect(rulerLabelStep(374)).toBe(120);
        expect(rulerLabelStep(200)).toBe(300);
    });
});

describe('slideFine', () => {
    it('moves the marker inside the window without moving the window', () => {
        expect(slideFine(3100, 3000, 10000)).toEqual({ time: 3100, windowStart: 3000 });
    });

    it('slides the window just far enough to keep the marker', () => {
        expect(slideFine(3700, 3000, 10000)).toEqual({ time: 3700, windowStart: 3100 });
        expect(slideFine(2900, 3000, 10000)).toEqual({ time: 2900, windowStart: 2900 });
    });

    it('stops at the meeting\'s ends', () => {
        expect(slideFine(10500, 9400, 10000)).toEqual({ time: 10000, windowStart: 9400 });
        expect(slideFine(-40, 0, 10000)).toEqual({ time: 0, windowStart: 0 });
    });
});

describe('chapterJumpTarget', () => {
    const chapters: Chapter[] = [
        { key: 'beforeAgenda', start: 0 },
        { key: 'agenda', start: 600 },
        { key: 'outOfAgenda', start: 3000 },
    ];

    it('goes to the next chapter start', () => {
        expect(chapterJumpTarget(chapters, 100, 1)).toBe(600);
        expect(chapterJumpTarget(chapters, 700, 1)).toBe(3000);
    });

    it('goes back to the start of the chapter in progress, then to the one before it', () => {
        expect(chapterJumpTarget(chapters, 700, -1)).toBe(600);
        expect(chapterJumpTarget(chapters, 3100, -1)).toBe(3000);
        expect(chapterJumpTarget(chapters, 600, -1)).toBe(0);
    });

    it('leaves the ends to the caller', () => {
        expect(chapterJumpTarget(chapters, 3100, 1)).toBeNull();
        expect(chapterJumpTarget(chapters, 0, -1)).toBeNull();
        expect(chapterJumpTarget([], 100, 1)).toBeNull();
    });

    it('moves off a boundary it already sits on', () => {
        expect(chapterJumpTarget(chapters, 600, 1)).toBe(3000);
    });
});

const painted = (start: number, end: number, speakerColor: string, subjectColor = speakerColor): BarBand => ({
    ...band(start, end),
    speakerColor,
    subjectColor,
});

const colorOf = (b: BarBand) => b.speakerColor;
const allLit = () => true;

describe('coalesceSpans', () => {
    it('joins neighbours that paint the same', () => {
        const spans = coalesceSpans([painted(0, 10, '#a'), painted(12, 40, '#a')], colorOf, allLit, 30);
        expect(spans).toEqual([{ start: 0, end: 40, color: '#a', lit: true }]);
    });

    it('keeps a colour change apart', () => {
        const spans = coalesceSpans([painted(0, 10, '#a'), painted(10, 20, '#b')], colorOf, allLit, 30);
        expect(spans.map(s => [s.start, s.end, s.color])).toEqual([[0, 10, '#a'], [10, 20, '#b']]);
    });

    it('keeps a lit change apart', () => {
        const spans = coalesceSpans([painted(0, 10, '#a'), painted(10, 20, '#a')], colorOf, b => b.start < 10, 30);
        expect(spans.map(s => [s.start, s.end, s.lit])).toEqual([[0, 10, true], [10, 20, false]]);
    });

    it('keeps neighbours further apart than the gap separate', () => {
        const spans = coalesceSpans([painted(0, 10, '#a'), painted(50, 60, '#a')], colorOf, allLit, 30);
        expect(spans.map(s => [s.start, s.end])).toEqual([[0, 10], [50, 60]]);
    });

    it('reads the colour the caller asks for', () => {
        const bands = [painted(0, 10, '#a', '#x'), painted(10, 20, '#b', '#x')];
        expect(coalesceSpans(bands, b => b.subjectColor, allLit, 30)).toEqual([
            { start: 0, end: 20, color: '#x', lit: true },
        ]);
    });

    it('handles empty input and leaves the bands untouched', () => {
        expect(coalesceSpans([], colorOf, allLit, 30)).toEqual([]);
        const bands = [painted(0, 10, '#a'), painted(12, 40, '#a')];
        coalesceSpans(bands, colorOf, allLit, 30);
        expect(bands.map(b => b.end)).toEqual([10, 40]);
    });
});

describe('cycleSpeed', () => {
    it('steps through the cycle and wraps', () => {
        expect(cycleSpeed(1)).toBe(1.25);
        expect(cycleSpeed(1.25)).toBe(1.5);
        expect(cycleSpeed(1.5)).toBe(2);
        expect(cycleSpeed(2)).toBe(1);
    });

    it('advances an off-cycle speed to the next higher cycle value', () => {
        expect(cycleSpeed(0.5)).toBe(1);
        expect(cycleSpeed(0.75)).toBe(1);
        expect(cycleSpeed(1.75)).toBe(2);
        expect(cycleSpeed(1.1)).toBe(1.25);
    });

    it('wraps a speed above the cycle to the first value', () => {
        expect(cycleSpeed(3)).toBe(1);
        expect(cycleSpeed(4)).toBe(1);
    });

    it('reaches every cycle value from every menu value', () => {
        for (const start of SPEED_MENU) {
            const seen = new Set<number>();
            let speed = start;
            for (let i = 0; i < SPEED_CYCLE.length + 1; i++) {
                speed = cycleSpeed(speed);
                seen.add(speed);
            }
            expect([...seen].sort((a, b) => a - b)).toEqual(SPEED_CYCLE);
        }
    });
});

describe('formatSpeed', () => {
    it('drops the trailing zeros and keeps the sign', () => {
        expect(formatSpeed(1)).toBe('1×');
        expect(formatSpeed(1.5)).toBe('1.5×');
        expect(formatSpeed(1.25)).toBe('1.25×');
        expect(formatSpeed(0.5)).toBe('0.5×');
        expect(formatSpeed(0.75)).toBe('0.75×');
    });
});
