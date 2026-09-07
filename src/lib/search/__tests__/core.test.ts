// core.ts wires the model, Elasticsearch and Postgres together. These cases
// mock all three boundaries and assert the request that reaches
// buildSearchQuery: which filters the search ran with, and whether the model
// was consulted at all.
jest.mock('@/env.mjs', () => ({ env: { ELASTICSEARCH_URL: 'http://es.test', ELASTICSEARCH_API_KEY: 'k', ELASTICSEARCH_INDEX: 'subjects-test' } }));
jest.mock('@elastic/elasticsearch', () => ({ Client: jest.fn().mockImplementation(() => ({ search: jest.fn() })) }));
jest.mock('@/lib/db/prisma', () => ({
    __esModule: true,
    default: { subject: { findMany: jest.fn().mockResolvedValue([]) }, speakerSegment: { findMany: jest.fn().mockResolvedValue([]) }, $queryRaw: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/lib/discord', () => ({ sendErrorAdminAlert: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/lib/db/searchQueries', () => ({ logSearchQuery: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({
    getCities: jest.fn(),
    filterCityIdsByRealm: jest.fn(),
}));
jest.mock('../filters', () => ({
    ...jest.requireActual('../filters'),
    extractFilters: jest.fn(),
    processFilters: jest.fn(),
}));
jest.mock('../retry', () => ({
    executeElasticsearchWithRetry: jest.fn((run: () => unknown) => run()),
}));
jest.mock('../query', () => ({ buildSearchQuery: jest.fn(() => ({ query: { match_all: {} } })) }));

import { Client } from '@elastic/elasticsearch';
import prisma from '@/lib/db/prisma';
import { getCities, filterCityIdsByRealm } from '@/lib/db/cities';
import { extractFilters, processFilters, NO_EXTRACTED_FILTERS } from '../filters';
import { buildSearchQuery } from '../query';
import { searchInRealm, searchSubjectsInRealm } from '../core';
import type { SearchRequest } from '../types';

const extractFiltersMock = extractFilters as jest.MockedFunction<typeof extractFilters>;
const processFiltersMock = processFilters as jest.MockedFunction<typeof processFilters>;
const buildSearchQueryMock = buildSearchQuery as jest.MockedFunction<typeof buildSearchQuery>;
const getCitiesMock = getCities as jest.MockedFunction<typeof getCities>;
const filterCityIdsByRealmMock = filterCityIdsByRealm as jest.MockedFunction<typeof filterCityIdsByRealm>;

const REALM_CITIES = ['athens', 'chania', 'argos'];

const findManyMock = prisma.subject.findMany as jest.Mock;

// The Elasticsearch client is constructed once at module scope, so the search
// mock has to be read off that instance rather than re-mocked per test.
const esSearchMock = (Client as unknown as jest.Mock).mock.results[0].value.search as jest.Mock;

/** The SearchRequest that reached the query builder — what the search actually ran. */
const requestSentToElasticsearch = (): SearchRequest => buildSearchQueryMock.mock.calls[0][0];

beforeEach(() => {
    jest.clearAllMocks();
    esSearchMock.mockResolvedValue({ hits: { total: { value: 0, relation: 'eq' }, hits: [] }, took: 1 });
    getCitiesMock.mockResolvedValue(REALM_CITIES.map(id => ({ id })) as never);
    // Every candidate id is inside the realm unless a case says otherwise.
    filterCityIdsByRealmMock.mockImplementation(async (ids: string[]) => ids.filter(id => REALM_CITIES.includes(id)));
    findManyMock.mockResolvedValue([]);
    extractFiltersMock.mockResolvedValue(NO_EXTRACTED_FILTERS);
    processFiltersMock.mockResolvedValue({ cityIds: undefined, dateRange: undefined, locations: undefined });
});

describe('searchInRealm — deriving filters from the query text', () => {
    it('consults the model by default', async () => {
        await searchInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(extractFiltersMock).toHaveBeenCalledWith('ανακύκλωση', 'greece');
        expect(processFiltersMock).toHaveBeenCalled();
    });

    // The derivation costs a model call plus a geocode per candidate city. A
    // caller whose UI already holds the filters must be able to pay for neither.
    it('consults nothing when the caller turns extraction off', async () => {
        await searchInRealm({ query: 'ανακύκλωση', config: { extractFilters: false } }, 'greece');

        expect(extractFiltersMock).not.toHaveBeenCalled();
        expect(processFiltersMock).not.toHaveBeenCalled();
        expect(esSearchMock).toHaveBeenCalled();
    });

    it('consults nothing for a filter-only search, which has no text to read', async () => {
        await searchInRealm({ cityIds: ['athens'] }, 'greece');

        expect(extractFiltersMock).not.toHaveBeenCalled();
    });
});

describe('searchInRealm — extraction is advisory', () => {
    it('fills a city the caller left unset', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        await searchInRealm({ query: 'ανακύκλωση στα Χανιά' }, 'greece');

        expect(requestSentToElasticsearch().cityIds).toEqual(['chania']);
    });

    // The caller's filters are the ones the UI shows. Letting the model's
    // reading of the query win would search a municipality that contradicts the
    // pills on screen.
    it('never replaces a city the caller set', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        await searchInRealm({ query: 'πάρκα Χανίων', cityIds: ['athens'] }, 'greece');

        expect(requestSentToElasticsearch().cityIds).toEqual(['athens']);
    });

    it('never replaces a date range the caller set', async () => {
        const callerRange = { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T23:59:59.999Z' };
        processFiltersMock.mockResolvedValue({
            cityIds: undefined,
            dateRange: { start: '2025-01-01T00:00:00.000Z', end: '2025-12-31T23:59:59.999Z' },
            locations: undefined,
        });

        await searchInRealm({ query: 'προϋπολογισμός πέρσι', dateRange: callerRange }, 'greece');

        expect(requestSentToElasticsearch().dateRange).toEqual(callerRange);
    });

    it('fills a date range the caller left unset', async () => {
        const derived = { start: '2025-01-01T00:00:00.000Z', end: '2025-12-31T23:59:59.999Z' };
        processFiltersMock.mockResolvedValue({ cityIds: undefined, dateRange: derived, locations: undefined });

        await searchInRealm({ query: 'προϋπολογισμός πέρσι' }, 'greece');

        expect(requestSentToElasticsearch().dateRange).toEqual(derived);
    });

    // An empty city list means "no city filter" to buildFilters, so an empty
    // extraction result must fall back to the realm rather than widen the
    // search past it.
    it('falls back to the realm when extraction returns no city', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: [], dateRange: undefined, locations: undefined });

        await searchInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(requestSentToElasticsearch().cityIds).toEqual(REALM_CITIES);
    });

    // The model reads a realm-scoped city list but can still name anything.
    it('drops an extracted city from another realm', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['paris'], dateRange: undefined, locations: undefined });

        await searchInRealm({ query: 'ανακύκλωση στο Παρίσι' }, 'greece');

        expect(requestSentToElasticsearch().cityIds).toEqual(REALM_CITIES);
    });
});

