import {
    buildSearchHref,
    DERIVED_FILTER_PARAMS,
    filterDateRangeToInstants,
    formatFilterDate,
    hasActiveSearchFilters,
    parseDerivedKeys,
    parseFilterDate,
    serializeDerivedKeys,
} from '../searchFilterTypes';

describe('hasActiveSearchFilters', () => {
    it('is false for an empty filter set', () => {
        expect(hasActiveSearchFilters({})).toBe(false);
    });

    it.each([
        ['cityId', { cityId: 'athens' }],
        ['partyId', { partyId: 'p1' }],
        ['personId', { personId: 'x1' }],
        ['adminBodyType', { adminBodyType: 'committee' }],
        ['adminBodyId', { adminBodyId: 'b1' }],
        ['topicIds', { topicIds: 't1,t2' }],
        ['dateFrom', { dateFrom: '2026-08-20' }],
    ])('is true when %s is set', (_field, filters) => {
        expect(hasActiveSearchFilters(filters)).toBe(true);
    });
});

describe('filter date round trip', () => {
    // Regression: the URL was written with a local `format()` and read back with
    // `new Date(str)`, which the language spec parses a date-only string as — UTC
    // midnight. That is a different instant from the local calendar day everywhere
    // but UTC: three hours early in Greece, and a whole day early west of
    // Greenwich, where the pill printed and the calendar highlighted the day
    // before the one the user picked.
    //
    // The assertions below are stated against locally-constructed Dates rather
    // than fixed clock readings, so they hold whatever zone the suite runs in.
    it('reads back the calendar day it wrote', () => {
        const picked = new Date(2026, 7, 20); // 20 Aug 2026, local midnight

        expect(parseFilterDate(formatFilterDate(picked))).toEqual(picked);
    });

    it('parses a yyyy-MM-dd param as local midnight of that day', () => {
        expect(parseFilterDate('2026-08-20')).toEqual(new Date(2026, 7, 20));
    });

    it.each([undefined, '', 'not-a-date'])('returns undefined for %p', value => {
        expect(parseFilterDate(value)).toBeUndefined();
    });
});

describe('filterDateRangeToInstants', () => {
    it('bounds the range on local day edges', () => {
        const range = filterDateRangeToInstants('2026-08-20', '2026-08-22');

        // First and last moment of the picked LOCAL days — so a meeting held at
        // 21:00 local on the 22nd, already the 23rd in UTC, still falls inside.
        expect(new Date(range!.start)).toEqual(new Date(2026, 7, 20, 0, 0, 0, 0));
        expect(new Date(range!.end)).toEqual(new Date(2026, 7, 22, 23, 59, 59, 999));
    });

    it('treats a half-picked range as that single day', () => {
        const range = filterDateRangeToInstants('2026-08-20', undefined);

        expect(new Date(range!.start)).toEqual(new Date(2026, 7, 20, 0, 0, 0, 0));
        expect(new Date(range!.end)).toEqual(new Date(2026, 7, 20, 23, 59, 59, 999));
    });

    it('is undefined without a start date', () => {
        expect(filterDateRangeToInstants(undefined, '2026-08-22')).toBeUndefined();
    });

    // A hand-edited URL can put the end before the start. Passing that straight
    // through produced a reversed range, which matched nothing while the pill
    // still read as a period — zero results with nothing to explain them.
    it('orders a reversed range instead of emitting an impossible one', () => {
        const reversed = filterDateRangeToInstants('2026-08-22', '2026-08-20');

        expect(reversed).toEqual(filterDateRangeToInstants('2026-08-20', '2026-08-22'));
        expect(new Date(reversed!.start).getTime())
            .toBeLessThan(new Date(reversed!.end).getTime());
    });
});

describe('derived filter keys', () => {
    it('round-trips the keys it knows', () => {
        expect(parseDerivedKeys(serializeDerivedKeys(['city', 'date']))).toEqual(['city', 'date']);
    });

    it('marks nothing when there is nothing to mark', () => {
        expect(serializeDerivedKeys([])).toBeUndefined();
        expect(parseDerivedKeys(undefined)).toEqual([]);
        expect(parseDerivedKeys(null)).toEqual([]);
        expect(parseDerivedKeys('')).toEqual([]);
    });

    // A hand-edited URL can name anything. An unknown key would mark a pill
    // that no filter param backs, so it is dropped rather than carried.
    it('ignores a key it does not know', () => {
        expect(parseDerivedKeys('city,nonsense,date')).toEqual(['city', 'date']);
        expect(parseDerivedKeys('nonsense')).toEqual([]);
    });

    // Every key has to own at least one param, or clearing it on a new query
    // would leave the filter behind with nothing marking where it came from.
    it('owns a filter param for every key', () => {
        for (const params of Object.values(DERIVED_FILTER_PARAMS)) {
            expect(params.length).toBeGreaterThan(0);
        }
    });
});

describe('buildSearchHref', () => {
    it('carries the query and the filters that are set', () => {
        expect(buildSearchHref({ query: 'κατοικίδια', cityId: 'chania', topicIds: 't1,t2' }))
            .toBe('/search?query=%CE%BA%CE%B1%CF%84%CE%BF%CE%B9%CE%BA%CE%AF%CE%B4%CE%B9%CE%B1&cityId=chania&topicIds=t1%2Ct2');
    });

    it('leaves out what is not set', () => {
        expect(buildSearchHref({ query: 'πάρκα' })).toBe('/search?query=%CF%80%CE%AC%CF%81%CE%BA%CE%B1');
    });

    // A handoff with nothing to hand on is still a link to the search page.
    it('is the bare page when there is nothing to carry', () => {
        expect(buildSearchHref({})).toBe('/search');
        expect(buildSearchHref({ query: '   ' })).toBe('/search');
    });

    it('round-trips through the params the page reads', () => {
        const href = buildSearchHref({ query: 'x', cityId: 'athens', dateFrom: '2026-01-01', dateTo: '2026-02-01' });
        const params = new URLSearchParams(href.split('?')[1]);
        expect(params.get('query')).toBe('x');
        expect(params.get('cityId')).toBe('athens');
        expect(params.get('dateFrom')).toBe('2026-01-01');
        expect(params.get('dateTo')).toBe('2026-02-01');
    });
});
