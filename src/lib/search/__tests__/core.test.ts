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
import { getCities, filterCityIdsByRealm } from '@/lib/db/cities';
import { extractFilters, processFilters, NO_EXTRACTED_FILTERS } from '../filters';
import { buildSearchQuery } from '../query';
import { searchInRealm } from '../core';
import type { SearchRequest } from '../types';

const extractFiltersMock = extractFilters as jest.MockedFunction<typeof extractFilters>;
const processFiltersMock = processFilters as jest.MockedFunction<typeof processFilters>;
const buildSearchQueryMock = buildSearchQuery as jest.MockedFunction<typeof buildSearchQuery>;
const getCitiesMock = getCities as jest.MockedFunction<typeof getCities>;
const filterCityIdsByRealmMock = filterCityIdsByRealm as jest.MockedFunction<typeof filterCityIdsByRealm>;

const REALM_CITIES = ['athens', 'chania', 'argos'];

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