describe('searchInRealm — realm isolation', () => {
    it('defaults an absent city filter to the realm', async () => {
        await searchInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(requestSentToElasticsearch().cityIds).toEqual(REALM_CITIES);
    });

    // Narrowing to nothing is the safe outcome: an empty list would read as
    // "no city filter" and search every realm.
    it('returns nothing when every requested city is outside the realm', async () => {
        const response = await searchInRealm({ query: 'ανακύκλωση', cityIds: ['paris'] }, 'greece');

        expect(response).toEqual({ results: [], total: 0, dropped: 0, derivedFilters: {} });
        expect(esSearchMock).not.toHaveBeenCalled();
    });

    it('accepts a realm resolver as well as a realm', async () => {
        await searchInRealm({ query: 'ανακύκλωση' }, async () => 'greece');

        expect(extractFiltersMock).toHaveBeenCalledWith('ανακύκλωση', 'greece');
    });
});

describe('searchInRealm — reporting what the query text supplied', () => {
    it('reports a derived city', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        const response = await searchInRealm({ query: 'ανακύκλωση στα Χανιά' }, 'greece');

        expect(response.derivedFilters).toEqual({ cityIds: ['chania'] });
    });

    it('reports a derived date range', async () => {
        const derived = { start: '2025-01-01T00:00:00.000Z', end: '2025-12-31T23:59:59.999Z' };
        processFiltersMock.mockResolvedValue({ cityIds: undefined, dateRange: derived, locations: undefined });

        const response = await searchInRealm({ query: 'προϋπολογισμός πέρσι' }, 'greece');

        expect(response.derivedFilters).toEqual({ dateRange: derived });
    });

    // A filter the caller set is not derived, even when the query text names
    // one too — the merge kept the caller's, so that is what the pills show.
    it('reports nothing for a filter the caller set', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        const response = await searchInRealm({ query: 'πάρκα Χανίων', cityIds: ['athens'] }, 'greece');

        expect(response.derivedFilters).toEqual({});
    });

    it('reports nothing when the realm default supplied the cities', async () => {
        const response = await searchInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(response.derivedFilters).toEqual({});
    });

    it('reports nothing when extraction is off', async () => {
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        const response = await searchInRealm({ query: 'ανακύκλωση στα Χανιά', config: { extractFilters: false } }, 'greece');

        expect(response.derivedFilters).toEqual({});
    });
});

