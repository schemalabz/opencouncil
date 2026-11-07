/** @jest-environment node */
// resolveTopicIds resolves a topic label by topicLabelKey, the key create_topics checks.
jest.mock('@/lib/search/core', () => ({ searchInRealm: jest.fn() }));
jest.mock('@/lib/mcp/realmGuards', () => ({
    assertCitiesInRealm: jest.fn(), requireCityBodies: jest.fn(), requireRealmBodies: jest.fn(), requireRealmCity: jest.fn(),
}));
jest.mock('@/lib/mcp/realm-context', () => ({ currentRealm: () => 'canada', currentBaseUrl: () => 'https://ca.opencouncil.eu' }));
const findMany = jest.fn();
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: { topic: { findMany: (...a: unknown[]) => findMany(...a) } } }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));

import { searchInRealm } from '@/lib/search/core';
import { mcpSearch } from '@/lib/mcp/data';
import { topicLabelKey } from '@/lib/zod-schemas/topic';

const searchInRealmMock = searchInRealm as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    searchInRealmMock.mockResolvedValue({ results: [], total: 0, dropped: 0, derivedFilters: {} });
    findMany.mockResolvedValue([
        { id: 't-housing', name: 'Habitation', name_en: 'Housing' },
        { id: 't-water', name: 'Eau', name_en: 'Water' },
    ]);
});

describe('mcpSearch topic labels', () => {
    it('resolves a label by topicLabelKey, in either language, within the active topics of the realm', async () => {
        await mcpSearch({ query: 'x', topics: [' HABITATION ', 'water'], page: 1, pageSize: 10 }, null);
        expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deprecated: false, realm: 'canada' } }));
        expect(searchInRealmMock.mock.calls[0][0].topicIds).toEqual(['t-housing', 't-water']);
    });

    it('resolves every label that create_topics would treat as the same name', async () => {
        for (const label of ['Habitation', ' habitation', 'HABITATION  ']) {
            expect(topicLabelKey(label)).toBe(topicLabelKey('Habitation'));
            searchInRealmMock.mockClear();
            await mcpSearch({ query: 'x', topics: [label], page: 1, pageSize: 10 }, null);
            expect(searchInRealmMock.mock.calls[0][0].topicIds).toEqual(['t-housing']);
        }
    });

    it('refuses an unknown label and lists the topics of the realm', async () => {
        await expect(mcpSearch({ query: 'x', topics: ['Logement'], page: 1, pageSize: 10 }, null))
            .rejects.toThrow('Unknown topic(s): Logement. Available topics: Eau, Habitation');
        expect(searchInRealmMock).not.toHaveBeenCalled();
    });
});
