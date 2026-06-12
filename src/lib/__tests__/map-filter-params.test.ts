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
        expect(parseMapFilterParams({ topics: ['a,b', 'c'], months: ['3', '12'] })).toEqual({
            topicIds: ['a', 'b'],
            monthsBack: 3,
        });
    });
});

describe('isDefaultFilter', () => {
    it('recognizes the default filter', () => {
        expect(isDefaultFilter(DEFAULT_MAP_FILTER)).toBe(true);
        expect(isDefaultFilter({ topicIds: null, monthsBack: MAP_DEFAULT_MONTHS_BACK })).toBe(true);
    });

    it('rejects non-default filters', () => {
        expect(isDefaultFilter({ topicIds: ['a'], monthsBack: MAP_DEFAULT_MONTHS_BACK })).toBe(false);
        expect(isDefaultFilter({ topicIds: null, monthsBack: 3 })).toBe(false);
    });
});

describe('mapFilterToSearchParams', () => {
    it('writes only non-default values', () => {
        expect(mapFilterToSearchParams(DEFAULT_MAP_FILTER).toString()).toBe('');
        expect(mapFilterToSearchParams({ topicIds: ['a', 'b'], monthsBack: 3 }).toString())
            .toBe('topics=a%2Cb&months=3');
    });

    it('round-trips through parseMapFilterParams', () => {
        const filter = { topicIds: ['a', 'b'], monthsBack: 12 };
        const params = mapFilterToSearchParams(filter);
        expect(parseMapFilterParams({
            topics: params.get('topics') ?? undefined,
            months: params.get('months') ?? undefined,
        })).toEqual(filter);
    });
});

describe('mapFilterToApiQuery', () => {
    it('always includes monthsBack and only sets topicIds when filtered', () => {
        expect(mapFilterToApiQuery(DEFAULT_MAP_FILTER).toString()).toBe(`monthsBack=${MAP_DEFAULT_MONTHS_BACK}`);
        expect(mapFilterToApiQuery({ topicIds: ['a'], monthsBack: 3 }).toString()).toBe('monthsBack=3&topicIds=a');
    });
});
