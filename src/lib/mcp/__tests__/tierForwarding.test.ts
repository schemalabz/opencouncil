/** @jest-environment node */
// The MCP data layer hands the `tier` of list_hot_subjects, list_nearby_subjects
// and search to the builders. The server test mocks the data layer, and the
// contract test calls none of these three.
jest.mock('@/lib/search/core', () => ({ searchInRealm: jest.fn() }));
jest.mock('@/lib/db/subject', () => ({
    getHotSubjectsCached: jest.fn(),
    getSubject: jest.fn(),
    getDiscussionSecondsForSubjects: jest.fn(),
}));
jest.mock('@/lib/hotSubjects', () => ({ getHotSubjectsNearPoint: jest.fn(), withDistances: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCities: jest.fn(), getCity: jest.fn(), getListedCityAtPoint: jest.fn() }));
jest.mock('@/lib/db/cityTimezone', () => ({ getCityTimezone: jest.fn() }));
jest.mock('../realmGuards', () => ({
    assertCitiesInRealm: jest.fn(),
    requireCityBodies: jest.fn(),
    requireRealmBodies: jest.fn(),
    requireRealmCity: jest.fn(),
}));
jest.mock('../realm-context', () => ({
    currentRealm: () => 'greece',
    currentBaseUrl: () => 'https://opencouncil.gr',
    cityBaseUrl: () => 'https://opencouncil.gr',
    rememberCityRealm: jest.fn(),
}));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));

import { searchInRealm } from '@/lib/search/core';
import { getHotSubjectsCached } from '@/lib/db/subject';
import { getHotSubjectsNearPoint, withDistances } from '@/lib/hotSubjects';
import { getListedCityAtPoint } from '@/lib/db/cities';
import { getCityTimezone } from '@/lib/db/cityTimezone';
import { mcpListHotSubjects, mcpListNearbySubjects, mcpSearch } from '../data';

beforeEach(() => {
    jest.clearAllMocks();
    (searchInRealm as jest.Mock).mockResolvedValue({ results: [], total: 0, dropped: 0, derivedFilters: {} });
    (getHotSubjectsCached as jest.Mock).mockResolvedValue([]);
    (getListedCityAtPoint as jest.Mock).mockResolvedValue({ id: 'athens', name: 'Αθήνα' });
    (getHotSubjectsNearPoint as jest.Mock).mockResolvedValue({ subjects: [], meetingsScanned: 0, oldestMeetingDate: null });
    (withDistances as jest.Mock).mockResolvedValue([]);
    (getCityTimezone as jest.Mock).mockResolvedValue('Europe/Athens');
});

describe('the MCP data layer hands the tier to the builders (#829)', () => {
    it.each(['secondary', 'all'] as const)('tier %s', async tier => {
        await mcpListHotSubjects({ daysBack: 7, limit: 10, tier });
        expect((getHotSubjectsCached as jest.Mock).mock.calls[0][1]).toEqual(expect.objectContaining({ tier }));

        await mcpListNearbySubjects({ lat: 38, lng: 23.7, radiusMeters: 1000, limit: 10, tier });
        expect((getHotSubjectsNearPoint as jest.Mock).mock.calls[0][4]).toEqual({ scope: { tier } });

        await mcpSearch({ query: 'πάρκα', page: 1, pageSize: 10, tier }, null);
        expect((searchInRealm as jest.Mock).mock.calls[0][0]).toEqual(expect.objectContaining({ tier }));
    });
});
