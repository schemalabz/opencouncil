import { openDateRange } from '../dateRange';

const NOW = '2026-10-05T14:03:12.000Z';

describe('openDateRange', () => {
    it('sets no range when neither bound is set', () => {
        expect(openDateRange(undefined, undefined, NOW)).toBeUndefined();
        expect(openDateRange(null, null, NOW)).toBeUndefined();
        expect(openDateRange('', '', NOW)).toBeUndefined();
    });

    it('keeps both bounds the reader set', () => {
        expect(openDateRange('2026-01-01', '2026-02-01', NOW)).toEqual({ start: '2026-01-01', end: '2026-02-01' });
    });

    // Either bound alone is a real filter: the other one stays open instead
    // of collapsing the range onto the one that is set.
    it('opens a missing start to every earlier meeting', () => {
        expect(openDateRange(undefined, '2026-02-01', NOW)).toEqual({ start: '1970-01-01', end: '2026-02-01' });
    });

    it('ends a range without an end where the caller says', () => {
        expect(openDateRange('2026-01-01', undefined, NOW)).toEqual({ start: '2026-01-01', end: NOW });
    });

    // A URL parameter can be present and empty. It is no bound, not an empty
    // date that Elasticsearch would reject.
    it('reads an empty bound as a missing one', () => {
        expect(openDateRange('', '2026-02-01', NOW)).toEqual({ start: '1970-01-01', end: '2026-02-01' });
    });
});
