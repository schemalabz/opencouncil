/** @jest-environment node */
// mcpListMeetings opens on every tier for a caller who sees unreleased
// meetings (meetingListTier). server.test mocks the data layer, and the
// contract test calls it anonymously only.
jest.mock('@/lib/db/meetingsList', () => ({
    getCouncilMeetingsWithSubjectPreview: jest.fn().mockResolvedValue([]),
    countCouncilMeetings: jest.fn().mockResolvedValue(0),
}));
jest.mock('../gate', () => ({ canSeeUnreleased: jest.fn(), requirePublicTranscript: jest.fn(), requireVisibleMeeting: jest.fn() }));
jest.mock('../realmGuards', () => ({
    assertCitiesInRealm: jest.fn(),
    requireCityBodies: jest.fn(),
    requireRealmBodies: jest.fn(),
    requireRealmCity: jest.fn().mockResolvedValue('greece'),
}));
jest.mock('../realm-context', () => ({
    currentRealm: () => 'greece',
    currentBaseUrl: () => 'https://opencouncil.gr',
    cityBaseUrl: () => 'https://opencouncil.gr',
    rememberCityRealm: jest.fn(),
}));
jest.mock('@/lib/db/cityTimezone', () => ({ getCityTimezone: jest.fn().mockResolvedValue('Europe/Athens') }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ originalScheduledDate: jest.fn(), originalScheduledDates: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@/lib/db/subject', () => ({ getHotSubjectsCached: jest.fn(), getSubject: jest.fn(), getDiscussionSecondsForSubjects: jest.fn().mockResolvedValue(new Map()) }));
jest.mock('@/lib/search/core', () => ({ searchInRealm: jest.fn() }));
jest.mock('@/lib/hotSubjects', () => ({ getHotSubjectsNearPoint: jest.fn(), withDistances: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCities: jest.fn(), getCity: jest.fn(), getListedCityAtPoint: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/env.mjs', () => ({ env: {} }));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn() }));

import { getCouncilMeetingsWithSubjectPreview, countCouncilMeetings } from '@/lib/db/meetingsList';
import { canSeeUnreleased } from '../gate';
import { mcpListMeetings } from '../data';

beforeEach(() => jest.clearAllMocks());

describe('list_meetings opens on the tier of meetingListTier (#829)', () => {
    it.each([
        [true, undefined, 'all'],
        [false, undefined, 'primary'],
        [true, 'primary', 'primary'],
    ] as const)('a caller who sees unreleased = %s, tier %s: lists %s', async (seesUnreleased, tier, expected) => {
        (canSeeUnreleased as jest.Mock).mockResolvedValue(seesUnreleased);
        await mcpListMeetings('athens', { page: 1, pageSize: 10, tier }, null);
        expect((getCouncilMeetingsWithSubjectPreview as jest.Mock).mock.calls[0][1].scope.tier).toBe(expected);
        expect((countCouncilMeetings as jest.Mock).mock.calls[0][1].scope.tier).toBe(expected);
    });
});
