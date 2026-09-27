import { summarizeReread, type RereadMeeting } from '../rereadCount';

const meeting = (cityId: string, id: string, stale: boolean[]): RereadMeeting => ({
    cityId, id, subjects: stale.map(s => ({ stale: s })),
});

describe('summarizeReread', () => {
    it('counts every meeting but only pages from subjects marked stale', () => {
        const summary = summarizeReread([
            meeting('athens', 'm1', [true, false, true]),
            meeting('athens', 'm2', [false, false]),
            meeting('sparta', 'm3', [true]),
        ]);
        expect(summary.meetings).toBe(3);
        expect(summary.pages).toBe(3);
    });

    it('breaks the page count down by city', () => {
        const summary = summarizeReread([
            meeting('athens', 'm1', [true, true]),
            meeting('sparta', 'm2', [true]),
        ]);
        expect(summary.byCity).toEqual({ athens: 2, sparta: 1 });
    });

    it('omits a meeting from the lines when none of its subjects are stale', () => {
        const summary = summarizeReread([
            meeting('athens', 'm1', [false, false]),
            meeting('athens', 'm2', [true]),
        ]);
        expect(summary.lines).toEqual(['athens/m2: 1']);
    });

    it('returns zero pages and no lines for no meetings', () => {
        const summary = summarizeReread([]);
        expect(summary).toEqual({ meetings: 0, pages: 0, byCity: {}, lines: [] });
    });

    it('does not count a meeting with no stale subjects towards byCity', () => {
        const summary = summarizeReread([meeting('athens', 'm1', [false])]);
        expect(summary.byCity).toEqual({});
    });
});
