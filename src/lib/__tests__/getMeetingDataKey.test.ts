/** @jest-environment node */

/**
 * getMeetingDataCore coalesces concurrent fetches of one meeting. The key
 * carries the edit access of the caller, so a reader never takes a draft
 * that an editor's fetch returned. The access is the meeting's (#828): the
 * admin of the meeting's body is an editor of it, not of the city.
 */
const mockHasRight = jest.fn();
const mockGetAllCityIds = jest.fn();

jest.mock('@/lib/auth', () => ({ hasRight: (...args: unknown[]) => mockHasRight(...args) }));
jest.mock('@/lib/realm.server', () => ({ getRealm: async () => 'gr' }));
jest.mock('@/lib/cache/queries', () => ({
    getAllCityIdsCached: (...args: unknown[]) => mockGetAllCityIds(...args),
    getPeopleForCityCached: jest.fn(), getPartiesForCityCached: jest.fn(), getSubjectsForMeetingCached: jest.fn(), getSubjectStatisticsCached: jest.fn(),
}));
jest.mock('@/lib/cache', () => ({ createCache: () => ({ get: jest.fn(), set: jest.fn() }) }));
jest.mock('@/lib/db/meetings', () => ({ getCouncilMeeting: jest.fn() }));
jest.mock('@/lib/db/transcript', () => ({ getTranscript: jest.fn() }));
jest.mock('@/lib/db/cities', () => ({ getCity: jest.fn() }));
jest.mock('@/lib/db/highlights', () => ({ getHighlightsForMeeting: jest.fn() }));
jest.mock('@/lib/db/sharing/publicContent', () => ({ meetingTranscriptIsPublic: jest.fn() }));
jest.mock('@/lib/db/tasks', () => ({ getMeetingTaskStatus: jest.fn() }));
jest.mock('@/lib/db/meetingLifecycle', () => ({ originalScheduledDate: jest.fn() }));
jest.mock('@/lib/meetingPublic', () => ({ hideLinks: jest.fn() }));

import { getMeetingDataCore } from '../getMeetingData';

beforeEach(() => {
    jest.clearAllMocks();
    // The city check is the first step of the fetch; failing it ends the fetch
    // right after the key is built.
    mockGetAllCityIds.mockResolvedValue([]);
});

describe('getMeetingDataCore', () => {
    it("keys the fetch by the caller's access to the meeting, not to the city", async () => {
        mockHasRight.mockResolvedValue(false);
        await expect(getMeetingDataCore('chania', 'nov14')).rejects.toThrow('Required data not found');
        expect(mockHasRight).toHaveBeenCalledWith('drafts.read', { cityId: 'chania', councilMeetingId: 'nov14' });
    });

    it('gives an editor and a reader of one meeting separate fetches', async () => {
        mockHasRight.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await Promise.allSettled([getMeetingDataCore('chania', 'nov14'), getMeetingDataCore('chania', 'nov14')]);
        expect(mockGetAllCityIds).toHaveBeenCalledTimes(2);
    });

    it('coalesces two readers of one meeting', async () => {
        mockHasRight.mockResolvedValue(false);
        await Promise.allSettled([getMeetingDataCore('chania', 'nov14'), getMeetingDataCore('chania', 'nov14')]);
        expect(mockGetAllCityIds).toHaveBeenCalledTimes(1);
    });
});
