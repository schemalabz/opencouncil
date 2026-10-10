/** @jest-environment node */
jest.mock('@/lib/search/core', () => ({ searchInRealm: jest.fn() }));
jest.mock('../realmGuards', () => ({
    assertCitiesInRealm: jest.fn(),
    requireCityBodies: jest.fn(),
    requireRealmBodies: jest.fn(),
    requireRealmCity: jest.fn(),
}));
jest.mock('../realm-context', () => ({
    currentRealm: () => 'greece',
    currentBaseUrl: () => 'https://opencouncil.gr',
}));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));

import { searchInRealm } from '@/lib/search/core';
import { requireRealmBodies } from '../realmGuards';
import { mcpSearch } from '../data';

const searchInRealmMock = searchInRealm as jest.Mock;
const ANONYMOUS = null;

beforeEach(() => {
    jest.clearAllMocks();
    searchInRealmMock.mockResolvedValue({ results: [], total: 0, dropped: 0, derivedFilters: {} });
});

describe('mcpSearch body filters', () => {
    it('checks the body ids and searches by both body filters', async () => {
        await mcpSearch({
            query: 'πάρκα',
            administrativeBodyIds: ['b1'],
            administrativeBodyTypes: ['committee'],
            page: 1,
            pageSize: 10,
        }, ANONYMOUS);

        expect(requireRealmBodies).toHaveBeenCalledWith(['b1'], undefined);
        expect(searchInRealmMock.mock.calls[0][0]).toMatchObject({
            administrativeBodyIds: ['b1'],
            administrativeBodyTypes: ['committee'],
        });
    });

    it('checks no body ids when none are given', async () => {
        await mcpSearch({ query: 'πάρκα', page: 1, pageSize: 10 }, ANONYMOUS);

        expect(requireRealmBodies).not.toHaveBeenCalled();
    });

    // An unknown id must stop the search, not answer an empty page.
    it('does not search when a body id is unknown', async () => {
        (requireRealmBodies as jest.Mock).mockRejectedValueOnce(new Error('Unknown administrative body: x. See get_city.'));

        await expect(mcpSearch({ query: 'πάρκα', administrativeBodyIds: ['x'], page: 1, pageSize: 10 }, ANONYMOUS))
            .rejects.toThrow('Unknown administrative body');
        expect(searchInRealmMock).not.toHaveBeenCalled();
    });

    it('checks the body ids against the municipalities the caller names', async () => {
        await mcpSearch({ query: 'πάρκα', cityIds: ['athens'], administrativeBodyIds: ['b1'], page: 1, pageSize: 10 }, ANONYMOUS);

        expect(requireRealmBodies).toHaveBeenCalledWith(['b1'], ['athens']);
    });
});


describe('mcpSearch open date range', () => {
    // MCP ends a range without an end at today's date, which Elasticsearch
    // reads as the end of that day; the map ends at the current moment.
    beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-05T14:03:12Z')));
    afterEach(() => jest.useRealTimers());

    it('ends a range with only a start at the end of today', async () => {
        await mcpSearch({ query: 'πάρκα', dateFrom: '2026-01-01', page: 1, pageSize: 10 }, ANONYMOUS);

        expect(searchInRealmMock.mock.calls[0][0].dateRange).toEqual({ start: '2026-01-01', end: '2026-10-05' });
    });
});