describe('searchSubjectsInRealm — retrieval', () => {
    const hit = (id: string, score: number) => ({ _score: score, _source: { id } });
    const released = (id: string, isReleased = true) => ({ id, councilMeeting: { released: isReleased } });

    const indexReturns = (hits: ReturnType<typeof hit>[], total = hits.length) => {
        esSearchMock.mockResolvedValue({ hits: { total: { value: total, relation: 'eq' }, hits }, took: 1 });
    };

    it('answers with the ids in relevance order, carrying their scores', async () => {
        indexReturns([hit('a', 9), hit('b', 4)]);
        findManyMock.mockResolvedValue([released('b'), released('a')]);

        const result = await searchSubjectsInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(result.hits).toEqual([{ id: 'a', score: 9 }, { id: 'b', score: 4 }]);
        expect(result.total).toBe(2);
        expect(result.dropped).toBe(0);
    });

    // The index can lag the database. A meeting unreleased after indexing still
    // matches the indexed released flag, so the hit has to be dropped here.
    it('drops a hit the database no longer marks released, and says so in the total', async () => {
        indexReturns([hit('a', 9), hit('b', 4)]);
        findManyMock.mockResolvedValue([released('a'), released('b', false)]);

        const result = await searchSubjectsInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(result.hits).toEqual([{ id: 'a', score: 9 }]);
        expect(result.total).toBe(1);
        expect(result.dropped).toBe(1);
    });

    it('drops a hit with no row behind it at all', async () => {
        indexReturns([hit('a', 9), hit('gone', 4)]);
        findManyMock.mockResolvedValue([released('a')]);

        const result = await searchSubjectsInRealm({ query: 'ανακύκλωση' }, 'greece');

        expect(result.hits).toEqual([{ id: 'a', score: 9 }]);
        expect(result.dropped).toBe(1);
    });

    // Retrieval exists so a caller can hydrate in its own shape. Reading whole
    // rows here would hand every caller the cost it was split out to avoid.
    it('reads only what the visibility check needs', async () => {
        indexReturns([hit('a', 9)]);
        findManyMock.mockResolvedValue([released('a')]);

        await searchSubjectsInRealm({ query: 'ανακύκλωση' }, 'greece');

        const [args] = findManyMock.mock.calls[0];
        expect(args.select).toEqual({ id: true, councilMeeting: { select: { released: true } } });
        expect(args.include).toBeUndefined();
    });

    it('reports what the query text supplied, like the hydrated search does', async () => {
        indexReturns([]);
        processFiltersMock.mockResolvedValue({ cityIds: ['chania'], dateRange: undefined, locations: undefined });

        const result = await searchSubjectsInRealm({ query: 'ανακύκλωση στα Χανιά' }, 'greece');

        expect(result.derivedFilters).toEqual({ cityIds: ['chania'] });
    });
});


describe('search matches cross the retrieval/hydration seam', () => {
    const NAME_FRAGMENT = 'Αίτηση για \uE000Αδειοδότηση\uE001 καταστήματος';
    const DESCRIPTION_FRAGMENT = 'Συζήτηση για την \uE000άδεια\uE001 λειτουργίας';
    const markedHit = {
        _score: 9,
        _source: { id: 'a' },
        highlight: { name: [NAME_FRAGMENT], description: [DESCRIPTION_FRAGMENT] },
    };
    const plainHit = { _score: 4, _source: { id: 'b' } };
    const released = (id: string) => ({ id, councilMeeting: { released: true } });

    beforeEach(() => {
        esSearchMock.mockResolvedValue({
            hits: { total: { value: 2, relation: 'eq' }, hits: [markedHit, plainHit] },
            took: 1,
        });
    });

    it('carries each marked field on the retrieval hit, and nothing for an unmarked hit', async () => {
        findManyMock.mockResolvedValue([released('a'), released('b')]);

        const result = await searchSubjectsInRealm(
            { query: 'άδεια', config: { enableHighlights: true } },
            'greece'
        );

        expect(result.hits).toStrictEqual([
            { id: 'a', score: 9, matches: { name: NAME_FRAGMENT, description: DESCRIPTION_FRAGMENT } },
            { id: 'b', score: 4, matches: undefined },
        ]);
    });

    it('hands the matches to the hydrated result', async () => {
        const row = (id: string) => ({
            id, location: null,
            councilMeeting: { id: 'm1', city: { id: 'athens' }, administrativeBody: null },
        });
        findManyMock
            .mockResolvedValueOnce([released('a'), released('b')])
            .mockResolvedValueOnce([row('a'), row('b')]);

        const response = await searchInRealm(
            { query: 'άδεια', config: { enableHighlights: true } },
            'greece'
        );

        expect(response.results.map(r => r.matches)).toEqual([
            { name: NAME_FRAGMENT, description: DESCRIPTION_FRAGMENT },
            undefined,
        ]);
    });
});
