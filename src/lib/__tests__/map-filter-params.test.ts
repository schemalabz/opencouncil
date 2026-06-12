import {
    DEFAULT_MAP_FILTER,
    isDefaultFilter,
    mapFilterToApiQuery,
    mapFilterToSearchParams,
    parseMapFilterParams,
} from '../map/params';
import { MAP_DEFAULT_MONTHS_BACK, MAP_MONTHS_MAX, MAP_MONTHS_MIN } from '../map/constants';

describe('parseMapFilterParams', () => {
    it('returns defaults for empty params', () => {
        expect(parseMapFilterParams({})).toEqual(DEFAULT_MAP_FILTER);
    });

    it('parses comma-separated topics, trimming and deduplicating', () => {
        const filter = parseMapFilterParams({ topics: ' a ,b,,a' });
        expect(filter.topicIds).toEqual(['a', 'b']);
    });

    it('treats an empty topics param as all topics', () => {
        expect(parseMapFilterParams({ topics: ',,' }).topicIds).toBeNull();
    });

    it('clamps months into the allowed range', () => {
        expect(parseMapFilterParams({ months: '0' }).monthsBack).toBe(MAP_MONTHS_MIN);
        expect(parseMapFilterParams({ months: '100' }).monthsBack).toBe(MAP_MONTHS_MAX);
        expect(parseMapFilterParams({ months: '12' }).monthsBack).toBe(12);
    });

    it('falls back to the default for garbage months', () => {
        expect(parseMapFilterParams({ months: 'banana' }).monthsBack).toBe(MAP_DEFAULT_MONTHS_BACK);
    });

    it('takes the first value of repeated params', () => {
        const filter = parseMapFilterParams({ topics: ['a,b', 'c'], months: ['3', '12'] });
        expect(filter.topicIds).toEqual(['a', 'b']);
        expect(filter.monthsBack).toBe(3);
    });

    it('parses cities, known body types and ISO dates', () => {
        const filter = parseMapFilterParams({
            cities: 'athens,chania',
            bodies: 'council,committee,bogus',
            from: '2026-01-15',
            to: '2026-03-01',
        });
        expect(filter.cityIds).toEqual(['athens', 'chania']);
        expect(filter.bodyTypes).toEqual(['council', 'committee']);
        expect(filter.dateFrom).toBe('2026-01-15');
        expect(filter.dateTo).toBe('2026-03-01');
    });

    it('drops unknown body types and malformed dates', () => {
        const filter = parseMapFilterParams({ bodies: 'parliament', from: '15/01/2026', to: 'soon' });
        expect(filter.bodyTypes).toBeNull();
        expect(filter.dateFrom).toBeNull();
        expect(filter.dateTo).toBeNull();
    });
});

describe('isDefaultFilter', () => {
    it('recognizes the default filter', () => {
        expect(isDefaultFilter(DEFAULT_MAP_FILTER)).toBe(true);
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER })).toBe(true);
    });

    it('rejects non-default filters', () => {
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER, topicIds: ['a'] })).toBe(false);
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER, monthsBack: 3 })).toBe(false);
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER, cityIds: ['athens'] })).toBe(false);
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER, bodyTypes: ['council'] })).toBe(false);
        expect(isDefaultFilter({ ...DEFAULT_MAP_FILTER, dateFrom: '2026-01-01' })).toBe(false);
    });
});

describe('mapFilterToSearchParams', () => {
    it('writes only non-default values', () => {
        expect(mapFilterToSearchParams(DEFAULT_MAP_FILTER).toString()).toBe('');
        expect(mapFilterToSearchParams({ ...DEFAULT_MAP_FILTER, topicIds: ['a', 'b'], monthsBack: 3 }).toString())
            .toBe('topics=a%2Cb&months=3');
    });

    it('round-trips through parseMapFilterParams', () => {
        const filter = {
            ...DEFAULT_MAP_FILTER,
            topicIds: ['a', 'b'],
            monthsBack: 12,
            cityIds: ['athens'],
            bodyTypes: ['council' as const],
            dateFrom: '2026-01-15',
            dateTo: '2026-02-20',
        };
        const params = mapFilterToSearchParams(filter);
        expect(parseMapFilterParams({
            topics: params.get('topics') ?? undefined,
            months: params.get('months') ?? undefined,
            cities: params.get('cities') ?? undefined,
            bodies: params.get('bodies') ?? undefined,
            from: params.get('from') ?? undefined,
            to: params.get('to') ?? undefined,
        })).toEqual(filter);
    });
});

describe('mapFilterToApiQuery', () => {
    it('always includes monthsBack and only sets the narrowing params when filtered', () => {
        expect(mapFilterToApiQuery(DEFAULT_MAP_FILTER).toString()).toBe(`monthsBack=${MAP_DEFAULT_MONTHS_BACK}`);
        expect(mapFilterToApiQuery({ ...DEFAULT_MAP_FILTER, topicIds: ['a'], monthsBack: 3 }).toString())
            .toBe('monthsBack=3&topicIds=a');
        expect(mapFilterToApiQuery({ ...DEFAULT_MAP_FILTER, cityIds: ['athens'], bodyTypes: ['committee'], dateFrom: '2026-01-01' }).toString())
            .toBe(`monthsBack=${MAP_DEFAULT_MONTHS_BACK}&cityIds=athens&bodyTypes=committee&from=2026-01-01`);
    });
});
